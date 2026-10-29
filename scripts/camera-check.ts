// Headless checks on the camera: does the whole playfield still fit, and what
// does the viewing angle cost the player?
//
// A brick falls straight down in world space, but on screen it drifts toward
// the vanishing point as it falls, so where a brick appears is not quite the
// column it lands in. That drift is the one thing here that can hurt
// playability, so it is measured against the old head-on camera rather than
// argued about. Run with `npm run camera-check`.

import * as THREE from 'three';
import * as C from '../src/config';
import { VIEW, VIEW_BOTTOM, VIEW_TOP, type View, fitCamera } from '../src/camera';

const SIDE_PAD = 14;
const EPS = 1e-3;

/** The camera this change replaces, for comparison. */
const LEGACY: View = { fov: 30, pitch: 8, yaw: 0 };
const LEGACY_DEPTH = 26;

const corners: THREE.Vector3[] = [];
for (const x of [-(C.FIELD_W / 2 + SIDE_PAD), C.FIELD_W / 2 + SIDE_PAD]) {
  for (const y of [VIEW_BOTTOM, VIEW_TOP]) {
    for (const z of [-C.BRICK_DEPTH / 2, C.BRICK_DEPTH / 2]) corners.push(new THREE.Vector3(x, y, z));
  }
}

const SCREENS: [number, number][] = [
  [320, 568], [375, 667], [390, 844], [414, 896], [430, 932],
  [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1440, 900],
  [1920, 1080], [2560, 1080], [600, 600], [390, 600], [1200, 420],
];
const INSETS: [number, number][] = [[0, 0], [96, 0], [96, 120], [160, 180]];

function makeCamera(view: View, aspect: number, ndcTop: number, ndcBot: number) {
  const camera = new THREE.PerspectiveCamera(view.fov, aspect, 10, 6000);
  fitCamera(camera, ndcTop, ndcBot, view);
  return camera;
}

// ── Does the field still fit? ────────────────────────────────────────────────

let failures = 0;
const fits: { label: string; worst: number }[] = [];
for (const [w, h] of SCREENS) {
  for (const [top, bottom] of INSETS) {
    const ndcTop = 1 - (2 * top) / h;
    const ndcBot = -1 + (2 * bottom) / h;
    const camera = makeCamera(VIEW, w / h, ndcTop, ndcBot);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const c of corners) {
      v.copy(c).project(camera);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const worst = Math.max(-1 - minX, maxX - 1, ndcBot - minY, maxY - ndcTop);
    if (worst > EPS) failures++;
    fits.push({ label: `${w}x${h} insets ${top}/${bottom}`, worst });
  }
}
fits.sort((a, b) => b.worst - a.worst);
console.log(`Fit: ${fits.length} layouts checked, ${failures} with the field off screen`);
console.log(`     worst overflow ${fits[0].worst.toExponential(1)} (${fits[0].label})\n`);

// ── What does the angle cost the player? ─────────────────────────────────────

/**
 * How far a brick slides across the screen while falling straight down, from
 * the moment it appears to the moment it reaches the ball's row, as a
 * percentage of screen width. This is the gap between where a brick looks like
 * it is going and where it actually lands.
 */
function trackingDrift(view: View, aspect: number) {
  const camera = makeCamera(view, aspect, 1, -1);
  const v = new THREE.Vector3();
  let worst = 0;
  for (const x of [-150, -75, 75, 150]) {
    const spawn = v.set(x, C.FIELD_H, 0).project(camera).x;
    const row = v.set(x, C.BALL_Y, 0).project(camera).x;
    worst = Math.max(worst, Math.abs(spawn - row) / 2);
  }
  return worst * 100;
}

/** Share of a brick's on-screen silhouette made up of faces other than the front. */
function solidity(view: View, depth: number) {
  const yaw = THREE.MathUtils.degToRad(view.yaw);
  const pitch = THREE.MathUtils.degToRad(view.pitch);
  const side = depth * Math.sin(yaw);
  const top = depth * Math.sin(pitch);
  return {
    side: (100 * side) / (C.BRICK_W * Math.cos(yaw) + side),
    top: (100 * top) / (C.BRICK_H * Math.cos(pitch) + top),
  };
}

/** How much wider than its true width a brick looks, which is how much narrower a corridor looks. */
function gapCost(view: View, depth: number) {
  const yaw = THREE.MathUtils.degToRad(view.yaw);
  return C.BRICK_W * Math.cos(yaw) + depth * Math.sin(yaw) - C.BRICK_W;
}

const ASPECTS: [string, number][] = [['phone 390x844', 390 / 844], ['desktop 1440x900', 1440 / 900]];
console.log('                     tracking drift        side face  top face  corridor looks');
for (const [name, view, depth] of [['before', LEGACY, LEGACY_DEPTH], ['after', VIEW, C.BRICK_DEPTH]] as const) {
  const drift = ASPECTS.map(([label, a]) => `${label.split(' ')[0]} ${trackingDrift(view, a).toFixed(1)}%`).join('  ');
  const s = solidity(view, depth);
  const narrower = C.SAFE_GAP - gapCost(view, depth);
  console.log(
    name.padEnd(8),
    drift.padEnd(28),
    `${s.side.toFixed(0)}%`.padStart(6),
    `${s.top.toFixed(0)}%`.padStart(9),
    `${narrower.toFixed(0)} of ${C.SAFE_GAP} units`.padStart(18),
  );
}
console.log(`\nA guaranteed corridor is ${C.SAFE_GAP} units wide and the ball is ${C.BALL_RADIUS * 2} across.`);

if (failures > 0) process.exitCode = 1;
