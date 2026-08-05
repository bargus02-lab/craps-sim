// Dice generation. Real rolls come from crypto.getRandomValues with rejection
// sampling (provably uniform). The seeded PRNG exists for the test suite's
// million-roll simulations and for deterministic trajectory replay.

import type { Die } from './state';

/** Largest multiple of 6 that fits in a byte; reject values >= this to keep %6 unbiased. */
const REJECT_ABOVE = 252;

export function secureDie(): Die {
  const buf = new Uint8Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= REJECT_ABOVE);
  return ((buf[0] % 6) + 1) as Die;
}

/** Two independent uniform 1-6 draws. */
export function secureRoll(): [Die, Die] {
  return [secureDie(), secureDie()];
}

/** Fresh 32-bit seed for the fairness panel / replay solver. */
export function secureSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** mulberry32 — small, fast, deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededDie(rand: () => number): Die {
  return (1 + Math.floor(rand() * 6)) as Die;
}
