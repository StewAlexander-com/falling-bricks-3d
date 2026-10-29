import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as C from './config';
import { VIEW, VIEW_BOTTOM, VIEW_TOP, fitCamera } from './camera';
import type { RGB, Sim } from './sim';

export type Quality = 'high' | 'medium' | 'low';

const MAX_BRICKS = 40;
const MAX_PARTS = 120;
const TRAIL_LEN = 6;
const WALL_Z = -34;
const GRAVITY = -1100;

const QUALITY: Record<Quality, { dpr: number; shadow: number }> = {
  high: { dpr: 2, shadow: 1024 },
  medium: { dpr: 1.5, shadow: 512 },
  low: { dpr: 1, shadow: 0 },
};

const toX = (simX: number) => simX - C.FIELD_W / 2;

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#7fc0ff');
  grad.addColorStop(0.5, '#2f7bff');
  grad.addColorStop(1, '#1440a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 60, 256, 8);
  for (const u of [0, 64, 128, 192]) g.fillRect(u - 3, 0, 6, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical gradient plane: white at the bottom fading to black, for additive speed streaks. */
function streakGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.pow(1 - (pos.getY(i) + 0.5), 1.6);
    colors.set([k, k, k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(0, 0.5, 0);
  return geo;
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  quality: Quality;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 10, 6000);
  private camBase = new THREE.Vector3();
  private worldPerPx = 1;
  private insets = { top: 0, bottom: 0 };

  private bricks: THREE.InstancedMesh;
  private streaks: THREE.InstancedMesh;
  private ball: THREE.Mesh;
  private ballGlow: THREE.Sprite;
  private ballLight: THREE.PointLight;
  private trail: THREE.Mesh[] = [];
  private trailHist: { x: number; t: number }[] = [];
  private key: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;

  private parts: THREE.InstancedMesh;
  private p = {
    pos: new Float32Array(MAX_PARTS * 3),
    vel: new Float32Array(MAX_PARTS * 3),
    rot: new Float32Array(MAX_PARTS * 3),
    spin: new Float32Array(MAX_PARTS * 3),
    life: new Float32Array(MAX_PARTS),
    max: new Float32Array(MAX_PARTS),
    size: new Float32Array(MAX_PARTS),
    next: 0,
  };

  private shake = 0;
  private flash = 0;
  private ballSpin = 0;
  private trailFade = 0;
  private time = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private white = new THREE.Color(1.6, 1.6, 1.6);
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.gl.toneMapping = THREE.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
    this.scene.background = new THREE.Color('#05060d');

    this.hemi = new THREE.HemisphereLight('#a9b8ff', '#1b1030', 0.9);
    this.scene.add(this.hemi);

    // Nearly frontal so each brick's shadow hugs it instead of reading as a second brick.
    this.key = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.key.position.set(-0.2 * 1600, C.FIELD_H / 2 + 0.3 * 1600, 1600);
    this.key.target.position.set(0, C.FIELD_H / 2, 0);
    const sc = this.key.shadow.camera;
    sc.left = -C.FIELD_W / 2 - 120;
    sc.right = C.FIELD_W / 2 + 120;
    sc.top = C.FIELD_H / 2 + 200;
    sc.bottom = -C.FIELD_H / 2 - 160;
    sc.near = 1000;
    sc.far = 2400;
    this.key.shadow.bias = -0.0008;
    this.key.shadow.normalBias = 1.5;
    this.scene.add(this.key, this.key.target);

    // The camera sits off to one side, so the faces it sees most are the ones
    // the key light misses. A dim cool fill from that side keeps them from
    // going flat black and is what makes the bricks read as solid.
    const rim = new THREE.DirectionalLight('#9ec2ff', 1.1);
    rim.position.set(1500, C.FIELD_H / 2 + 400, 620);
    rim.target.position.set(0, C.FIELD_H / 2, 0);
    this.scene.add(rim, rim.target);

    this.buildWorld();

    const brickGeo = new RoundedBoxGeometry(C.BRICK_W, C.BRICK_H, C.BRICK_DEPTH, 3, 4.5);
    const brickMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0 });
    // Bricks are partly self-lit by their own instance colour, so hot (fast)
    // bricks, whose colour is boosted above 1, glow and stay readable on the dark wall.
    brickMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * 0.22;',
      );
    };
    this.bricks = new THREE.InstancedMesh(brickGeo, brickMat, MAX_BRICKS);
    this.bricks.castShadow = true;
    this.bricks.frustumCulled = false;
    this.bricks.setColorAt(0, this.col.set(1, 1, 1));
    this.bricks.count = 0;
    this.scene.add(this.bricks);

    const streakMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.streaks = new THREE.InstancedMesh(streakGeometry(), streakMat, MAX_BRICKS);
    this.streaks.frustumCulled = false;
    this.streaks.setColorAt(0, this.col.set(0, 0, 0));
    this.streaks.count = 0;
    this.scene.add(this.streaks);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(C.BALL_RADIUS, 40, 24),
      new THREE.MeshStandardMaterial({
        map: ballTexture(),
        roughness: 0.16,
        metalness: 0.25,
        emissive: '#1a4dff',
        emissiveIntensity: 0.35,
      }),
    );
    this.ball.castShadow = true;
    this.ball.position.set(0, C.BALL_Y, 0);
    this.scene.add(this.ball);

    this.ballGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: '#3f8cff',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.ballGlow.scale.setScalar(C.BALL_RADIUS * 6);
    this.scene.add(this.ballGlow);

    this.ballLight = new THREE.PointLight('#4b8dff', 3, 340, 0);
    this.scene.add(this.ballLight);

    const trailGeo = new THREE.SphereGeometry(C.BALL_RADIUS, 16, 12);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const mesh = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: '#3b7dff',
          transparent: true,
          opacity: 0.22 * (1 - i / TRAIL_LEN),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.scale.setScalar(0.92 - i * 0.1);
      mesh.position.z = -2 - i;
      this.trail.push(mesh);
      this.scene.add(mesh);
    }

    this.parts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.15 }),
      MAX_PARTS,
    );
    this.parts.frustumCulled = false;
    this.parts.setColorAt(0, this.col.set(1, 1, 1));
    this.parts.count = MAX_PARTS;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTS; i++) this.parts.setMatrixAt(i, this.m);
    this.scene.add(this.parts);

    this.applyQuality();
  }

  private buildWorld() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(`${import.meta.env.BASE_URL}img/wall.webp`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const wallW = 7000;
    const wallH = 4200;
    tex.repeat.set(wallW / 420, wallH / 560);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, wallH),
      new THREE.MeshStandardMaterial({ map: tex, color: '#c4ccff', roughness: 0.9, metalness: 0, emissive: '#0c1030' }),
    );
    wall.position.set(0, C.FIELD_H / 2, WALL_Z);
    wall.receiveShadow = true;
    this.scene.add(wall);

    // Cool wash from the top of the shaft, where the bricks come from.
    const topLight = new THREE.PointLight('#7a6bff', 2.2, 900, 0);
    topLight.position.set(0, C.FIELD_H + 60, 120);
    this.scene.add(topLight);

    // Glowing rails and floor line frame the playfield on wide screens.
    const railMat = new THREE.MeshStandardMaterial({
      color: '#1d2340',
      emissive: '#5b6cff',
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.6,
    });
    const railH = VIEW_TOP - VIEW_BOTTOM + 400;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(6, railH, 18), railMat);
      rail.position.set(side * (C.FIELD_W / 2 + 5), (VIEW_TOP + VIEW_BOTTOM) / 2, -6);
      rail.receiveShadow = true;
      this.scene.add(rail);
    }
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(C.FIELD_W + 16, 4, 30),
      new THREE.MeshStandardMaterial({ color: '#2a1030', emissive: '#ff3d6e', emissiveIntensity: 0.9 }),
    );
    floor.position.set(0, -6, -4);
    this.scene.add(floor);
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
  }

  private applyQuality() {
    const cfg = QUALITY[this.quality];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, cfg.dpr));
    const shadows = cfg.shadow > 0;
    this.gl.shadowMap.enabled = shadows;
    this.key.castShadow = shadows;
    if (shadows) {
      this.key.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mat.needsUpdate = true;
    });
    this.resize();
  }

  /** Reserve screen space (CSS px) the HUD covers so bricks are never hidden behind it. */
  setInsets(top: number, bottom: number) {
    this.insets = { top, bottom };
    this.resize();
  }

  resize() {
    const canvas = this.gl.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    this.camera.updateProjectionMatrix();

    const ndcTop = 1 - (2 * this.insets.top) / h;
    const ndcBot = -1 + (2 * this.insets.bottom) / h;
    this.camTarget.copy(fitCamera(this.camera, ndcTop, ndcBot));
    this.camBase.copy(this.camera.position);

    // The ball's row in clip space, as a start point and a direction. Solving
    // against these turns a screen x into a position along the row exactly,
    // for any camera angle. Both are fixed until the next resize.
    const vp = this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.rowStart.set(-C.FIELD_W / 2, C.BALL_Y, 0, 1).applyMatrix4(vp);
    this.rowDir.set(C.FIELD_W, 0, 0, 0).applyMatrix4(vp);

    const a = this.v.set(-50, C.BALL_Y, 0).project(this.camera).x;
    const b = this.v.set(50, C.BALL_Y, 0).project(this.camera).x;
    this.worldPerPx = 100 / (((b - a) / 2) * w);
  }

  private camTarget = new THREE.Vector3();
  private rowStart = new THREE.Vector4();
  private rowDir = new THREE.Vector4();

  /**
   * Sim-space x on the ball's row that sits under the given client x.
   *
   * The row projects to a straight line on screen, so a point along it is
   * `start + t * dir` in clip space and its screen x is the ratio of the x and
   * w components. Setting that equal to the pointer leaves one linear equation
   * in t, which stays exact however the camera is yawed or pitched.
   */
  screenToSimX(clientX: number) {
    const rect = this.gl.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const den = this.rowDir.x - ndcX * this.rowDir.w;
    if (Math.abs(den) < 1e-9) return C.FIELD_W / 2;
    const t = (ndcX * this.rowStart.w - this.rowStart.x) / den;
    return THREE.MathUtils.clamp(t * C.FIELD_W, 0, C.FIELD_W);
  }

  get simUnitsPerPx() { return this.worldPerPx; }

  // ── Effects ───────────────────────────────────────────────────────────────

  private spawnPart(x: number, y: number, color: RGB | THREE.Color, speed: number, size: number, life: number, up = 0) {
    const i = this.p.next;
    this.p.next = (i + 1) % MAX_PARTS;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + Math.random() * 0.65);
    this.p.pos.set([toX(x), y, (Math.random() - 0.5) * 20], i * 3);
    this.p.vel.set([Math.cos(a) * s, Math.sin(a) * s + up, (Math.random() - 0.2) * s * 0.8], i * 3);
    this.p.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.p.spin.set([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], i * 3);
    this.p.life[i] = life;
    this.p.max[i] = life;
    this.p.size[i] = size * (0.6 + Math.random() * 0.8);
    if (Array.isArray(color)) this.col.setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace);
    else this.col.copy(color);
    this.parts.setColorAt(i, this.col);
  }

  death(x: number, y: number, color: RGB) {
    for (let i = 0; i < 34; i++) this.spawnPart(x, y, color, 520, 9, 1.4 + Math.random() * 0.6, 260);
    const blue = new THREE.Color('#3f8cff');
    for (let i = 0; i < 22; i++) this.spawnPart(x, y, blue, 420, 6, 1.2 + Math.random() * 0.5, 200);
    this.ball.visible = false;
    this.ballGlow.visible = false;
    this.trail.forEach((t) => (t.visible = false));
    this.shake = this.reducedMotion ? 0 : 14;
    this.flash = 1.4;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  nearMiss(x: number, y: number) {
    const c = new THREE.Color('#ffe58a');
    for (let i = 0; i < 8; i++) this.spawnPart(x, y, c, 260, 3.5, 0.35 + Math.random() * 0.2, 60);
    this.flash = Math.max(this.flash, 0.35);
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  split(x: number, y: number, color: RGB) {
    for (let i = 0; i < 14; i++) this.spawnPart(x, y, color, 300, 4, 0.45 + Math.random() * 0.25, 40);
    const c = new THREE.Color('#ffffff');
    for (let i = 0; i < 6; i++) this.spawnPart(x, y, c, 220, 2.5, 0.3, 20);
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  levelUp() {
    this.flash = Math.max(this.flash, 0.9);
  }

  resetBall() {
    this.ball.visible = true;
    this.ballGlow.visible = true;
    this.trail.forEach((t) => (t.visible = true));
    this.trailHist = [];
  }

  // ── Per-frame sync ────────────────────────────────────────────────────────

  update(sim: Sim, dt: number) {
    this.time += dt;
    this.syncBricks(sim);
    this.syncBall(sim, dt);
    this.updateParts(dt);

    this.flash = Math.max(0, this.flash - dt * 3);
    this.hemi.intensity = 0.9 + this.flash * 0.5;
    this.ballLight.intensity = 3 + this.flash * 4;

    this.shake = Math.max(0, this.shake - dt * 40);
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * this.shake,
      this.camBase.y + (Math.random() - 0.5) * this.shake,
      this.camBase.z,
    );
    this.camera.lookAt(this.camTarget);
  }

  private syncBricks(sim: Sim) {
    let n = 0;
    for (const b of sim.bricks) {
      if (n >= MAX_BRICKS) break;
      const wob = this.reducedMotion ? 0 : 1;
      // Drifters bank into their slide so the direction reads at a glance.
      const bank = THREE.MathUtils.clamp(-b.vx / 900, -0.18, 0.18);
      this.e.set(Math.sin(this.time * 1.7 + b.id) * 0.06 * wob, Math.sin(this.time * 1.1 + b.id * 1.7) * 0.1 * wob, bank);
      this.q.setFromEuler(this.e);
      // Wide bricks are deep as well as broad, so weight reads from any angle.
      const heft = b.w / C.BRICK_W;
      const depth = THREE.MathUtils.clamp(1 + (heft - 1) * C.BRICK_HEFT_DEPTH, 0.6, 1.3);
      this.m.compose(this.v.set(toX(b.x), b.y, 0), this.q, this.s.set(heft, b.h / C.BRICK_H, depth));
      this.bricks.setMatrixAt(n, this.m);
      this.col.setRGB(b.color[0], b.color[1], b.color[2], THREE.SRGBColorSpace).multiplyScalar(1 + b.spdNorm * 0.9);
      if (b.splitY !== null) {
        // Cracked bricks flicker white, faster as they near the burst height.
        const left = THREE.MathUtils.clamp((b.y - b.splitY) / (C.FIELD_H - b.splitY), 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(this.time * (8 + (1 - left) * 26) + b.id);
        this.col.lerp(this.white, 0.25 + 0.45 * pulse * (1 - left * 0.6));
      }
      this.bricks.setColorAt(n, this.col);

      const k = sim.mode === 'dead' ? 0 : THREE.MathUtils.clamp((b.speed - 250) / 300, 0, 1);
      const drift = sim.mode === 'dead' ? 0 : Math.abs(b.vx);
      const len = k > 0.02 || drift ? Math.max(k > 0.02 ? b.speed * 0.18 * (0.4 + 0.6 * k) : 0, drift ? 70 : 0) : 0;
      // Streaks trail opposite the direction of travel.
      this.q.setFromAxisAngle(this.zAxis, Math.atan2(b.vx, b.speed));
      this.m.compose(this.v.set(toX(b.x), b.y + b.h / 2 - 2, -C.BRICK_DEPTH / 2), this.q, this.s.set(b.w * 0.82, len, 1));
      this.streaks.setMatrixAt(n, this.m);
      this.col.multiplyScalar(0.25 + Math.max(k, drift ? 0.6 : 0) * 0.55);
      this.streaks.setColorAt(n, this.col);
      n++;
    }
    this.bricks.count = n;
    this.streaks.count = n;
    for (const mesh of [this.bricks, this.streaks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private syncBall(sim: Sim, dt: number) {
    const x = toX(sim.ballX);
    this.ballSpin -= (sim.ballVX * dt) / C.BALL_RADIUS;
    this.ball.position.set(x, C.BALL_Y, 0);
    this.ball.rotation.set(0.35, 0, this.ballSpin);
    this.ballGlow.position.set(x, C.BALL_Y, -8);
    this.ballLight.position.set(x, C.BALL_Y + 10, 40);

    this.trailHist.unshift({ x, t: this.time });
    while (this.trailHist.length > 64) this.trailHist.pop();
    const motion = THREE.MathUtils.clamp(Math.abs(sim.ballVX) / 700, 0, 1);
    this.trailFade += (motion - this.trailFade) * Math.min(1, dt * 12);
    for (let i = 0; i < TRAIL_LEN; i++) {
      (this.trail[i].material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - i / TRAIL_LEN) * this.trailFade;
      const target = this.time - (i + 1) * 0.022;
      const h = this.trailHist.find((e) => e.t <= target) ?? this.trailHist[this.trailHist.length - 1];
      this.trail[i].position.set(h.x, C.BALL_Y, this.trail[i].position.z);
    }
  }

  private updateParts(dt: number) {
    const p = this.p;
    let any = false;
    for (let i = 0; i < MAX_PARTS; i++) {
      if (p.life[i] <= 0) continue;
      any = true;
      p.life[i] -= dt;
      const j = i * 3;
      p.vel[j + 1] += GRAVITY * dt;
      for (let k = 0; k < 3; k++) {
        p.pos[j + k] += p.vel[j + k] * dt;
        p.rot[j + k] += p.spin[j + k] * dt;
      }
      const sz = p.life[i] > 0 ? p.size[i] * Math.min(1, (p.life[i] / p.max[i]) * 2.5) : 0;
      this.e.set(p.rot[j], p.rot[j + 1], p.rot[j + 2]);
      this.m.compose(this.v.set(p.pos[j], p.pos[j + 1], p.pos[j + 2]), this.q.setFromEuler(this.e), this.s.setScalar(sz));
      this.parts.setMatrixAt(i, this.m);
    }
    if (any) this.parts.instanceMatrix.needsUpdate = true;
  }

  render() {
    this.gl.render(this.scene, this.camera);
  }
}
