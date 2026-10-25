// Gameplay constants ported from the Pythonista Enhanced Edition.
// The original moved bricks in px/frame at 60 fps on a ~390x844 pt portrait
// screen; here everything is in world units per second on that same logical
// field, so the game plays identically at 60, 90, 120 or 144 Hz.

export const FIELD_W = 390;
export const FIELD_H = 844;

export const BALL_RADIUS = 15;
export const BALL_Y = FIELD_H * 0.12;

export const BRICK_W = 62;
export const BRICK_H = 22;
export const BRICK_DEPTH = 26;
export const BRICK_MAX_EXTRA_H = 10;

export const SCORE_PER_LEVEL = 20;

const FPS = 60;
export const SPEED_BASE = 2.2 * FPS;
export const SPEED_PER_LEVEL = 0.2 * FPS;
export const SPEED_CAP = 9.5 * FPS;
export const SPEED_FLOOR = 0.8 * FPS;
export const MILESTONE_BOOST = 1.12;
export const RANDOM_BRICK_SPEED_MULT = 1.15;

export const ENTRY_MAX_DELAY = 2.0;
export const ENTRY_MIN_DELAY = 0.15;
export const ENTRY_SPEED_FACTOR = 0.87;
export const FIRST_RANDOM_DELAY = 1.0;
export const BLOCKED_SPAWN_RETRY = 0.2;

export const ERRATIC_INTERVAL = 3;
export const ERRATIC_BASE_FRAC = 0.12;
export const ERRATIC_GROWTH = 0.08;
export const ERRATIC_MAX_FRAC = 0.55;

export const BRICK_MIN_EARLY = 3;
export const BRICK_MAX_EARLY = 5;
export const BRICK_COUNT_CAP = 12;
export const MAX_LIVE_BRICKS = 14;

export const MIN_SAFE_GAPS = 2;
export const SAFE_GAP_MARGIN = 8;
export const SAFE_GAP = BALL_RADIUS * 2 + SAFE_GAP_MARGIN + 24;

export const NEAR_MISS_DIST = 14;
export const SIM_MAX_STEP = 1 / 120;

// ── After level 3 ───────────────────────────────────────────────────────────
// Each mode adds one new mechanic at level 4 and escalates it every level.
export const TWIST_START_LEVEL = 4;

// Safety check: brick paths are predicted on this time step, over at most this horizon.
export const PREDICT_STEP = 0.025;
export const PREDICT_HORIZON = 4;

// Drifters: bricks that slide sideways and bounce off the rails.
export const DRIFT_CHANCE = [0.4, 0.08, 0.75] as const; // start, per level, max
export const DRIFT_SPEED = [75, 14, 170] as const;

// Splitters: cracked bricks that burst into two shards partway down.
export const SPLIT_CHANCE = [0.2, 0.06, 0.5] as const;
export const SPLIT_HEIGHT = [0.62, -0.03, 0.42] as const; // fraction of FIELD_H
export const SPLIT_SHARD_SPEED = [120, 8, 190] as const;
export const SHARD_W = BRICK_W * 0.58;

// Formations: choreographed brick patterns that replace a random wave.
export const FORMATION_EVERY = [10, -0.7, 5] as const; // seconds between formations
export const FORMATION_ROWS = [3, 0.5, 6] as const;
export const FORMATION_ROW_TIME = [0.7, -0.03, 0.45] as const; // seconds between rows
export const FORMATION_GAP = 74;

export const KEY_SPEED = 680;
export const TOUCH_SENSITIVITY = 1.25;

// (base, highlight) per level, cycling — same palette as the original.
export const BRICK_PALETTES: ReadonlyArray<readonly [string, string]> = [
  ['#c0392b', '#e74c3c'],
  ['#27ae60', '#2ecc71'],
  ['#d4ac0d', '#f1c40f'],
  ['#7d3c98', '#9b59b6'],
  ['#1a5276', '#2980b9'],
  ['#ca6f1e', '#e67e22'],
];
