// Million-roll simulations per bet type: the realized house edge must land
// within tolerance of theory. Seeds are fixed, so results are deterministic.
//
// Handle convention: a bet's stake counts toward handle once per resolution
// (win / lose / push). Pushes count as resolutions — that matches the standard
// "per bet made" edge figures (e.g. Don't Pass 1.36% counts the bar-12 push).

import { describe, it, expect, afterAll } from 'vitest';
import { createState, type Settings, type TableState } from './state';
import { resolve } from './resolve';
import { mulberry32, seededDie, secureDie } from './rng';

const ROLLS = 1_000_000;

interface SimResult {
  edgePct: number;
  handle: number;
  net: number;
  resolutions: number;
}

function simulate(opts: {
  seed: number;
  ensure: (s: TableState) => void;
  counts: (betId: string) => boolean;
  settings?: Partial<Settings>;
}): SimResult {
  const rand = mulberry32(opts.seed);
  let s = createState({
    bankroll: 0,
    settings: { keepWinningBetsOnTable: false, ...opts.settings },
  });
  let handle = 0;
  let net = 0;
  let n = 0;

  for (let i = 0; i < ROLLS; i++) {
    opts.ensure(s); // tests mutate the fresh clone directly — no bankroll constraint
    const out = resolve(s, seededDie(rand), seededDie(rand));
    s = out.state;
    for (const r of out.resolutions) {
      if (!opts.counts(r.bet)) continue;
      if (r.outcome === 'win') {
        handle += r.stake;
        net += r.winnings;
        n++;
      } else if (r.outcome === 'lose') {
        handle += r.stake;
        net -= r.stake;
        n++;
      } else if (r.outcome === 'push') {
        handle += r.stake;
        n++;
      }
    }
  }
  return { edgePct: (-net / handle) * 100, handle, net, resolutions: n };
}

const summary: Array<{ bet: string; theory: number; measured: number; resolutions: number }> = [];

function check(bet: string, r: SimResult, theoryPct: number, tolerancePct: number) {
  summary.push({ bet, theory: theoryPct, measured: r.edgePct, resolutions: r.resolutions });
  expect(
    Math.abs(r.edgePct - theoryPct),
    `${bet}: measured ${r.edgePct.toFixed(3)}% vs theory ${theoryPct}% (tolerance ±${tolerancePct})`,
  ).toBeLessThan(tolerancePct);
}

afterAll(async () => {
  const rows = summary
    .map(
      (s) =>
        `  ${s.bet.padEnd(14)} theory ${s.theory.toFixed(2).padStart(6)}%   measured ${s.measured
          .toFixed(3)
          .padStart(7)}%   (${s.resolutions.toLocaleString()} resolved bets)`,
    )
    .join('\n');
  const report = `Realized house edges over ${ROLLS.toLocaleString()} rolls per bet type:\n${rows}\n`;
  // eslint-disable-next-line no-console
  console.log(`\n${report}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL('../../edge-report.txt', import.meta.url), report);
});

describe('million-roll realized house edges', () => {
  it('pass line ≈ 1.41%', () => {
    const r = simulate({
      seed: 0xc0ffee,
      ensure: (s) => {
        if (!s.bets.passLine) s.bets.passLine = 1;
      },
      counts: (b) => b === 'passLine',
    });
    check('Pass', r, 1.41, 0.6);
  }, 120_000);

  it("don't pass ≈ 1.36% (bar-12 pushes counted)", () => {
    const r = simulate({
      seed: 0xbadd1e,
      ensure: (s) => {
        if (!s.bets.dontPass) s.bets.dontPass = 1;
      },
      counts: (b) => b === 'dontPass',
    });
    check("Don't Pass", r, 1.36, 0.6);
  }, 120_000);

  it('come ≈ 1.41% (flat + traveled point counted as one lifecycle)', () => {
    const r = simulate({
      seed: 0x5eed,
      ensure: (s) => {
        if (s.point !== null && !s.bets.come) s.bets.come = 1;
      },
      counts: (b) => b === 'come' || b.startsWith('comePoint:'),
    });
    check('Come', r, 1.41, 0.6);
  }, 120_000);

  it('place 6 ≈ 1.52%', () => {
    const r = simulate({
      seed: 0x6666,
      ensure: (s) => {
        if (!s.bets.place[6]) s.bets.place[6] = 6;
      },
      counts: (b) => b === 'place:6',
      settings: { placeWorkingOnComeOut: true },
    });
    check('Place 6', r, 1.52, 0.6);
  }, 120_000);

  it('place 8 ≈ 1.52%', () => {
    const r = simulate({
      seed: 0x8888,
      ensure: (s) => {
        if (!s.bets.place[8]) s.bets.place[8] = 6;
      },
      counts: (b) => b === 'place:8',
      settings: { placeWorkingOnComeOut: true },
    });
    check('Place 8', r, 1.52, 0.6);
  }, 120_000);

  it('field ≈ 2.78% (2 pays double, 12 pays triple)', () => {
    const r = simulate({
      seed: 0xf1e1d,
      ensure: (s) => {
        if (!s.bets.field) s.bets.field = 1;
      },
      counts: (b) => b === 'field',
    });
    check('Field', r, 2.78, 0.35);
  }, 120_000);

  it('any 7 ≈ 16.67%', () => {
    const r = simulate({
      seed: 0x7777,
      ensure: (s) => {
        if (!s.bets.props.any7) s.bets.props.any7 = 1;
      },
      counts: (b) => b === 'prop:any7',
    });
    check('Any 7', r, 16.67, 0.65);
  }, 120_000);
});

describe('dice uniformity', () => {
  it('seeded PRNG dice are uniform across faces and 36 pair outcomes', () => {
    const rand = mulberry32(0xd1ce);
    const faces = new Array(7).fill(0);
    const pairs = new Map<string, number>();
    const N = 360_000;
    for (let i = 0; i < N; i++) {
      const a = seededDie(rand);
      const b = seededDie(rand);
      faces[a]++;
      faces[b]++;
      const k = `${a},${b}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    // Each face: expected 120,000; SD ≈ 316. Allow ±5σ.
    for (let f = 1; f <= 6; f++) {
      expect(Math.abs(faces[f] - 120_000), `face ${f}: ${faces[f]}`).toBeLessThan(1600);
    }
    // Each ordered pair: expected 10,000; SD ≈ 99. Allow ±6σ.
    expect(pairs.size).toBe(36);
    for (const [k, c] of pairs) {
      expect(Math.abs(c - 10_000), `pair ${k}: ${c}`).toBeLessThan(600);
    }
  }, 60_000);

  it('crypto dice (rejection-sampled) are uniform across faces', () => {
    const faces = new Array(7).fill(0);
    const N = 60_000;
    for (let i = 0; i < N; i++) faces[secureDie()]++;
    // Expected 10,000 per face; SD ≈ 91. Allow ±6.5σ.
    for (let f = 1; f <= 6; f++) {
      expect(Math.abs(faces[f] - 10_000), `face ${f}: ${faces[f]}`).toBeLessThan(600);
    }
  }, 60_000);
});
