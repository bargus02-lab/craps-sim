import { describe, it, expect } from 'vitest';
import {
  createState,
  placeBet,
  takeDownBet,
  reduceBet,
  totalOnTable,
  type Settings,
  type TableState,
} from './state';
import { resolve, type Resolution } from './resolve';

// ---------------------------------------------------------------- helpers

function state(
  mut?: (s: TableState) => void,
  settings?: Partial<Settings>,
): TableState {
  const s = createState({ bankroll: 10_000, settings });
  mut?.(s);
  return s;
}

function find(rs: Resolution[], bet: string): Resolution | undefined {
  return rs.find((r) => r.bet === bet);
}

function mustFind(rs: Resolution[], bet: string): Resolution {
  const r = find(rs, bet);
  if (!r) throw new Error(`Expected a resolution for "${bet}", got: ${rs.map((x) => x.bet).join(', ') || '(none)'}`);
  return r;
}

// Dice pairs for each total (non-hard where possible).
const EASY: Record<number, [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]> = {
  2: [1, 1],
  3: [1, 2],
  4: [1, 3],
  5: [2, 3],
  6: [2, 4],
  7: [3, 4],
  8: [3, 5],
  9: [4, 5],
  10: [4, 6],
  11: [5, 6],
  12: [6, 6],
};

function roll(s: TableState, total: number) {
  const [a, b] = EASY[total];
  return resolve(s, a, b);
}

// ---------------------------------------------------------------- pass line

describe('pass line — come-out', () => {
  it('7 is a natural winner and NOT a seven-out; shooter continues on come-out', () => {
    const s = state((x) => (x.bets.passLine = 10));
    const out = roll(s, 7);
    const r = mustFind(out.resolutions, 'passLine');
    expect(r.outcome).toBe('win');
    expect(r.winnings).toBe(10);
    expect(out.event).toBe('comeOutNatural');
    expect(out.state.point).toBeNull();
  });

  it('11 wins even money', () => {
    const out = roll(state((x) => (x.bets.passLine = 10)), 11);
    expect(mustFind(out.resolutions, 'passLine').winnings).toBe(10);
  });

  it.each([2, 3, 12])('%i craps out the pass line', (t) => {
    const out = roll(state((x) => (x.bets.passLine = 10)), t);
    expect(mustFind(out.resolutions, 'passLine').outcome).toBe('lose');
    expect(out.state.bets.passLine).toBe(0);
  });

  it.each([4, 5, 6, 8, 9, 10])('%i establishes the point; pass stays as contract', (t) => {
    const out = roll(state((x) => (x.bets.passLine = 10)), t);
    expect(out.state.point).toBe(t);
    expect(out.event).toBe('pointEstablished');
    expect(out.state.bets.passLine).toBe(10);
    expect(find(out.resolutions, 'passLine')).toBeUndefined();
  });
});

describe('pass line — point phase', () => {
  const oddsCases: Array<[number, number, number]> = [
    // [point, odds staked, odds winnings]
    [4, 10, 20],
    [5, 10, 15],
    [6, 10, 12],
    [8, 25, 30],
    [9, 30, 45],
    [10, 50, 100],
  ];

  it.each(oddsCases)(
    'point %i made: flat pays even, odds %i pay %i (true odds)',
    (pt, odds, oddsWin) => {
      const s = state((x) => {
        x.point = pt as 4;
        x.bets.passLine = 10;
        x.bets.passOdds = odds;
      });
      const out = roll(s, pt);
      expect(mustFind(out.resolutions, 'passLine').winnings).toBe(10);
      const o = mustFind(out.resolutions, 'passOdds');
      expect(o.winnings).toBeCloseTo(oddsWin, 10);
      expect(o.toBankroll).toBeCloseTo(odds + oddsWin, 10); // odds principal always returns
      expect(out.state.point).toBeNull();
      expect(out.event).toBe('pointMade');
    },
  );

  it('seven-out loses flat and odds, clears the point', () => {
    const s = state((x) => {
      x.point = 6;
      x.bets.passLine = 10;
      x.bets.passOdds = 50;
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'passLine').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'passOdds').outcome).toBe('lose');
    expect(out.state.point).toBeNull();
    expect(out.event).toBe('sevenOut');
    expect(out.state.bets.passLine).toBe(0);
    expect(out.state.bets.passOdds).toBe(0);
  });

  it('other totals do not touch the pass line', () => {
    const s = state((x) => {
      x.point = 6;
      x.bets.passLine = 10;
    });
    const out = roll(s, 9);
    expect(find(out.resolutions, 'passLine')).toBeUndefined();
    expect(out.state.bets.passLine).toBe(10);
    expect(out.event).toBe('roll');
  });
});

// ---------------------------------------------------------------- don't pass

describe("don't pass", () => {
  it.each([2, 3])('%i wins even money on the come-out', (t) => {
    const out = roll(state((x) => (x.bets.dontPass = 10)), t);
    expect(mustFind(out.resolutions, 'dontPass').winnings).toBe(10);
  });

  it('12 is a push (bar 12): no money moves, bet stays up', () => {
    const s = state((x) => (x.bets.dontPass = 10));
    const bankBefore = s.bankroll;
    const out = roll(s, 12);
    const r = mustFind(out.resolutions, 'dontPass');
    expect(r.outcome).toBe('push');
    expect(r.toBankroll).toBe(0);
    expect(out.state.bankroll).toBe(bankBefore);
    expect(out.state.bets.dontPass).toBe(10);
  });

  it.each([7, 11])('%i loses on the come-out', (t) => {
    const out = roll(state((x) => (x.bets.dontPass = 10)), t);
    expect(mustFind(out.resolutions, 'dontPass').outcome).toBe('lose');
  });

  const layCases: Array<[number, number, number]> = [
    // [point, lay odds staked, odds winnings]
    [4, 20, 10],
    [5, 30, 20],
    [6, 30, 25],
    [8, 60, 50],
    [9, 60, 40],
    [10, 100, 50],
  ];

  it.each(layCases)(
    'seven-out with point %i: flat pays even, lay odds %i pay %i',
    (pt, odds, oddsWin) => {
      const s = state((x) => {
        x.point = pt as 4;
        x.bets.dontPass = 10;
        x.bets.dontPassOdds = odds;
      });
      const out = roll(s, 7);
      expect(mustFind(out.resolutions, 'dontPass').winnings).toBe(10);
      expect(mustFind(out.resolutions, 'dontPassOdds').winnings).toBeCloseTo(oddsWin, 10);
    },
  );

  it('point made: flat and lay odds lose', () => {
    const s = state((x) => {
      x.point = 4;
      x.bets.dontPass = 10;
      x.bets.dontPassOdds = 40;
    });
    const out = roll(s, 4);
    expect(mustFind(out.resolutions, 'dontPass').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'dontPassOdds').outcome).toBe('lose');
  });
});

// ---------------------------------------------------------------- come bets

describe('come bets — the resolution-order gotchas', () => {
  it('established come point resolves BEFORE a fresh flat come bet travels to the same number', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.comePoints[6] = { flat: 5, odds: 25 };
      x.bets.come = 5;
    });
    const out = roll(s, 6);

    // The established come 6 wins (flat even + odds at 6:5)...
    expect(mustFind(out.resolutions, 'comePoint:6').winnings).toBe(5);
    expect(mustFind(out.resolutions, 'comeOdds:6').winnings).toBeCloseTo(30, 10);
    // ...and the fresh flat TRAVELS — it is NOT an instant winner.
    expect(mustFind(out.resolutions, 'come').outcome).toBe('travel');
    expect(find(out.resolutions, 'come')?.outcome).not.toBe('win');
    expect(out.state.bets.comePoints[6]).toEqual({ flat: 5, odds: 0 });
    expect(out.state.bets.come).toBe(5); // keep ON: won come-point flat re-placed as new flat come
  });

  it('re-placed come flat (keep ON) does not travel on the roll that won it', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.comePoints[6] = { flat: 5, odds: 0 };
    });
    const out = roll(s, 6);
    expect(mustFind(out.resolutions, 'comePoint:6').outcome).toBe('win');
    expect(out.state.bets.comePoints[6]).toBeUndefined();
    expect(out.state.bets.come).toBe(5); // sits as a flat come bet for the NEXT roll
  });

  it('seven-out: flat come WINS while pass line and established come points lose — all on one roll', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.passLine = 10;
      x.bets.passOdds = 20;
      x.bets.come = 5;
      x.bets.comePoints[6] = { flat: 5, odds: 25 };
    });
    const bankBefore = s.bankroll;
    const out = roll(s, 7);

    expect(mustFind(out.resolutions, 'passLine').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'passOdds').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'comePoint:6').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'comeOdds:6').outcome).toBe('lose'); // working during point phase
    const c = mustFind(out.resolutions, 'come');
    expect(c.outcome).toBe('win');
    expect(c.winnings).toBe(5);
    expect(out.event).toBe('sevenOut');
    expect(out.state.bankroll).toBe(bankBefore + 5); // only the come win pays
    expect(out.state.bets.come).toBe(5); // keep ON: contract stays up for the next come-out
  });

  it('flat come travels to the roll total and forms a come point', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.come = 15;
    });
    const out = roll(s, 5);
    expect(mustFind(out.resolutions, 'come').outcome).toBe('travel');
    expect(out.state.bets.comePoints[5]).toEqual({ flat: 15, odds: 0 });
    expect(out.state.bets.come).toBe(0);
  });

  it('flat come travels when the roll also makes the pass point', () => {
    const s = state((x) => {
      x.point = 6;
      x.bets.passLine = 10;
      x.bets.come = 5;
    });
    const out = roll(s, 6);
    expect(mustFind(out.resolutions, 'passLine').outcome).toBe('win');
    expect(mustFind(out.resolutions, 'come').outcome).toBe('travel');
    expect(out.state.bets.comePoints[6]).toEqual({ flat: 5, odds: 0 });
    expect(out.state.point).toBeNull(); // next roll is a come-out with a live come point
  });

  it.each([2, 3, 12])('flat come loses on %i', (t) => {
    const s = state((x) => {
      x.point = 8;
      x.bets.come = 5;
    });
    const out = roll(s, t);
    expect(mustFind(out.resolutions, 'come').outcome).toBe('lose');
    expect(out.state.bets.come).toBe(0);
  });

  it('flat come wins on 11', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.come = 5;
    });
    const out = roll(s, 11);
    expect(mustFind(out.resolutions, 'come').winnings).toBe(5);
  });
});

describe('come bets — come-out behavior (contract bets stay working)', () => {
  it('come point hit on the come-out: flat wins, odds are OFF and returned', () => {
    const s = state((x) => {
      x.bets.comePoints[6] = { flat: 5, odds: 25 };
    });
    const bankBefore = s.bankroll;
    const out = roll(s, 6);
    expect(mustFind(out.resolutions, 'comePoint:6').winnings).toBe(5);
    const o = mustFind(out.resolutions, 'comeOdds:6');
    expect(o.outcome).toBe('return');
    expect(o.toBankroll).toBe(25);
    expect(out.state.bankroll).toBe(bankBefore + 5 + 25);
  });

  it('come-out 7: come point flat loses (always working), odds OFF are returned, pass wins', () => {
    const s = state((x) => {
      x.bets.passLine = 10;
      x.bets.comePoints[6] = { flat: 5, odds: 25 };
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'passLine').outcome).toBe('win');
    expect(mustFind(out.resolutions, 'comePoint:6').outcome).toBe('lose');
    const o = mustFind(out.resolutions, 'comeOdds:6');
    expect(o.outcome).toBe('return');
    expect(o.toBankroll).toBe(25);
  });

  it('with comeOddsWorkingOnComeOut, odds win/lose instead of returning', () => {
    const s = state(
      (x) => {
        x.bets.comePoints[6] = { flat: 5, odds: 25 };
      },
      { comeOddsWorkingOnComeOut: true },
    );
    const out = roll(s, 6);
    expect(mustFind(out.resolutions, 'comeOdds:6').winnings).toBeCloseTo(30, 10);
  });
});

// ------------------------------------------------------------- don't come

describe("don't come bets", () => {
  it('flat travels; established DC point resolves (loses) BEFORE the new flat travels to it', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.dontComePoints[6] = { flat: 5, odds: 30 };
      x.bets.dontCome = 5;
    });
    const out = roll(s, 6);
    expect(mustFind(out.resolutions, 'dontComePoint:6').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'dontComeOdds:6').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'dontCome').outcome).toBe('travel');
    expect(out.state.bets.dontComePoints[6]).toEqual({ flat: 5, odds: 0 });
  });

  it("DC odds are ALWAYS working — they win on a come-out 7", () => {
    const s = state((x) => {
      x.bets.dontComePoints[6] = { flat: 6, odds: 30 };
    });
    const out = roll(s, 7); // come-out roll (no point set)
    expect(mustFind(out.resolutions, 'dontComePoint:6').winnings).toBe(6);
    expect(mustFind(out.resolutions, 'dontComeOdds:6').winnings).toBeCloseTo(25, 10); // 5:6
  });

  it.each([2, 3])('flat DC wins on %i', (t) => {
    const s = state((x) => {
      x.point = 8;
      x.bets.dontCome = 5;
    });
    const out = roll(s, t);
    expect(mustFind(out.resolutions, 'dontCome').winnings).toBe(5);
  });

  it('flat DC pushes on 12 (bar 12) and stays up', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.dontCome = 5;
    });
    const out = roll(s, 12);
    expect(mustFind(out.resolutions, 'dontCome').outcome).toBe('push');
    expect(out.state.bets.dontCome).toBe(5);
  });

  it.each([7, 11])('flat DC loses on %i', (t) => {
    const s = state((x) => {
      x.point = 8;
      x.bets.dontCome = 5;
    });
    const out = roll(s, t);
    expect(mustFind(out.resolutions, 'dontCome').outcome).toBe('lose');
  });

  it('seven-out pays every established DC point with odds', () => {
    const s = state((x) => {
      x.point = 5;
      x.bets.dontComePoints[4] = { flat: 10, odds: 40 };
      x.bets.dontComePoints[9] = { flat: 10, odds: 30 };
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'dontComePoint:4').winnings).toBe(10);
    expect(mustFind(out.resolutions, 'dontComeOdds:4').winnings).toBeCloseTo(20, 10); // 1:2
    expect(mustFind(out.resolutions, 'dontComePoint:9').winnings).toBe(10);
    expect(mustFind(out.resolutions, 'dontComeOdds:9').winnings).toBeCloseTo(20, 10); // 2:3
  });
});

// ---------------------------------------------------------------- place bets

describe('place bets', () => {
  const placeCases: Array<[number, number, number]> = [
    [4, 10, 18],
    [5, 10, 14],
    [6, 6, 7],
    [8, 6, 7],
    [9, 10, 14],
    [10, 10, 18],
  ];

  it.each(placeCases)('place %i for %i pays %i', (n, stake, winnings) => {
    const s = state((x) => {
      x.point = n === 8 ? 6 : 8; // any point that isn't the placed number
      x.bets.place[n as 4] = stake;
    });
    const out = roll(s, n);
    expect(mustFind(out.resolutions, `place:${n}`).winnings).toBeCloseTo(winnings, 10);
  });

  it('loses on a seven-out during the point phase', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.place[6] = 6;
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'place:6').outcome).toBe('lose');
    expect(out.state.bets.place[6]).toBeUndefined();
  });

  it('is OFF on the come-out by default: a come-out 6 pays nothing', () => {
    const s = state((x) => {
      x.bets.place[6] = 6;
    });
    const out = roll(s, 6);
    expect(find(out.resolutions, 'place:6')).toBeUndefined();
    expect(out.state.bets.place[6]).toBe(6);
  });

  it('is OFF on the come-out by default: a come-out 7 does NOT take it down', () => {
    const s = state((x) => {
      x.bets.place[6] = 6;
    });
    const out = roll(s, 7);
    expect(find(out.resolutions, 'place:6')).toBeUndefined();
    expect(out.state.bets.place[6]).toBe(6);
  });

  it('works on the come-out when toggled on', () => {
    const sWin = state((x) => (x.bets.place[6] = 6), { placeWorkingOnComeOut: true });
    expect(mustFind(roll(sWin, 6).resolutions, 'place:6').winnings).toBeCloseTo(7, 10);

    const sLose = state((x) => (x.bets.place[6] = 6), { placeWorkingOnComeOut: true });
    expect(mustFind(roll(sLose, 7).resolutions, 'place:6').outcome).toBe('lose');
  });
});

// ---------------------------------------------------------------- buy / lay

describe('buy and lay 4/10', () => {
  it('buy 4 for 20 pays 2:1 less 5% of the bet = 39', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.buy[4] = 20;
    });
    const out = roll(s, 4);
    expect(mustFind(out.resolutions, 'buy:4').winnings).toBeCloseTo(39, 10);
  });

  it('buy loses on 7 and is off on the come-out (like place)', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.buy[10] = 20;
    });
    expect(mustFind(roll(s, 7).resolutions, 'buy:10').outcome).toBe('lose');

    const sCO = state((x) => (x.bets.buy[10] = 20));
    expect(find(roll(sCO, 7).resolutions, 'buy:10')).toBeUndefined();
  });

  it('lay 4 for 40 pays 1:2 less 5% of the win = 19', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.lay[4] = 40;
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'lay:4').winnings).toBeCloseTo(19, 10);
  });

  it('lay is ALWAYS working — wins on a come-out 7, loses when its number rolls', () => {
    const sCO = state((x) => (x.bets.lay[4] = 40));
    expect(mustFind(roll(sCO, 7).resolutions, 'lay:4').winnings).toBeCloseTo(19, 10);

    const s = state((x) => (x.bets.lay[10] = 40));
    expect(mustFind(roll(s, 10).resolutions, 'lay:10').outcome).toBe('lose');
  });
});

// ---------------------------------------------------------------- big 6/8

describe('big 6 / big 8', () => {
  it('pay even money and are always working', () => {
    const s = state((x) => {
      x.bets.big6 = 5;
      x.bets.big8 = 5;
    });
    const out = roll(s, 6); // come-out roll
    expect(mustFind(out.resolutions, 'big6').winnings).toBe(5);
    expect(find(out.resolutions, 'big8')).toBeUndefined();
  });

  it('lose on any 7', () => {
    const s = state((x) => {
      x.point = 5;
      x.bets.big6 = 5;
      x.bets.big8 = 5;
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'big6').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'big8').outcome).toBe('lose');
  });
});

// ---------------------------------------------------------------- hardways

describe('hardways', () => {
  it('hard 8 (4+4) pays 9:1', () => {
    const s = state((x) => {
      x.point = 5;
      x.bets.hardways[8] = 5;
    });
    const out = resolve(s, 4, 4);
    expect(mustFind(out.resolutions, 'hardway:8').winnings).toBe(45);
  });

  it('hard 4 (2+2) pays 7:1; hard 10 pays 7:1; hard 6 pays 9:1', () => {
    const mk = (n: 4 | 6 | 8 | 10) =>
      state((x) => {
        x.point = 5;
        x.bets.hardways[n] = 10;
      });
    expect(mustFind(resolve(mk(4), 2, 2).resolutions, 'hardway:4').winnings).toBe(70);
    expect(mustFind(resolve(mk(10), 5, 5).resolutions, 'hardway:10').winnings).toBe(70);
    expect(mustFind(resolve(mk(6), 3, 3).resolutions, 'hardway:6').winnings).toBe(90);
  });

  it('loses the easy way (6 rolled as 2+4)', () => {
    const s = state((x) => {
      x.point = 5;
      x.bets.hardways[6] = 5;
    });
    const out = resolve(s, 2, 4);
    expect(mustFind(out.resolutions, 'hardway:6').outcome).toBe('lose');
  });

  it('loses on any 7', () => {
    const s = state((x) => {
      x.point = 5;
      x.bets.hardways[6] = 5;
      x.bets.hardways[8] = 5;
    });
    const out = roll(s, 7);
    expect(mustFind(out.resolutions, 'hardway:6').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'hardway:8').outcome).toBe('lose');
  });

  it('is OFF on the come-out by default; a come-out hard 8 pays nothing and a come-out 7 does not kill it', () => {
    const s = state((x) => (x.bets.hardways[8] = 5));
    const outHard = resolve(s, 4, 4);
    expect(find(outHard.resolutions, 'hardway:8')).toBeUndefined();

    const s2 = state((x) => (x.bets.hardways[8] = 5));
    const outSeven = roll(s2, 7);
    expect(find(outSeven.resolutions, 'hardway:8')).toBeUndefined();
    expect(outSeven.state.bets.hardways[8]).toBe(5);
  });

  it('works on the come-out when toggled on', () => {
    const s = state((x) => (x.bets.hardways[8] = 5), { hardwaysWorkingOnComeOut: true });
    expect(mustFind(resolve(s, 4, 4).resolutions, 'hardway:8').winnings).toBe(45);
  });
});

// ---------------------------------------------------------------- field

describe('field', () => {
  it('2 pays 2:1, 12 pays 3:1, other field numbers pay even', () => {
    const mk = () => state((x) => (x.bets.field = 10));
    expect(mustFind(roll(mk(), 2).resolutions, 'field').winnings).toBe(20);
    expect(mustFind(roll(mk(), 12).resolutions, 'field').winnings).toBe(30);
    for (const t of [3, 4, 9, 10, 11]) {
      expect(mustFind(roll(mk(), t).resolutions, 'field').winnings).toBe(10);
    }
  });

  it.each([5, 6, 7, 8])('loses on %i', (t) => {
    const s = state((x) => (x.bets.field = 10));
    expect(mustFind(roll(s, t).resolutions, 'field').outcome).toBe('lose');
  });
});

// ---------------------------------------------------------------- props

describe('one-roll props', () => {
  it('any 7 pays 4:1', () => {
    const s = state((x) => (x.bets.props.any7 = 5));
    expect(mustFind(roll(s, 7).resolutions, 'prop:any7').winnings).toBe(20);
  });

  it('any craps pays 7:1 on 2, 3, and 12', () => {
    for (const t of [2, 3, 12]) {
      const s = state((x) => (x.bets.props.anyCraps = 5));
      expect(mustFind(roll(s, t).resolutions, 'prop:anyCraps').winnings).toBe(35);
    }
  });

  it('aces 30:1, boxcars 30:1, ace-deuce 15:1, yo 15:1', () => {
    const mk = (p: 'aces' | 'boxcars' | 'aceDeuce' | 'yo') =>
      state((x) => (x.bets.props[p] = 2));
    expect(mustFind(roll(mk('aces'), 2).resolutions, 'prop:aces').winnings).toBe(60);
    expect(mustFind(roll(mk('boxcars'), 12).resolutions, 'prop:boxcars').winnings).toBe(60);
    expect(mustFind(roll(mk('aceDeuce'), 3).resolutions, 'prop:aceDeuce').winnings).toBe(30);
    expect(mustFind(roll(mk('yo'), 11).resolutions, 'prop:yo').winnings).toBe(30);
  });

  it('one-roll props lose on any other total', () => {
    const s = state((x) => {
      x.bets.props.any7 = 1;
      x.bets.props.aces = 1;
      x.bets.props.yo = 1;
    });
    const out = roll(s, 5);
    expect(mustFind(out.resolutions, 'prop:any7').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'prop:aces').outcome).toBe('lose');
    expect(mustFind(out.resolutions, 'prop:yo').outcome).toBe('lose');
  });

  it('horn $4 nets +27 on 12 (30:1 quarter minus three losing quarters)', () => {
    const s = state((x) => (x.bets.props.horn = 4));
    expect(mustFind(roll(s, 12).resolutions, 'prop:horn').winnings).toBeCloseTo(27, 10);
  });

  it('horn $4 nets +12 on 3; loses whole bet on a non-horn number', () => {
    const s3 = state((x) => (x.bets.props.horn = 4));
    expect(mustFind(roll(s3, 3).resolutions, 'prop:horn').winnings).toBeCloseTo(12, 10);

    const s5 = state((x) => (x.bets.props.horn = 4));
    const r = mustFind(roll(s5, 5).resolutions, 'prop:horn');
    expect(r.outcome).toBe('lose');
    expect(r.stake).toBe(4);
  });

  it('C&E $2: craps nets +6, eleven nets +14, anything else loses', () => {
    const mk = () => state((x) => (x.bets.props.cAndE = 2));
    expect(mustFind(roll(mk(), 3).resolutions, 'prop:cAndE').winnings).toBeCloseTo(6, 10);
    expect(mustFind(roll(mk(), 11).resolutions, 'prop:cAndE').winnings).toBeCloseTo(14, 10);
    expect(mustFind(roll(mk(), 8).resolutions, 'prop:cAndE').outcome).toBe('lose');
  });
});

// ------------------------------------------------- keep-winning-bets toggle

describe('keep-winning-bets-on-table toggle', () => {
  it('ON: standing bet (place) win pays winnings only and the wager stays up', () => {
    const s = state((x) => {
      x.point = 8;
      x.bets.place[6] = 6;
    });
    const bankBefore = s.bankroll;
    const out = roll(s, 6);
    expect(out.state.bankroll).toBeCloseTo(bankBefore + 7, 10);
    expect(out.state.bets.place[6]).toBe(6);
  });

  it('OFF: standing bet win returns wager + winnings and comes down', () => {
    const s = state(
      (x) => {
        x.point = 8;
        x.bets.place[6] = 6;
      },
      { keepWinningBetsOnTable: false },
    );
    const bankBefore = s.bankroll;
    const out = roll(s, 6);
    expect(out.state.bankroll).toBeCloseTo(bankBefore + 13, 10);
    expect(out.state.bets.place[6]).toBeUndefined();
  });

  it('ON: pass line win keeps the flat up (auto re-placed for the next come-out)', () => {
    const s = state((x) => (x.bets.passLine = 10));
    const bankBefore = s.bankroll;
    const out = roll(s, 7);
    expect(out.state.bankroll).toBe(bankBefore + 10);
    expect(out.state.bets.passLine).toBe(10);
  });

  it('OFF: pass line win returns flat + winnings and comes down', () => {
    const s = state((x) => (x.bets.passLine = 10), { keepWinningBetsOnTable: false });
    const bankBefore = s.bankroll;
    const out = roll(s, 7);
    expect(out.state.bankroll).toBe(bankBefore + 20);
    expect(out.state.bets.passLine).toBe(0);
  });

  it('ON: won come point re-places the flat as a new come bet; OFF: it returns to the stack', () => {
    const on = state((x) => {
      x.point = 8;
      x.bets.comePoints[5] = { flat: 5, odds: 0 };
    });
    expect(roll(on, 5).state.bets.come).toBe(5);

    const off = state(
      (x) => {
        x.point = 8;
        x.bets.comePoints[5] = { flat: 5, odds: 0 };
      },
      { keepWinningBetsOnTable: false },
    );
    const outOff = roll(off, 5);
    expect(outOff.state.bets.come).toBe(0);
    expect(mustFind(outOff.resolutions, 'comePoint:5').toBankroll).toBe(10);
  });

  it('ON: field win keeps the wager working; one-roll prop win keeps the wager working', () => {
    const s = state((x) => {
      x.bets.field = 10;
      x.bets.props.yo = 2;
    });
    const out = roll(s, 11);
    expect(out.state.bets.field).toBe(10);
    expect(out.state.bets.props.yo).toBe(2);
  });

  it('odds are always paid out fully (never left up) even with keep ON', () => {
    const s = state((x) => {
      x.point = 6;
      x.bets.passLine = 10;
      x.bets.passOdds = 50;
    });
    const out = roll(s, 6);
    expect(out.state.bets.passOdds).toBe(0);
    expect(mustFind(out.resolutions, 'passOdds').toBankroll).toBeCloseTo(110, 10);
    expect(out.state.bets.passLine).toBe(10); // flat stays
  });
});

// ------------------------------------------------- placeBet / takeDownBet

describe('placeBet validation and bankroll accounting', () => {
  it('debits the bankroll when placing and credits on wins', () => {
    let s = createState({ bankroll: 100 });
    s = placeBet(s, { kind: 'passLine' }, 10);
    expect(s.bankroll).toBe(90);
    const out = roll(s, 7); // keep ON: winnings only
    expect(out.state.bankroll).toBe(100);
    expect(out.state.bets.passLine).toBe(10);
  });

  it('rejects bets that exceed the bankroll, and non-positive amounts', () => {
    const s = createState({ bankroll: 5 });
    expect(() => placeBet(s, { kind: 'field' }, 10)).toThrow(/bankroll/i);
    expect(() => placeBet(s, { kind: 'field' }, 0)).toThrow(/positive/i);
    expect(() => placeBet(s, { kind: 'field' }, -3)).toThrow(/positive/i);
  });

  it('rejects pass/don\'t pass with a point up, and come/don\'t come without a point', () => {
    const pointUp = state((x) => (x.point = 6));
    expect(() => placeBet(pointUp, { kind: 'passLine' }, 5)).toThrow();
    expect(() => placeBet(pointUp, { kind: 'dontPass' }, 5)).toThrow();

    const comeOut = state();
    expect(() => placeBet(comeOut, { kind: 'come' }, 5)).toThrow();
    expect(() => placeBet(comeOut, { kind: 'dontCome' }, 5)).toThrow();
  });

  it('enforces 3-4-5x odds caps on the pass line', () => {
    const mk = (pt: 4 | 6 | 9) =>
      state((x) => {
        x.point = pt;
        x.bets.passLine = 10;
      });
    expect(() => placeBet(mk(4), { kind: 'passOdds' }, 31)).toThrow(/max/i);
    expect(placeBet(mk(4), { kind: 'passOdds' }, 30).bets.passOdds).toBe(30);
    expect(placeBet(mk(9), { kind: 'passOdds' }, 40).bets.passOdds).toBe(40);
    expect(placeBet(mk(6), { kind: 'passOdds' }, 50).bets.passOdds).toBe(50);
    expect(() => placeBet(mk(6), { kind: 'passOdds' }, 51)).toThrow(/max/i);
  });

  it("caps don't pass lay odds by potential WIN (3-4-5x: win up to 6x flat)", () => {
    const mk = () =>
      state((x) => {
        x.point = 4;
        x.bets.dontPass = 10;
      });
    // Win cap = 60; laying 120 at 1:2 wins exactly 60.
    expect(placeBet(mk(), { kind: 'dontPassOdds' }, 120).bets.dontPassOdds).toBe(120);
    expect(() => placeBet(mk(), { kind: 'dontPassOdds' }, 121)).toThrow(/capped/i);
  });

  it('supports a configurable flat odds multiple, including 100x', () => {
    const s = state(
      (x) => {
        x.point = 6;
        x.bets.passLine = 10;
      },
      { oddsPolicy: { type: 'flat', multiple: 100 } },
    );
    expect(placeBet(s, { kind: 'passOdds' }, 1000).bets.passOdds).toBe(1000);
    expect(() => placeBet(s, { kind: 'passOdds' }, 1001)).toThrow(/max/i);
  });

  it('requires an established come point before taking come odds', () => {
    const s = state((x) => (x.point = 6));
    expect(() => placeBet(s, { kind: 'comeOdds', number: 5 }, 10)).toThrow();
  });

  it('takeDownBet returns removable bets to the bankroll and blocks contract pass line', () => {
    let s = createState({ bankroll: 100 });
    s = placeBet(s, { kind: 'field' }, 10);
    s = takeDownBet(s, { kind: 'field' });
    expect(s.bankroll).toBe(100);
    expect(s.bets.field).toBe(0);

    let s2 = createState({ bankroll: 100 });
    s2 = placeBet(s2, { kind: 'passLine' }, 10);
    s2 = roll(s2, 6).state; // point established → contract
    expect(() => takeDownBet(s2, { kind: 'passLine' })).toThrow(/contract/i);
  });
});

describe('reduceBet (chip-level removal) and totalOnTable', () => {
  it('partially reduces a place bet and credits the bankroll', () => {
    let s = createState({ bankroll: 100 });
    s = placeBet(s, { kind: 'place', number: 6 }, 12);
    expect(s.bankroll).toBe(88);
    s = reduceBet(s, { kind: 'place', number: 6 }, 5);
    expect(s.bets.place[6]).toBe(7);
    expect(s.bankroll).toBe(93);
  });

  it('clamps removal to the bet size and clears the spot', () => {
    let s = createState({ bankroll: 100 });
    s = placeBet(s, { kind: 'field' }, 10);
    s = reduceBet(s, { kind: 'field' }, 25);
    expect(s.bets.field).toBe(0);
    expect(s.bankroll).toBe(100);
  });

  it('refuses to reduce a contract pass line with a point up', () => {
    let s = createState({ bankroll: 100 });
    s = placeBet(s, { kind: 'passLine' }, 10);
    s.point = 6;
    expect(() => reduceBet(s, { kind: 'passLine' }, 5)).toThrow(/contract/i);
  });

  it('throws when there is nothing to remove', () => {
    const s = createState({ bankroll: 100 });
    expect(() => reduceBet(s, { kind: 'big6' }, 5)).toThrow(/nothing/i);
  });

  it("removing the whole don't pass flat also returns its lay odds (no stranded odds)", () => {
    let s = createState({ bankroll: 200 });
    s = placeBet(s, { kind: 'dontPass' }, 10);
    s.point = 4;
    s = placeBet(s, { kind: 'dontPassOdds' }, 40);
    expect(s.bankroll).toBe(150);
    s = reduceBet(s, { kind: 'dontPass' }, 10);
    expect(s.bets.dontPass).toBe(0);
    expect(s.bets.dontPassOdds).toBe(0);
    expect(s.bankroll).toBe(200);
  });

  it("partially reducing the don't pass flat keeps the odds up", () => {
    let s = createState({ bankroll: 200 });
    s = placeBet(s, { kind: 'dontPass' }, 10);
    s.point = 4;
    s = placeBet(s, { kind: 'dontPassOdds' }, 20);
    s = reduceBet(s, { kind: 'dontPass' }, 5);
    expect(s.bets.dontPass).toBe(5);
    expect(s.bets.dontPassOdds).toBe(20);
  });

  it('totalOnTable sums every live wager', () => {
    let s = createState({ bankroll: 1000 });
    s = placeBet(s, { kind: 'passLine' }, 10);
    s = placeBet(s, { kind: 'field' }, 5);
    s = placeBet(s, { kind: 'place', number: 8 }, 12);
    s = placeBet(s, { kind: 'hardway', number: 8 }, 2);
    s = placeBet(s, { kind: 'prop', prop: 'yo' }, 1);
    s.bets.comePoints[5] = { flat: 5, odds: 10 };
    expect(totalOnTable(s.bets)).toBe(10 + 5 + 12 + 2 + 1 + 15);
  });
});

// ------------------------------------------------------------ purity & misc

describe('engine purity and events', () => {
  it('resolve never mutates its input state', () => {
    const s = state((x) => {
      x.point = 6;
      x.bets.passLine = 10;
      x.bets.passOdds = 50;
      x.bets.comePoints[5] = { flat: 5, odds: 20 };
      x.bets.place[8] = 12;
      x.bets.props.horn = 4;
    });
    const snapshot = JSON.stringify(s);
    roll(s, 7);
    roll(s, 6);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('a full hand plays through: establish, grind, make the point, seven out', () => {
    let s = createState({ bankroll: 1000 });
    s = placeBet(s, { kind: 'passLine' }, 10);

    let out = roll(s, 6); // point 6
    expect(out.state.point).toBe(6);

    out = roll(out.state, 9); // nothing
    expect(out.event).toBe('roll');

    out = roll(out.state, 6); // point made — keep ON re-places the flat
    expect(out.event).toBe('pointMade');
    expect(out.state.point).toBeNull();
    expect(out.state.bets.passLine).toBe(10);

    out = roll(out.state, 4); // new point
    out = roll(out.state, 7); // seven out
    expect(out.event).toBe('sevenOut');
    expect(out.state.bets.passLine).toBe(0);
    expect(out.state.bankroll).toBe(1000); // -10 bet, +10 first win (winnings only), flat lost
  });
});
