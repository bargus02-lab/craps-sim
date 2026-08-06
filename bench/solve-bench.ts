// Solver cost benchmark — how expensive the acceptance rules are to satisfy.
// Single-threaded, so the numbers are pessimistic: the app races three
// workers. Use it whenever the rest zone, launch, or settle rules change.
//
//   npx tsx bench/solve-bench.ts 60
//
import { solveRoll } from '../src/dice/solver-core';
import type { Die } from '../src/engine/state';

const N = Number(process.argv[2] ?? 40);
const times: number[] = [];
const attempts: number[] = [];
const stats: Record<string, number> = {};
let failures = 0;
const rests: Array<[number, number]> = [];

for (let i = 0; i < N; i++) {
  const target: [Die, Die] = [((i % 6) + 1) as Die, (((i * 5 + 3) % 6) + 1) as Die];
  const t0 = Date.now();
  const r = solveRoll(target, 0x9e3779b9 ^ (i * 2654435761), stats);
  times.push(Date.now() - t0);
  if (!r) { failures++; continue; }
  attempts.push(r.attempts);
  const o = (r.frameCount - 1) * 14;
  rests.push([r.frames[o], r.frames[o + 2]], [r.frames[o + 7], r.frames[o + 9]]);
}
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const p95 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)]; };
console.log(JSON.stringify({
  n: N, failures,
  msMedian: med(times), msP95: p95(times), msMax: Math.max(...times),
  attemptsMedian: med(attempts), attemptsP95: p95(attempts),
  xRange: [Math.min(...rests.map(r => r[0])).toFixed(3), Math.max(...rests.map(r => r[0])).toFixed(3)],
  zRange: [Math.min(...rests.map(r => r[1])).toFixed(3), Math.max(...rests.map(r => r[1])).toFixed(3)],
  rejections: stats,
}, null, 1));
