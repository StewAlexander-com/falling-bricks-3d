import * as C from './config';

export type RGB = [number, number, number];

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
}

export type SimEvent =
  | { type: 'level'; level: number; tierUp: boolean }
  | { type: 'wave' }
  | { type: 'nearMiss'; x: number; y: number }
  | { type: 'death'; x: number; y: number; color: RGB };

export type SimMode = 'demo' | 'play' | 'dead';

interface Span { x: number; w: number }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const PALETTES = C.BRICK_PALETTES.map(([base]) => hexToRgb(base));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));

export class Sim {
  mode: SimMode = 'demo';
  bricks: Brick[] = [];
  events: SimEvent[] = [];
  ballX = C.FIELD_W / 2;
  /** Horizontal velocity of the ball this step, for the rolling animation. */
  ballVX = 0;
  score = 0;
  level = 1;
  t = 0;

  private lastMilestone = 0;
  private boost = 1;
  private nextRandomT = 0;
  private nextId = 1;
  private demoTarget = C.FIELD_W / 2;

  get tier() { return Math.floor(this.level / C.ERRATIC_INTERVAL); }

  reset(mode: SimMode) {
    this.mode = mode;
    this.bricks = [];
    this.events = [];
    this.ballX = C.FIELD_W / 2;
    this.ballVX = 0;
    this.score = 0;
    this.level = mode === 'demo' ? 4 : 1;
    this.t = 0;
    this.lastMilestone = 0;
    this.boost = 1;
    this.nextRandomT = C.FIRST_RANDOM_DELAY;
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
    } else {
      this.demoSteer(dt);
    }

    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const b = this.bricks[i];
      b.y -= b.speed * dt;
      if (b.y < -C.BRICK_H) {
        this.bricks.splice(i, 1);
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

    if (this.t >= this.nextRandomT) this.addRandomBrick();

    if (this.bricks.length === 0) {
      this.generateWave();
      this.events.push({ type: 'wave' });
    }

    this.ballVX = (this.ballX - prevX) / dt;
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

  private makeBrick(x: number, y: number, speed: number): Brick {
    const base = this.baseSpeed();
    const spdNorm = clamp((speed - base * 0.7) / (C.SPEED_CAP - base * 0.7), 0, 1);
    const h = C.BRICK_H + Math.floor(spdNorm * C.BRICK_MAX_EXTRA_H);

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
    return { id: this.nextId++, x, y, w: C.BRICK_W, h, speed, spdNorm, color: [r, g, b], nearMissChecked: false };
  }

  private generateWave() {
    this.bricks = [];
    const n = this.numBricks();
    const base = this.baseSpeed();

    const candidates: number[] = [];
    let stagger = false;
    for (let x = C.BRICK_W / 2; x <= C.FIELD_W - C.BRICK_W / 2; x += stagger ? C.BRICK_W / 2 : C.BRICK_W) {
      candidates.push(x);
      stagger = !stagger;
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const selected: number[] = [];
    for (const x of candidates) {
      if (selected.every((p) => Math.abs(x - p) >= C.BRICK_W * 1.2)) selected.push(x);
      if (selected.length === n) break;
    }

    let vOff = 0;
    selected.forEach((x, i) => {
      this.bricks.push(this.makeBrick(x, C.FIELD_H + C.BRICK_H + vOff, this.brickSpeed(base)));
      vOff = i % 2 === 0 ? 40 : 0;
    });
    this.ensureSafePassage();
  }

  /**
   * The original README promised random spawns were checked for solvability,
   * but the code never did it. Here a candidate x is accepted only if, at the
   * moment the new brick reaches the ball's row, at least MIN_SAFE_GAPS
   * corridors remain among the bricks that will be in that row with it.
   */
  private addRandomBrick() {
    if (this.bricks.length >= C.MAX_LIVE_BRICKS) {
      this.nextRandomT = this.t + C.BLOCKED_SPAWN_RETRY;
      return;
    }
    const speed = Math.min(C.SPEED_CAP, this.brickSpeed() * C.RANDOM_BRICK_SPEED_MULT);
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = rand(C.BRICK_W / 2, C.FIELD_W - C.BRICK_W / 2);
      const brick = this.makeBrick(x, C.FIELD_H + C.BRICK_H, speed);
      if (this.placementIsSolvable(brick)) {
        this.bricks.push(brick);
        this.nextRandomT = this.t + this.entryDelay();
        return;
      }
    }
    this.nextRandomT = this.t + C.BLOCKED_SPAWN_RETRY;
  }

  private placementIsSolvable(nb: Brick) {
    const tArrive = (nb.y - C.BALL_Y) / nb.speed;
    const row: Span[] = [{ x: nb.x, w: nb.w }];
    for (const b of this.bricks) {
      const yAt = b.y - b.speed * tArrive;
      if (Math.abs(yAt - C.BALL_Y) < (b.h + nb.h) / 2 + C.BALL_RADIUS * 2) row.push(b);
    }
    return this.countGaps(row) >= C.MIN_SAFE_GAPS;
  }

  private ensureSafePassage() {
    for (let i = 0; i < 14; i++) {
      if (this.bricks.length <= 1 || this.countGaps(this.bricks) >= C.MIN_SAFE_GAPS) return;
      const worst = this.findMostCrowded();
      if (!worst) return;
      this.bricks.splice(this.bricks.indexOf(worst), 1);
    }
  }

  private countGaps(spans: ReadonlyArray<Span>) {
    const sorted = [...spans].sort((a, b) => a.x - b.x);
    let count = 0;
    let prevR = 0;
    for (const s of sorted) {
      if (s.x - s.w / 2 - prevR >= C.SAFE_GAP) count++;
      prevR = Math.max(prevR, s.x + s.w / 2);
    }
    if (C.FIELD_W - prevR >= C.SAFE_GAP) count++;
    return count;
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

  private collides(b: Brick) {
    const cx = clamp(this.ballX, b.x - b.w / 2, b.x + b.w / 2);
    const cy = clamp(C.BALL_Y, b.y - b.h / 2, b.y + b.h / 2);
    const dx = this.ballX - cx;
    const dy = C.BALL_Y - cy;
    return dx * dx + dy * dy < C.BALL_RADIUS * C.BALL_RADIUS;
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

  // ── Attract-mode autopilot for the title screen ───────────────────────────

  private demoSteer(dt: number) {
    const threats = this.bricks.filter((b) => b.y - C.BALL_Y < 260 && b.y > C.BALL_Y - 30);
    const blocked = threats.some((b) => Math.abs(b.x - this.demoTarget) < b.w / 2 + C.BALL_RADIUS + 6);
    if (blocked) {
      const spans = [...threats].sort((a, b) => a.x - b.x);
      let best = this.demoTarget;
      let bestDist = Infinity;
      let prevR = 0;
      for (const s of [...spans, { x: C.FIELD_W + 1000, w: 0 } as Span]) {
        const left = Math.min(s.x - s.w / 2, C.FIELD_W);
        if (left - prevR >= C.BALL_RADIUS * 2 + 12) {
          const mid = (prevR + left) / 2;
          if (Math.abs(mid - this.ballX) < bestDist) {
            bestDist = Math.abs(mid - this.ballX);
            best = mid;
          }
        }
        prevR = Math.max(prevR, s.x + s.w / 2);
      }
      this.demoTarget = best;
    }
    const d = this.demoTarget - this.ballX;
    this.ballX += Math.sign(d) * Math.min(Math.abs(d), 420 * dt);
    this.ballX = clamp(this.ballX, C.BALL_RADIUS, C.FIELD_W - C.BALL_RADIUS);
  }
}
