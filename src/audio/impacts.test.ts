// The audio event extractor runs against real solved trajectories.

import { describe, it, expect } from 'vitest';
import { solveRoll } from '../dice/solver-core';
import { extractAudioTrack } from './impacts';

describe('audio track extraction', () => {
  it('finds ordered, bounded impacts and rolling levels in a real trajectory', () => {
    const r = solveRoll([3, 4], 0xa0d10);
    expect(r).not.toBeNull();
    const track = extractAudioTrack(r!.frames, r!.frameCount, r!.dt);

    // A real throw bounces several times: expect a handful of impacts.
    expect(track.impacts.length).toBeGreaterThan(3);
    expect(track.impacts.length).toBeLessThan(80);

    let last = -1;
    for (const imp of track.impacts) {
      expect(imp.t).toBeGreaterThanOrEqual(last); // chronological
      last = imp.t;
      expect(imp.t).toBeLessThan(r!.frameCount * r!.dt);
      expect(imp.intensity).toBeGreaterThan(0);
      expect(imp.intensity).toBeLessThanOrEqual(1);
      expect(['felt', 'wall', 'dice']).toContain(imp.kind);
    }

    // Both dice must hit the far wall, so wall impacts should be detected.
    expect(track.impacts.some((i) => i.kind === 'wall')).toBe(true);

    // Rolling envelope: right length, 0..1, silent by the end (settled dice).
    expect(track.rolling.length).toBe(r!.frameCount);
    for (const v of track.rolling) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(track.rolling[r!.frameCount - 2]).toBeLessThan(0.08);
  }, 60_000);

  it('per-die impacts respect the debounce window', () => {
    const r = solveRoll([2, 2], 0xbead);
    expect(r).not.toBeNull();
    const track = extractAudioTrack(r!.frames, r!.frameCount, r!.dt);
    for (const die of [0, 1] as const) {
      const times = track.impacts.filter((i) => i.die === die).map((i) => i.t);
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(0.05 - 1e-9);
      }
    }
  }, 60_000);
});
