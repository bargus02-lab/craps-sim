// Face mapping + headless solver tests. The solver runs real cannon-es
// physics under Node — no browser needed.

import { describe, it, expect } from 'vitest';
import type { Die } from '../engine/state';
import { FACE_NORMALS, topFaceFromQuat, rotate, type Quat } from './faces';
import { solveRoll } from './solver-core';
import { DICE, SOLVER, TABLE } from '../scene/constants';

// Quaternion from axis-angle (unit axis).
function quatAxisAngle(x: number, y: number, z: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

// Shortest-arc quaternion rotating unit vector a onto unit vector b.
function quatFromTo(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): Quat {
  const d = a.x * b.x + a.y * b.y + a.z * b.z;
  if (d > 0.99999) return { x: 0, y: 0, z: 0, w: 1 };
  if (d < -0.99999) {
    // 180 degrees: any perpendicular axis.
    const axis = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const cx = a.y * axis.z - a.z * axis.y;
    const cy = a.z * axis.x - a.x * axis.z;
    const cz = a.x * axis.y - a.y * axis.x;
    const n = Math.hypot(cx, cy, cz);
    return { x: cx / n, y: cy / n, z: cz / n, w: 0 };
  }
  const cx = a.y * b.z - a.z * b.y;
  const cy = a.z * b.x - a.x * b.z;
  const cz = a.x * b.y - a.y * b.x;
  const w = 1 + d;
  const n = Math.hypot(cx, cy, cz, w);
  return { x: cx / n, y: cy / n, z: cz / n, w: w / n };
}

describe('die face mapping', () => {
  it('has all six faces and opposite faces sum to 7', () => {
    const faces = FACE_NORMALS.map((f) => f.face).sort();
    expect(faces).toEqual([1, 2, 3, 4, 5, 6]);
    for (const { face, n } of FACE_NORMALS) {
      const opposite = FACE_NORMALS.find(
        (o) => o.n.x === -n.x && o.n.y === -n.y && o.n.z === -n.z,
      );
      expect(opposite, `face ${face} needs an opposite`).toBeDefined();
      expect(face + opposite!.face).toBe(7);
    }
  });

  it('is right-handed western style: 1 up, 2 toward player, 3 right', () => {
    const get = (f: Die) => FACE_NORMALS.find((x) => x.face === f)!.n;
    expect(get(1)).toEqual({ x: 0, y: 1, z: 0 });
    expect(get(2)).toEqual({ x: 0, y: 0, z: 1 });
    expect(get(3)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('topFaceFromQuat identifies every face when rotated up', () => {
    const up = { x: 0, y: 1, z: 0 };
    for (const { face, n } of FACE_NORMALS) {
      const q = quatFromTo(n, up);
      // sanity: the rotation really maps n to up
      const w = rotate(q, n);
      expect(w.y).toBeGreaterThan(0.9999);
      expect(topFaceFromQuat(q)).toBe(face);
    }
  });

  it('returns null for a cocked die (5 degrees off)', () => {
    const q = quatAxisAngle(1, 0, 0, (5 * Math.PI) / 180);
    expect(topFaceFromQuat(q, SOLVER.flatCosTol)).toBeNull();
  });

  it('identity orientation shows a 1 (its +Y face up)', () => {
    expect(topFaceFromQuat({ x: 0, y: 0, z: 0, w: 1 })).toBe(1);
  });
});

describe('pre-roll solver', () => {
  const targets: Array<[Die, Die]> = [
    [1, 6],
    [3, 3], // hardway pair — no swap shortcut available
    [2, 5],
    [4, 1],
    [6, 6],
    [5, 2],
    [4, 3],
    [1, 1],
  ];

  it.each(targets.map((t, i) => [t[0], t[1], i] as const))(
    'solves %i + %i to a clean settle matching the target',
    (a, b, i) => {
      const r = solveRoll([a, b], 0xabcd00 + i * 7919);
      expect(r, `target ${a}+${b} should solve`).not.toBeNull();
      expect(r!.faces).toEqual([a, b]);
      expect(r!.frameCount).toBeGreaterThan(100); // at least ~0.8s of motion
      expect(r!.attempts).toBeLessThan(SOLVER.attemptsPerBatch * SOLVER.maxBatches);

      // Final frame: both dice flat on the felt, inside the rails, showing target.
      const last = (r!.frameCount - 1) * 14;
      for (const die of [0, 1]) {
        const o = last + die * 7;
        const px = r!.frames[o];
        const py = r!.frames[o + 1];
        const pz = r!.frames[o + 2];
        const q = { x: r!.frames[o + 3], y: r!.frames[o + 4], z: r!.frames[o + 5], w: r!.frames[o + 6] };
        expect(Math.abs(py - DICE.half)).toBeLessThan(0.005);
        expect(Math.abs(px)).toBeLessThan(TABLE.feltHalfX);
        expect(Math.abs(pz)).toBeLessThan(TABLE.feltHalfZ);
        // Rest zone: dice must always come to rest where the player can see
        // them — never against the far wall or under the phone's chip dock.
        expect(px).toBeLessThanOrEqual(SOLVER.restMaxX);
        expect(px).toBeGreaterThanOrEqual(SOLVER.restMinX);
        expect(Math.abs(pz)).toBeLessThanOrEqual(SOLVER.restMaxAbsZ);
        expect(topFaceFromQuat(q, 0.999)).toBe(die === 0 ? a : b);
      }

      // Every frame is finite (no NaNs from an unstable sim).
      for (let k = 0; k < r!.frameCount * 14; k++) {
        expect(Number.isFinite(r!.frames[k])).toBe(true);
      }
    },
    60_000,
  );

  it('is deterministic: same target and seed produce identical trajectories', () => {
    const r1 = solveRoll([2, 4], 0xfeed);
    const r2 = solveRoll([2, 4], 0xfeed);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.frameCount).toBe(r2!.frameCount);
    expect(r1!.attempts).toBe(r2!.attempts);
    expect(Array.from(r1!.frames.subarray(0, 28))).toEqual(
      Array.from(r2!.frames.subarray(0, 28)),
    );
    const lastStart = (r1!.frameCount - 1) * 14;
    expect(Array.from(r1!.frames.subarray(lastStart))).toEqual(
      Array.from(r2!.frames.subarray(lastStart)),
    );
  }, 60_000);
});
