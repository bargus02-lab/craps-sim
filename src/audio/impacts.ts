// Derives audio events from a solved dice trajectory — pure math, no Web
// Audio, no DOM, so it is unit-testable under Node. Impacts are sudden
// velocity changes (real collisions in the recorded physics); rolling noise
// level follows surface speed.

import { DICE, TABLE } from '../scene/constants';

export type ImpactKind = 'felt' | 'wall' | 'dice';

export interface ImpactEvent {
  /** Seconds from trajectory start. */
  t: number;
  die: 0 | 1;
  /** 0..1 loudness from the collision's delta-v. */
  intensity: number;
  kind: ImpactKind;
}

export interface AudioTrack {
  impacts: ImpactEvent[];
  /** Per-frame rolling-noise level 0..1 (combined for both dice). */
  rolling: Float32Array;
  dt: number;
}

const FLOATS_PER_FRAME = 14;
/** Minimum delta-v (m/s) that counts as an audible impact. */
const IMPACT_DV = 1.1;
/** Delta-v that maps to full intensity. */
const MAX_DV = 7;
/** Per-die refractory period so one bounce is one sound. */
const DEBOUNCE_S = 0.05;

function pos(frames: Float32Array, f: number, die: 0 | 1): [number, number, number] {
  const o = f * FLOATS_PER_FRAME + die * 7;
  return [frames[o], frames[o + 1], frames[o + 2]];
}

export function extractAudioTrack(
  frames: Float32Array,
  frameCount: number,
  dt: number,
): AudioTrack {
  const impacts: ImpactEvent[] = [];
  const rolling = new Float32Array(frameCount);
  const lastImpact: [number, number] = [-1, -1];

  // Velocity samples per die via central differences.
  const vel = (f: number, die: 0 | 1): [number, number, number] => {
    const a = pos(frames, Math.max(0, f - 1), die);
    const b = pos(frames, Math.min(frameCount - 1, f + 1), die);
    const span = (Math.min(frameCount - 1, f + 1) - Math.max(0, f - 1)) * dt || dt;
    return [(b[0] - a[0]) / span, (b[1] - a[1]) / span, (b[2] - a[2]) / span];
  };

  for (let f = 1; f < frameCount - 1; f++) {
    const t = f * dt;
    let rollLevel = 0;

    for (const die of [0, 1] as const) {
      const [px, py, pz] = pos(frames, f, die);
      const v0 = vel(f - 1, die);
      const v1 = vel(f + 1, die);
      const dv = Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]);

      if (dv > IMPACT_DV && t - lastImpact[die] > DEBOUNCE_S) {
        lastImpact[die] = t;
        const other = pos(frames, f, die === 0 ? 1 : 0);
        const nearOther =
          Math.hypot(px - other[0], py - other[1], pz - other[2]) < DICE.half * 3.2;
        const nearWall =
          Math.abs(px) > TABLE.feltHalfX - 0.07 || Math.abs(pz) > TABLE.feltHalfZ - 0.07;
        impacts.push({
          t,
          die,
          intensity: Math.min(1, dv / MAX_DV),
          kind: nearOther ? 'dice' : nearWall ? 'wall' : 'felt',
        });
      }

      // Rolling: on/near the felt and moving.
      if (py < DICE.half * 3) {
        const speed = Math.hypot(v1[0], v1[1], v1[2]);
        rollLevel = Math.max(rollLevel, Math.min(1, speed / 3.2));
      }
    }

    // Smooth: fast attack, slow release.
    rolling[f] = Math.max(rollLevel, rolling[f - 1] * 0.94);
  }

  return { impacts, rolling, dt };
}
