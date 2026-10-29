// Camera placement for the playfield.
//
// The shaft is viewed from off the centre line and a little above, so a brick
// shows a side face and a top face instead of reading as a flat rectangle.
// That makes the framing asymmetric, so fitting it has to be iterative: fit
// the distance, slide the rig to re-centre what it sees, and repeat.

import * as THREE from 'three';
import * as C from './config';

export interface View {
  /** Vertical field of view, in degrees. */
  fov: number;
  /** Downward tilt, in degrees. Reveals the top face of a brick. */
  pitch: number;
  /** Swing off the centre line, in degrees. Reveals a side face. */
  yaw: number;
}

/**
 * Yaw is the cheap way to show a brick's depth. A falling brick drifts across
 * the screen toward the vanishing point of the world's vertical, and because
 * the camera's right vector stays level that vanishing point sits at screen
 * centre whatever the yaw. Pitch and fov are what pull a brick away from the
 * column it will land in, so they stay close to head-on and yaw does the work.
 */
export const VIEW: View = { fov: 31, pitch: 9, yaw: 13 };

export const VIEW_TOP = C.FIELD_H + 64;
export const VIEW_BOTTOM = -12;

const SIDE_PAD = 14;
const RECENTRE_PASSES = 6;

/** Corners of the volume that must stay on screen, bricks' depth included. */
const CORNERS: THREE.Vector3[] = [];
{
  const xw = C.FIELD_W / 2 + SIDE_PAD;
  const zd = C.BRICK_DEPTH / 2;
  for (const x of [-xw, xw]) {
    for (const y of [VIEW_BOTTOM, VIEW_TOP]) {
      for (const z of [-zd, zd]) CORNERS.push(new THREE.Vector3(x, y, z));
    }
  }
}

export function viewDirection(view: View = VIEW) {
  const pitch = THREE.MathUtils.degToRad(view.pitch);
  const yaw = THREE.MathUtils.degToRad(view.yaw);
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
}

/**
 * Positions `camera` so every corner of the playfield lands inside the frame
 * horizontally and between `ndcBot` and `ndcTop` vertically. Returns the point
 * it looks at, which the screen shake needs so it can keep aiming at the same
 * spot while the camera jitters around it.
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  ndcTop: number,
  ndcBot: number,
  view: View = VIEW,
): THREE.Vector3 {
  camera.fov = view.fov;
  camera.updateProjectionMatrix();
  const dir = viewDirection(view);
  const target = new THREE.Vector3(0, (VIEW_TOP + VIEW_BOTTOM) / 2, 0);
  const tanH = Math.tan(THREE.MathUtils.degToRad(view.fov / 2));
  const v = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const back = new THREE.Vector3();

  const bounds = (d: number) => {
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of CORNERS) {
      v.copy(c).project(camera);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    return { minX, maxX, minY, maxY };
  };

  // Nearest distance at which the field spans no more than the frame. Centring
  // is handled separately, so this compares extents rather than edges.
  const fitDistance = () => {
    let lo = 100;
    let hi = 40000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const b = bounds(mid);
      if (b.maxX - b.minX <= 2 && b.maxY - b.minY <= ndcTop - ndcBot) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  let dist = 0;
  for (let pass = 0; pass < RECENTRE_PASSES; pass++) {
    dist = fitDistance();
    const b = bounds(dist);
    // Slide along the camera's own axes, not the world's: under yaw and pitch
    // screen-right and screen-up are not world x and y.
    camera.matrixWorld.extractBasis(right, up, back);
    const halfH = dist * tanH;
    target.addScaledVector(right, ((b.maxX + b.minX) / 2) * halfH * camera.aspect);
    target.addScaledVector(up, ((b.maxY + b.minY) / 2 - (ndcTop + ndcBot) / 2) * halfH);
  }
  dist = fitDistance();
  bounds(dist);
  return target;
}
