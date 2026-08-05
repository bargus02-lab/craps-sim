// Main-thread client for the solver workers. Several workers race the same
// target on different launch-parameter seeds; the first clean trajectory wins.
// The target faces are fixed before any physics runs, so racing only affects
// how fast a matching trajectory is found — never what the dice show.

import type { Die } from '../engine/state';
import { secureSeed } from '../engine/rng';
import type { SolveResult } from './solver-core';

const POOL_SIZE = 3;

function spawnWorker(): Worker {
  return new Worker(new URL('./solver.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function solveInWorker(
  worker: Worker,
  id: number,
  target: [Die, Die],
  seed: number,
): Promise<SolveResult | null> {
  return new Promise((resolve) => {
    worker.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; result?: SolveResult }>,
    ) => {
      if (e.data.id !== id) return;
      resolve(e.data.ok && e.data.result ? e.data.result : null);
    };
    // A worker that fails to load or throws must still settle the race —
    // otherwise the roll (and the ROLL button) would hang forever.
    worker.onerror = () => resolve(null);
    worker.onmessageerror = () => resolve(null);
    worker.postMessage({ id, target, seed });
  });
}

export class DiceSolver {
  private workers: Worker[] = [];
  private nextId = 1;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) this.workers.push(spawnWorker());
  }

  /**
   * Solve a trajectory for the given pre-drawn target. All workers search in
   * parallel from independent seeds; the first clean trajectory wins. Workers
   * that already finished are REUSED (no per-roll spawn cost); only the ones
   * still busy when the race ends are terminated and replaced.
   */
  async solve(target: [Die, Die], seed: number): Promise<SolveResult> {
    for (let round = 0; round < 3; round++) {
      const id = this.nextId++;
      const seeds = this.workers.map((_, i) =>
        i === 0 && round === 0 ? seed : secureSeed(),
      );
      const settled = this.workers.map(() => false);

      const winner = await new Promise<SolveResult | null>((resolve) => {
        let failed = 0;
        this.workers.forEach((w, i) => {
          void solveInWorker(w, id, target, seeds[i]).then((r) => {
            settled[i] = true;
            if (r) resolve(r);
            else if (++failed === this.workers.length) resolve(null);
          });
        });
      });

      // Recycle finished workers; replace only the ones still crunching.
      this.workers = this.workers.map((w, i) => {
        if (settled[i]) return w;
        w.terminate();
        return spawnWorker();
      });

      if (winner) return winner;
    }
    throw new Error('Dice solver failed to find a trajectory — please roll again');
  }
}
