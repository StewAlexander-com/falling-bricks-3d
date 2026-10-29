import * as C from './config';

export type RGB = [number, number, number];

/** Which mechanic takes over after level 3. `classic` is the original game. */
export type Variant = 'classic' | 'drift' | 'split' | 'formation';
export const VARIANTS: readonly Variant[] = ['classic', 'drift', 'split', 'formation'];

export interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  spdNorm: number;
  color: RGB;
  nearMissChecked: boolean;
  /** Sideways speed; bricks bounce off the rails. */
  vx: number;
  /** Height at which a cracked brick bursts into two shards. */
  splitY: number | null;
  /** Sideways speed each shard flies apart at. */
  shardSpeed: number;
}

export type SimEvent =
  | { type: 'level'; level: number; tierUp: boolean }
  | { type: 'wave' }
  | { type: 'formation'; name: string }
  | { type: 'split'; x: number; y: number; color: RGB }
  | { type: 'nearMiss'; x: number; y: number }
  | { type: 'death'; x: number; y: number; color: RGB };

export type SimMode = 'demo' | 'play' | 'dead';

interface Span { x: number; w: number }
interface Placed { x: number; y: number; w: number; h: number }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const PALETTES = C.BRICK_PALETTES.map(([base]) => hexToRgb(base));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** Linear per-level escalation from `start`, stopping at `cap` (which may be below start). */
function ramp([start, per, cap]: readonly [number, number, number], stage: number) {
  const v = start + per * (stage - 1);
  return per >= 0 ? Math.min(v, cap) : Math.max(v, cap);
}

/** Position of a centre moving at vx between the rails, bouncing elastically. */
function bounceX(x0: number, vx: number, t: number, w: number) {
  const lo = w / 2;
  const span = C.FIELD_W - w;
  if (span <= 0 || vx === 0) return x0;
  const period = span * 2;
  let u = (x0 - lo + vx * t) % period;
  if (u < 0) u += period;
  return lo + (u <= span ? u : period - u);
}

const shardX = (cx: number, dir: number) => clamp(cx + (dir * C.SHARD_W) / 2, C.SHARD_W / 2, C.FIELD_W - C.SHARD_W / 2);

/** Where a brick (and, once it has burst, its two shards) will be after t seconds. */
function predict(b: Brick, t: number, out: Placed[]) {
  const y = b.y - b.speed * t;
  if (b.splitY !== null && y < b.splitY) {
    const tSplit = (b.y - b.splitY) / b.speed;
    const cx = bounceX(b.x, b.vx, tSplit, b.w);
    for (const dir of [-1, 1]) out.push({ x: bounceX(shardX(cx, dir), dir * b.shardSpeed, t - tSplit, C.SHARD_W), y, w: C.SHARD_W, h: b.h });
    return;
  }
  out.push({ x: bounceX(b.x, b.vx, t, b.w), y, w: b.w, h: b.h });
}

/**
 * How a person might misread a brick: speed off by up to ±12% and sideways
 * motion off by up to ±30%, consistently for the same brick.
 */
function misjudge(b: Brick): Brick {
  const h1 = Math.sin(b.id * 12.9898) * 43758.5453;
  const h2 = Math.sin(b.id * 78.233) * 12345.6789;
  const e1 = (h1 - Math.floor(h1)) * 2 - 1;
  const e2 = (h2 - Math.floor(h2)) * 2 - 1;
  return { ...b, speed: b.speed * (1 + e1 * 0.12), vx: b.vx * (1 + e2 * 0.3), shardSpeed: b.shardSpeed * (1 + e2 * 0.3) };
}

function clearTwist(b: Brick) {
  b.vx = 0;
  b.splitY = null;
  b.shardSpeed = 0;
}

const FORMATIONS: { name: string; unlock: number; rows: (n: number) => number[][] }[] = [
  {
    // Two gaps per row that flip from one side to the other.
    name: 'Slalom',
    unlock: 1,
    rows: (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? [48, 150] : [240, 342])),
  },
  {
    // Gaps start at the walls and close in on the centre.
    name: 'Funnel',
    unlock: 2,
    rows: (n) =>
      Array.from({ length: n }, (_, i) => {
        const k = n > 1 ? i / (n - 1) : 1;
        const off = 150 * (1 - k) + 46 * k;
        return [195 - off, 195 + off];
      }),
  },
  {
    // Both gaps march across the field one step per row.
    name: 'Staircase',
    unlock: 3,
    rows: (n) => Array.from({ length: n }, (_, i) => [45 + ((i * 62) % 150), 45 + ((i * 62) % 150) + 200]),
  },
  {
    // Edges, then centre, then edges: punishes camping in either.
    name: 'Zipper',
    unlock: 4,
    rows: (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? [42, 348] : [150, 240])),
  },
];

export class Sim {
  mode: SimMode = 'demo';
  variant: Variant = 'classic';
  /** Lets the autopilot play a real game (for playtests and the title screen). */
  autopilot = false;
  /** Testing shortcut: begin a game as if this level had been reached. */
  startLevel = 1;
  bricks: Brick[] = [];
  events: SimEvent[] = [];
  ballX = C.FIELD_W / 2;
  /** Horizontal velocity of the ball this step, for the rolling animation. */
  ballVX = 0;
  score = 0;
  level = 1;
  t = 0;
  /** Smallest open corridor seen in the ball's row this game, for fairness checks. */
  minRowGap = Infinity;

  private lastMilestone = 0;
  private boost = 1;
  private nextRandomT = 0;
  private nextId = 1;
  private demoTarget = C.FIELD_W / 2;
  private nextPlanT = 0;
  private nextFormationT = Infinity;
  private campX = C.FIELD_W / 2;
  private campT = 0;
  private formationLock = 0;
  private buf: Placed[] = [];

  get tier() { return Math.floor(this.level / C.ERRATIC_INTERVAL); }
  /** 0 until the post-level-3 mechanic kicks in, then 1, 2, 3… per level. */
  get stage() { return this.variant === 'classic' ? 0 : Math.max(0, this.level - C.TWIST_START_LEVEL + 1); }

  reset(mode: SimMode) {
    this.mode = mode;
    this.bricks = [];
    this.events = [];
    this.ballX = C.FIELD_W / 2;
    this.ballVX = 0;
    const start = mode === 'demo' ? 5 : this.startLevel;
    this.level = start;
    this.score = mode === 'demo' ? 0 : (start - 1) * C.SCORE_PER_LEVEL;
    this.t = 0;
    this.lastMilestone = mode === 'demo' ? 0 : start - 1;
    this.boost = mode === 'demo' ? 1 : C.MILESTONE_BOOST ** (start - 1);
    this.nextRandomT = C.FIRST_RANDOM_DELAY;
    this.nextPlanT = 0;
    this.nextFormationT = Infinity;
    this.formationLock = 0;
    this.campX = this.ballX;
    this.campT = 0;
    this.minRowGap = Infinity;
    this.demoTarget = this.ballX;
    this.generateWave();
  }

  /** Move the ball toward an absolute x; the original snapped straight to the finger. */
  setBallX(x: number) {
    if (this.mode !== 'play') return;
    this.ballX = clamp(x, C.BALL_RADIUS, C.FIELD_W - C.BALL_RADIUS);
  }

  update(dt: number) {
    const steps = Math.max(1, Math.ceil(dt / C.SIM_MAX_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
  }

  private step(dt: number) {
    const prevX = this.ballX;
    this.t += dt;

    if (this.mode === 'dead') {
      for (const b of this.bricks) b.y -= b.speed * dt;
      return;
    }

    if (this.mode === 'play') {
      this.score += dt;
      this.checkMilestone();
      this.trackCamping(dt);
    }
    if (this.mode === 'demo' || this.autopilot) this.autoSteer(dt);

    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const b = this.bricks[i];
      b.y -= b.speed * dt;
      if (b.vx) this.moveSideways(b, dt);
      if (b.y < -C.BRICK_H) {
        this.bricks.splice(i, 1);
        continue;
      }
      if (b.splitY !== null && b.y < b.splitY) {
        this.burst(b, i);
        continue;
      }
      if (this.mode !== 'play') continue;
      if (this.collides(b)) {
        this.mode = 'dead';
        this.events.push({ type: 'death', x: this.ballX, y: C.BALL_Y, color: b.color });
        return;
      }
      this.checkNearMiss(b);
    }
    if (this.mode === 'play') this.trackRowGap();

    if (this.variant === 'formation') this.updateFormations();
    if (this.t >= this.nextRandomT) this.addRandomBrick();

    if (this.bricks.length === 0) {
      this.generateWave();
      this.events.push({ type: 'wave' });
    }

    this.ballVX = (this.ballX - prevX) / dt;
  }

  private moveSideways(b: Brick, dt: number) {
    b.x += b.vx * dt;
    if (b.x < b.w / 2) { b.x = b.w - b.x; b.vx = Math.abs(b.vx); }
    if (b.x > C.FIELD_W - b.w / 2) { b.x = 2 * (C.FIELD_W - b.w / 2) - b.x; b.vx = -Math.abs(b.vx); }
  }

  private burst(b: Brick, index: number) {
    const shards = [-1, 1].map((dir): Brick => ({
      ...b,
      id: this.nextId++,
      x: shardX(b.x, dir),
      w: C.SHARD_W,
      vx: dir * b.shardSpeed,
      splitY: null,
      shardSpeed: 0,
      nearMissChecked: false,
    }));
    this.bricks.splice(index, 1, ...shards);
    this.events.push({ type: 'split', x: b.x, y: b.y, color: b.color });
  }

  // ── Difficulty (identical curves to the original) ─────────────────────────

  baseSpeed() {
    const levelSpeed = C.SPEED_BASE + this.level * C.SPEED_PER_LEVEL;
    const timeBonus = 1 + Math.min(this.score / 600, 0.35);
    return Math.min(C.SPEED_CAP, levelSpeed * this.boost * timeBonus);
  }

  private brickSpeed(base = this.baseSpeed()) {
    const tier = this.tier;
    if (tier === 0) return base;
    const frac = Math.min(C.ERRATIC_BASE_FRAC + (tier - 1) * C.ERRATIC_GROWTH, C.ERRATIC_MAX_FRAC);
    const speed = base * (1 + rand(-frac, frac) + frac * 0.15);
    return clamp(speed, C.SPEED_FLOOR, C.SPEED_CAP);
  }

  private entryDelay() {
    let base = C.ENTRY_MAX_DELAY * C.ENTRY_SPEED_FACTOR ** (this.level - 1);
    base = Math.max(C.ENTRY_MIN_DELAY, base * Math.max(0.8, 1 - this.score / 1500));
    return rand(base * 0.5, base * 1.5);
  }

  private numBricks() {
    if (this.level <= 3) return randInt(C.BRICK_MIN_EARLY, C.BRICK_MAX_EARLY);
    const lo = this.level + this.tier;
    return Math.min(randInt(lo, lo + 2), C.BRICK_COUNT_CAP);
  }

  private checkMilestone() {
    const current = Math.floor(this.score / C.SCORE_PER_LEVEL);
    if (current <= this.lastMilestone) return;
    const prevTier = this.tier;
    this.lastMilestone = current;
    this.boost *= C.MILESTONE_BOOST;
    this.level += 1;
    this.events.push({ type: 'level', level: this.level, tierUp: this.tier > prevTier });
  }

  // ── Bricks ────────────────────────────────────────────────────────────────

  /**
   * Width of one random brick. Uniform until level 3, then spreading wider
   * each level, so a late wave is a mix of heavy slabs and light chips.
   */
  private brickWidth() {
    const stage = this.level - C.SIZE_VAR_START_LEVEL + 1;
    if (stage <= 0) return C.BRICK_W;
    const v = ramp(C.BRICK_SIZE_VAR, stage);
    return C.BRICK_W * (1 + rand(-v, v));
  }

  /**
   * Heavier bricks come down harder. Applied where a width is drawn at random,
   * never to formations, whose rows must all fall at one speed to hold shape.
   */
  private heftSpeed(speed: number, w: number) {
    return clamp(speed * (1 + (w / C.BRICK_W - 1) * C.BRICK_HEFT_SPEED), C.SPEED_FLOOR, C.SPEED_CAP);
  }

  private makeBrick(x: number, y: number, speed: number, w: number = C.BRICK_W): Brick {
    const base = this.baseSpeed();
    const spdNorm = clamp((speed - base * 0.7) / (C.SPEED_CAP - base * 0.7), 0, 1);
    // Clamped so a thin formation sliver or a shard stays a sensible shape.
    const heft = clamp(w / C.BRICK_W, 0.6, 1.4);
    const h = (C.BRICK_H + Math.floor(spdNorm * C.BRICK_MAX_EXTRA_H)) * (1 + (heft - 1) * C.BRICK_HEFT_H);

    let [r, g, b] = PALETTES[(this.level - 1) % PALETTES.length];
    const heat = Math.min(Math.min(this.tier * 0.09, 0.36) + spdNorm * 0.22, 0.5);
    if (heat > 0.01) {
      r = Math.min(1, r + heat);
      g = Math.max(0, g - heat * 0.45);
      b = Math.max(0, b - heat * 0.7);
    }
    if (speed < base * 0.88) {
      const cool = ((base - speed) / base) * 0.3;
      r = Math.max(0, r - cool * 0.6);
      g = Math.max(0, g - cool * 0.2);
      b = Math.min(1, b + cool * 0.5);
    }
    return { id: this.nextId++, x, y, w, h, speed, spdNorm, color: [r, g, b], nearMissChecked: false, vx: 0, splitY: null, shardSpeed: 0 };
  }

  private generateWave() {
    this.bricks = [];
    const stage = this.stage;
    const n = this.numBricks();
    const base = this.baseSpeed();

    // Half-brick steps from wall to wall, so both edges can be covered.
    const candidates: number[] = [];
    const slots = Math.floor((C.FIELD_W - C.BRICK_W) / (C.BRICK_W / 2));
    for (let i = 0; i <= slots; i++) candidates.push(C.BRICK_W / 2 + (i * (C.FIELD_W - C.BRICK_W)) / slots);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    // Width is drawn before the position so a wide brick can be kept off the
    // rails and spaced against its neighbours by what it actually measures.
    const selected: { x: number; w: number }[] = [];
    for (const cx of candidates) {
      const w = this.brickWidth();
      const x = clamp(cx, w / 2, C.FIELD_W - w / 2);
      if (selected.every((p) => Math.abs(x - p.x) >= (w + p.w) * 0.6)) selected.push({ x, w });
      if (selected.length === n) break;
    }

    let vOff = 0;
    selected.forEach((s, i) => {
      const speed = this.heftSpeed(this.brickSpeed(base), s.w);
      this.bricks.push(this.makeBrick(s.x, C.FIELD_H + C.BRICK_H + vOff, speed, s.w));
      vOff = i % 2 === 0 ? 40 : 0;
    });
    this.ensureSafePassage();

    if (stage > 0) {
      const before = this.minGaps(this.bricks);
      for (const b of this.bricks) {
        if (!this.applyTwist(b, stage)) continue;
        if (this.minGaps(this.bricks) < Math.min(C.MIN_SAFE_GAPS, before)) clearTwist(b);
      }
    }
  }

  /** Give a brick this mode's special behaviour, by chance. Returns true if it changed. */
  private applyTwist(b: Brick, stage: number) {
    if (this.variant === 'drift' && Math.random() < ramp(C.DRIFT_CHANCE, stage)) {
      b.vx = (Math.random() < 0.5 ? -1 : 1) * ramp(C.DRIFT_SPEED, stage) * rand(0.7, 1.15);
      return true;
    }
    if (this.variant === 'split' && Math.random() < ramp(C.SPLIT_CHANCE, stage)) {
      const minY = C.BALL_Y + b.h + C.BALL_RADIUS + b.speed * ramp(C.SPLIT_MIN_WARNING, stage);
      const splitY = Math.max(minY, C.FIELD_H * ramp(C.SPLIT_HEIGHT, stage) * rand(0.92, 1.08));
      if (splitY > b.y - C.BRICK_H) return false;
      b.splitY = splitY;
      b.shardSpeed = ramp(C.SPLIT_SHARD_SPEED, stage) * rand(0.85, 1.15);
      return true;
    }
    return false;
  }

  /**
   * Formations run on a timer. When one is due, random spawns stop so the
   * field thins out (a short breather), then the formation drops in as soon
   * as it can do so without closing the ball's row.
   */
  private updateFormations() {
    const stage = this.stage;
    if (stage === 0) return;
    if (this.nextFormationT === Infinity) this.nextFormationT = this.t + ramp(C.FORMATION_EVERY, stage) * 0.5;
    if (this.t < this.nextFormationT) return;
    this.formationLock = Math.max(this.formationLock, this.t + 0.1);
    if (this.bricks.some((b) => b.y > C.FIELD_H * 0.55)) return;
    const formation = this.buildFormation(stage);
    if (this.minGaps([...this.bricks, ...formation.bricks]) < C.MIN_SAFE_GAPS) return;
    this.bricks.push(...formation.bricks);
    const last = formation.bricks.reduce((m, b) => Math.max(m, b.y), 0);
    this.formationLock = this.t + (last - C.FIELD_H * 0.5) / formation.bricks[0].speed;
    this.nextFormationT = this.formationLock + ramp(C.FORMATION_EVERY, stage);
    this.events.push({ type: 'formation', name: formation.name });
  }

  /**
   * Rows of bricks with exactly two corridors each, spaced in time so a
   * keyboard player at full speed can always get from one row's gaps to the
   * next. Every brick in a formation falls at the same speed to keep its shape.
   */
  private buildFormation(stage: number): { name: string; bricks: Brick[] } {
    const options = FORMATIONS.filter((f) => f.unlock <= stage);
    const f = pick(options);
    const rows = Math.round(ramp(C.FORMATION_ROWS, stage));
    const speed = Math.min(C.SPEED_CAP, this.baseSpeed() * 1.05);
    const rowTime = ramp(C.FORMATION_ROW_TIME, stage);
    const mirror = Math.random() < 0.5;
    const half = C.FORMATION_GAP / 2;
    const bricks: Brick[] = [];

    f.rows(rows).forEach((gaps, r) => {
      const y = C.FIELD_H + C.BRICK_H + r * Math.max(speed * rowTime, C.BRICK_H * 2.4);
      const centers = gaps.map((g) => (mirror ? C.FIELD_W - g : g)).sort((a, b) => a - b);
      let left = 0;
      for (const c of [...centers, C.FIELD_W + half]) {
        const right = Math.min(c - half, C.FIELD_W);
        const len = right - left;
        if (len >= 18) {
          const count = Math.max(1, Math.round(len / C.BRICK_W));
          const w = len / count;
          for (let k = 0; k < count; k++) bricks.push(this.makeBrick(left + w * (k + 0.5), y, speed, w - 3));
        }
        left = c + half;
      }
    });
    return { name: f.name, bricks };
  }

  /**
   * The original README promised random spawns were checked for solvability,
   * but the code never did it. Here a candidate is accepted only if, at every
   * moment it is in the ball's row, at least MIN_SAFE_GAPS corridors remain.
   * Paths are predicted, so sideways drift and splits are accounted for.
   */
  private addRandomBrick() {
    if (this.bricks.length >= C.MAX_LIVE_BRICKS || this.t < this.formationLock) {
      this.nextRandomT = this.t + C.BLOCKED_SPAWN_RETRY;
      return;
    }
    const base = Math.min(C.SPEED_CAP, this.brickSpeed() * C.RANDOM_BRICK_SPEED_MULT);
    const stage = this.stage;
    const before = stage > 0 ? this.minGaps(this.bricks) : C.MIN_SAFE_GAPS;
    for (let attempt = 0; attempt < 10; attempt++) {
      const aimed = this.mode === 'play' && this.campT >= C.CAMP_TIME && attempt < 6;
      const w = this.brickWidth();
      const speed = this.heftSpeed(base, w);
      const x = aimed ? clamp(this.ballX + rand(-20, 20), w / 2, C.FIELD_W - w / 2) : this.spawnX(w);
      const brick = this.makeBrick(x, C.FIELD_H + C.BRICK_H, speed, w);
      if (!this.placementIsSolvable(brick)) continue;
      if (stage > 0 && this.applyTwist(brick, stage) && this.minGaps([...this.bricks, brick]) < Math.min(C.MIN_SAFE_GAPS, before)) clearTwist(brick);
      this.bricks.push(brick);
      if (aimed) this.campT = C.CAMP_TIME * 0.5;
      this.nextRandomT = this.t + this.entryDelay();
      return;
    }
    this.nextRandomT = this.t + C.BLOCKED_SPAWN_RETRY;
  }

  /**
   * Picks the spot to threaten uniformly across the ball's whole range, then
   * places the brick over it. Clamping at the rails gives the strips along the
   * walls the same chance of being hit as the middle.
   */
  private spawnX(w = C.BRICK_W) {
    const target = rand(C.BALL_RADIUS, C.FIELD_W - C.BALL_RADIUS);
    return clamp(target + rand(-w / 2, w / 2), w / 2, C.FIELD_W - w / 2);
  }

  private trackCamping(dt: number) {
    if (Math.abs(this.ballX - this.campX) > C.CAMP_RADIUS) {
      this.campX = this.ballX;
      this.campT = 0;
    } else {
      this.campT += dt;
    }
  }

  private placementIsSolvable(nb: Brick) {
    if (this.stage > 0) return this.minGaps([...this.bricks, nb]) >= Math.min(C.MIN_SAFE_GAPS, this.minGaps(this.bricks));
    const tArrive = (nb.y - C.BALL_Y) / nb.speed;
    const row: Span[] = [{ x: nb.x, w: nb.w }];
    for (const b of this.bricks) {
      const yAt = b.y - b.speed * tArrive;
      if (Math.abs(yAt - C.BALL_Y) < (b.h + nb.h) / 2 + C.BALL_RADIUS * 2) row.push(b);
    }
    return this.countGaps(row) >= C.MIN_SAFE_GAPS;
  }

  /** Fewest corridors open in the ball's row at any moment from now until these bricks pass. */
  minGaps(bricks: ReadonlyArray<Brick>) {
    let horizon = 0;
    for (const b of bricks) horizon = Math.max(horizon, (b.y - C.BALL_Y + b.h + C.BALL_RADIUS) / b.speed);
    horizon = Math.min(horizon, C.PREDICT_HORIZON);
    let fewest = Infinity;
    const row: Span[] = [];
    for (let t = 0; t <= horizon; t += C.PREDICT_STEP) {
      this.buf.length = 0;
      for (const b of bricks) predict(b, t, this.buf);
      row.length = 0;
      for (const p of this.buf) if (Math.abs(p.y - C.BALL_Y) < p.h / 2 + C.BALL_RADIUS + 10) row.push(p);
      if (!row.length) continue;
      fewest = Math.min(fewest, this.countGaps(row));
      if (fewest === 0) break;
    }
    return fewest;
  }

  private ensureSafePassage() {
    for (let i = 0; i < 14; i++) {
      if (this.bricks.length <= 1 || this.countGaps(this.bricks, true) >= C.MIN_SAFE_GAPS) return;
      const worst = this.findMostCrowded();
      if (!worst) return;
      this.bricks.splice(this.bricks.indexOf(worst), 1);
    }
  }

  /**
   * Corridors the ball fits through. A wide opening holds several, otherwise a
   * lone brick against a wall looks like it closes the field and the walls are
   * never covered. `openings` counts each opening once instead, which keeps
   * the opening waves as sparse as the original game's.
   */
  private countGaps(spans: ReadonlyArray<Span>, openings = false) {
    const sorted = [...spans].sort((a, b) => a.x - b.x);
    let count = 0;
    let prevR = 0;
    const fits = (w: number) => (openings ? (w >= C.SAFE_GAP ? 1 : 0) : Math.max(0, Math.floor(w / C.SAFE_GAP)));
    for (const s of sorted) {
      count += fits(s.x - s.w / 2 - prevR);
      prevR = Math.max(prevR, s.x + s.w / 2);
    }
    count += fits(C.FIELD_W - prevR);
    return count;
  }

  private trackRowGap() {
    const row = this.bricks.filter((b) => Math.abs(b.y - C.BALL_Y) < b.h / 2 + C.BALL_RADIUS);
    if (!row.length) return;
    row.sort((a, b) => a.x - b.x);
    let prevR = 0;
    let widest = 0;
    for (const s of row) {
      widest = Math.max(widest, s.x - s.w / 2 - prevR);
      prevR = Math.max(prevR, s.x + s.w / 2);
    }
    widest = Math.max(widest, C.FIELD_W - prevR);
    this.minRowGap = Math.min(this.minRowGap, widest);
  }

  private findMostCrowded() {
    const sorted = [...this.bricks].sort((a, b) => a.x - b.x);
    let worst = Infinity;
    let worstBrick: Brick | null = null;
    sorted.forEach((b, i) => {
      const lg = i > 0 ? b.x - (sorted[i - 1].x + sorted[i - 1].w / 2) : b.x;
      const rg = i < sorted.length - 1 ? sorted[i + 1].x - sorted[i + 1].w / 2 - (b.x + b.w / 2) : C.FIELD_W - b.x;
      if (lg + rg < worst) {
        worst = lg + rg;
        worstBrick = b;
      }
    });
    return worstBrick;
  }

  // ── Collision ─────────────────────────────────────────────────────────────

  private collides(b: Placed, ballX = this.ballX, pad = 0) {
    const cx = clamp(ballX, b.x - b.w / 2, b.x + b.w / 2);
    const cy = clamp(C.BALL_Y, b.y - b.h / 2, b.y + b.h / 2);
    const dx = ballX - cx;
    const dy = C.BALL_Y - cy;
    const r = C.BALL_RADIUS + pad;
    return dx * dx + dy * dy < r * r;
  }

  private checkNearMiss(b: Brick) {
    if (b.nearMissChecked || b.y + b.h / 2 > C.BALL_Y) return;
    b.nearMissChecked = true;
    if (b.y + b.h / 2 < C.BALL_Y - C.BALL_RADIUS - 4) return;
    const edgeGap = Math.abs(this.ballX - b.x) - b.w / 2 - C.BALL_RADIUS;
    if (edgeGap >= 0 && edgeGap < C.NEAR_MISS_DIST) {
      this.events.push({ type: 'nearMiss', x: this.ballX + Math.sign(b.x - this.ballX) * C.BALL_RADIUS, y: C.BALL_Y });
    }
  }

  // ── Autopilot: title-screen attract mode and automated playtests ──────────

  /**
   * Replans ten times a second like a human with ~100 ms reaction time:
   * for each candidate x it predicts the bricks' paths, moves toward that x
   * at a human-ish top speed and keeps the target that survives longest.
   */
  private autoSteer(dt: number) {
    const human = this.autopilot;
    const maxSpeed = human ? 480 : 560;
    if (this.t >= this.nextPlanT) {
      this.nextPlanT = this.t + (human ? 0.16 : 0.1);
      const H = 1.1;
      const step = 0.03;
      const near = this.bricks.filter((b) => b.y - C.BALL_Y < b.speed * H + 60 && b.y > C.BALL_Y - 40).map((b) => (human ? misjudge(b) : b));
      let best = this.demoTarget;
      let bestScore = -Infinity;
      for (let x = C.BALL_RADIUS; x <= C.FIELD_W - C.BALL_RADIUS; x += 9) {
        let bx = this.ballX;
        let alive = H;
        for (let t = step; t <= H; t += step) {
          bx += Math.sign(x - bx) * Math.min(Math.abs(x - bx), maxSpeed * step);
          this.buf.length = 0;
          for (const b of near) predict(b, t, this.buf);
          if (this.buf.some((p) => this.collides(p, bx, 5))) { alive = t; break; }
        }
        const score = alive * 1000 - Math.abs(x - this.ballX) * 0.4 - Math.abs(x - C.FIELD_W / 2) * 0.05;
        if (score > bestScore) { bestScore = score; best = x; }
      }
      this.demoTarget = best;
    }
    const d = this.demoTarget - this.ballX;
    this.ballX += Math.sign(d) * Math.min(Math.abs(d), maxSpeed * dt);
    this.ballX = clamp(this.ballX, C.BALL_RADIUS, C.FIELD_W - C.BALL_RADIUS);
  }
}
