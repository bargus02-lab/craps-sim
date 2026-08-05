// Web Worker wrapper around the headless solver — keeps the physics search
// off the main thread so the scene never drops frames while "shaking".

import { solveRoll } from './solver-core';
import type { Die } from '../engine/state';

interface SolveMessage {
  id: number;
  target: [Die, Die];
  seed: number;
}

self.onmessage = (e: MessageEvent<SolveMessage>) => {
  const { id, target, seed } = e.data;
  try {
    const result = solveRoll(target, seed);
    if (result) {
      (self as unknown as Worker).postMessage({ id, ok: true, result }, [
        result.frames.buffer,
      ]);
    } else {
      (self as unknown as Worker).postMessage({ id, ok: false });
    }
  } catch {
    // Report failure rather than dying silently — the race must always settle.
    (self as unknown as Worker).postMessage({ id, ok: false });
  }
};
