// Die face orientation math. Pure — no Three.js, no cannon-es — so the
// solver (worker), the renderer, and the tests all share one source of truth.

import type { Die } from '../engine/state';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Local-space face normals. Opposite faces sum to 7, arranged as a standard
 * western right-handed die: 1 up (+Y), 2 facing the player (+Z), 3 to the
 * right (+X) — so 1, 2, 3 run counterclockwise around their shared corner.
 */
export const FACE_NORMALS: ReadonlyArray<{ face: Die; n: Vec3 }> = [
  { face: 1, n: { x: 0, y: 1, z: 0 } },
  { face: 6, n: { x: 0, y: -1, z: 0 } },
  { face: 2, n: { x: 0, y: 0, z: 1 } },
  { face: 5, n: { x: 0, y: 0, z: -1 } },
  { face: 3, n: { x: 1, y: 0, z: 0 } },
  { face: 4, n: { x: -1, y: 0, z: 0 } },
];

/** Rotate vector v by quaternion q (q assumed unit length). */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2*q.xyz × (q.xyz × v + q.w * v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Which face points up for a die in orientation q, or null if the die is
 * cocked (no face normal within cosTol of world-up).
 */
export function topFaceFromQuat(q: Quat, cosTol = 0.9995): Die | null {
  let best: Die | null = null;
  let bestDot = cosTol;
  for (const { face, n } of FACE_NORMALS) {
    const world = rotate(q, n);
    if (world.y > bestDot) {
      bestDot = world.y;
      best = face;
    }
  }
  return best;
}
