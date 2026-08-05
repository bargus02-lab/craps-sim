// resolve(state, dieA, dieB) -> new state + a full list of per-bet resolutions.
// Pure: never mutates its input. No DOM, no Three.js.
//
// Resolution-order rules encoded here (see NOTES.md):
// - Established Come/Don't Come points resolve BEFORE the flat bet travels.
// - A flat Come bet wins on ANY 7 — including a seven-out that kills the pass
//   line and every established come point on the same roll.
// - Flat Come/Don't Come bets are contract bets and always work, even on the
//   come-out. Come odds are OFF on the come-out by default (returned, not
//   lost/won, when the flat resolves). Don't Come odds are ALWAYS working.
// - 12 is a push on Don't Pass / Don't Come (bar 12) — the bet stays up.
// - Place/Buy are OFF on the come-out by default; Hardways OFF on the come-out
//   by default; Lay, Big 6/8, Field, and one-roll props are always working.

import type { Die, PointNumber, TableState, PropName } from './state';
import { POINT_NUMBERS, HARDWAY_NUMBERS, BUY_LAY_NUMBERS, cloneState } from './state';
import {
  TAKE_ODDS,
  LAY_ODDS,
  PLACE_PAY,
  HARDWAY_PAY,
  PROP_PAY,
  buyWinnings,
  layWinnings,
  fieldMultiplier,
} from './payouts';

export type RollEvent =
  | 'comeOutNatural' // 7 or 11 on the come-out: pass wins, same shooter continues
  | 'comeOutCraps' // 2, 3, or 12 on the come-out
  | 'pointEstablished'
  | 'pointMade'
  | 'sevenOut'
  | 'roll'; // point phase, nothing structural happened

export type Outcome = 'win' | 'lose' | 'push' | 'travel' | 'return';

export interface Resolution {
  /** e.g. 'passLine', 'comePoint:6', 'comeOdds:6', 'place:8', 'prop:horn'. */
  bet: string;
  outcome: Outcome;
  /** Principal that was at risk. */
  stake: number;
  /** Net winnings paid (0 unless outcome is 'win'). */
  winnings: number;
  /** Cash credited to the bankroll by this resolution. */
  toBankroll: number;
  /** Principal left working on the table after this resolution. */
  kept: number;
}

export interface RollResult {
  state: TableState;
  resolutions: Resolution[];
  event: RollEvent;
  total: number;
  dice: [Die, Die];
}

function isPointNumber(t: number): t is PointNumber {
  return t === 4 || t === 5 || t === 6 || t === 8 || t === 9 || t === 10;
}

export function resolve(prev: TableState, a: Die, b: Die): RollResult {
  const s = cloneState(prev);
  const R: Resolution[] = [];
  const total = a + b;
  const rolledHard = a === b;
  const point = s.point;
  const comeOut = point === null;
  const keep = s.settings.keepWinningBetsOnTable;
  const bets = s.bets;

  const win = (bet: string, stake: number, winnings: number, keepStake: boolean) => {
    const toBankroll = winnings + (keepStake ? 0 : stake);
    s.bankroll += toBankroll;
    R.push({ bet, outcome: 'win', stake, winnings, toBankroll, kept: keepStake ? stake : 0 });
  };
  const lose = (bet: string, stake: number) => {
    R.push({ bet, outcome: 'lose', stake, winnings: 0, toBankroll: 0, kept: 0 });
  };
  const push = (bet: string, stake: number) => {
    R.push({ bet, outcome: 'push', stake, winnings: 0, toBankroll: 0, kept: stake });
  };
  const giveBack = (bet: string, stake: number) => {
    s.bankroll += stake;
    R.push({ bet, outcome: 'return', stake, winnings: 0, toBankroll: stake, kept: 0 });
  };
  const travel = (bet: string, stake: number) => {
    R.push({ bet, outcome: 'travel', stake, winnings: 0, toBankroll: 0, kept: stake });
  };

  // ---------------------------------------------------------------- Pass line
  if (bets.passLine > 0) {
    const flat = bets.passLine;
    if (comeOut) {
      if (total === 7 || total === 11) {
        // Natural: winner. Same shooter rolls again — NOT a seven-out.
        win('passLine', flat, flat, keep);
        if (!keep) bets.passLine = 0;
      } else if (total === 2 || total === 3 || total === 12) {
        lose('passLine', flat);
        bets.passLine = 0;
      }
      // Otherwise the point is established below; the flat is now a contract bet.
    } else if (total === point) {
      win('passLine', flat, flat, keep);
      if (!keep) bets.passLine = 0;
      if (bets.passOdds > 0) {
        const o = bets.passOdds;
        win('passOdds', o, o * TAKE_ODDS[point], false);
        bets.passOdds = 0;
      }
    } else if (total === 7) {
      lose('passLine', flat);
      bets.passLine = 0;
      if (bets.passOdds > 0) {
        lose('passOdds', bets.passOdds);
        bets.passOdds = 0;
      }
    }
  }

  // --------------------------------------------------------------- Don't pass
  if (bets.dontPass > 0) {
    const flat = bets.dontPass;
    if (comeOut) {
      if (total === 2 || total === 3) {
        win('dontPass', flat, flat, keep);
        if (!keep) bets.dontPass = 0;
      } else if (total === 12) {
        push('dontPass', flat); // bar 12 — the bet stays up
      } else if (total === 7 || total === 11) {
        lose('dontPass', flat);
        bets.dontPass = 0;
      }
    } else if (total === 7) {
      win('dontPass', flat, flat, keep);
      if (!keep) bets.dontPass = 0;
      if (bets.dontPassOdds > 0) {
        const o = bets.dontPassOdds;
        win('dontPassOdds', o, o * LAY_ODDS[point], false);
        bets.dontPassOdds = 0;
      }
    } else if (total === point) {
      lose('dontPass', flat);
      bets.dontPass = 0;
      if (bets.dontPassOdds > 0) {
        lose('dontPassOdds', bets.dontPassOdds);
        bets.dontPassOdds = 0;
      }
    }
  }

  // ------------------------------------- Established come points (BEFORE travel)
  // A won come-point flat is re-placed as a fresh flat come bet when
  // keepWinningBetsOnTable is on — but only AFTER the current flat's travel is
  // processed, so the re-placed bet cannot act on this same roll.
  let replacedComeFlat = 0;
  const comeOddsWorking = !comeOut || s.settings.comeOddsWorkingOnComeOut;
  for (const n of POINT_NUMBERS) {
    const cp = bets.comePoints[n];
    if (!cp) continue;
    if (total === n) {
      win(`comePoint:${n}`, cp.flat, cp.flat, keep);
      if (keep) replacedComeFlat += cp.flat;
      if (cp.odds > 0) {
        if (comeOddsWorking) win(`comeOdds:${n}`, cp.odds, cp.odds * TAKE_ODDS[n], false);
        else giveBack(`comeOdds:${n}`, cp.odds); // odds off on the come-out: returned
      }
      delete bets.comePoints[n];
    } else if (total === 7) {
      lose(`comePoint:${n}`, cp.flat);
      if (cp.odds > 0) {
        if (comeOddsWorking) lose(`comeOdds:${n}`, cp.odds);
        else giveBack(`comeOdds:${n}`, cp.odds);
      }
      delete bets.comePoints[n];
    }
  }

  // -------------------------------------------- Flat come bet (its own come-out)
  if (bets.come > 0) {
    const flat = bets.come;
    if (total === 7 || total === 11) {
      // Wins on ANY 7 — even when that 7 is a seven-out for the pass line.
      win('come', flat, flat, keep);
      if (!keep) bets.come = 0;
    } else if (total === 2 || total === 3 || total === 12) {
      lose('come', flat);
      bets.come = 0;
    } else if (isPointNumber(total)) {
      // Any established come point on this number was already resolved above.
      travel('come', flat);
      bets.comePoints[total] = { flat, odds: 0 };
      bets.come = 0;
    }
  }
  bets.come += replacedComeFlat;

  // ------------------------------- Established don't come points (BEFORE travel)
  let replacedDontComeFlat = 0;
  for (const n of POINT_NUMBERS) {
    const dcp = bets.dontComePoints[n];
    if (!dcp) continue;
    if (total === 7) {
      win(`dontComePoint:${n}`, dcp.flat, dcp.flat, keep);
      if (keep) replacedDontComeFlat += dcp.flat;
      if (dcp.odds > 0) {
        // Don't come odds are ALWAYS working, including on the come-out.
        win(`dontComeOdds:${n}`, dcp.odds, dcp.odds * LAY_ODDS[n], false);
      }
      delete bets.dontComePoints[n];
    } else if (total === n) {
      lose(`dontComePoint:${n}`, dcp.flat);
      if (dcp.odds > 0) lose(`dontComeOdds:${n}`, dcp.odds);
      delete bets.dontComePoints[n];
    }
  }

  // -------------------------------------------------------- Flat don't come bet
  if (bets.dontCome > 0) {
    const flat = bets.dontCome;
    if (total === 2 || total === 3) {
      win('dontCome', flat, flat, keep);
      if (!keep) bets.dontCome = 0;
    } else if (total === 12) {
      push('dontCome', flat); // bar 12
    } else if (total === 7 || total === 11) {
      lose('dontCome', flat);
      bets.dontCome = 0;
    } else if (isPointNumber(total)) {
      travel('dontCome', flat);
      bets.dontComePoints[total] = { flat, odds: 0 };
      bets.dontCome = 0;
    }
  }
  bets.dontCome += replacedDontComeFlat;

  // ------------------------------------------- Place + Buy (share a working rule)
  const placeWorking = !comeOut || s.settings.placeWorkingOnComeOut;
  if (placeWorking) {
    for (const n of POINT_NUMBERS) {
      const p = bets.place[n];
      if (!p) continue;
      if (total === n) {
        win(`place:${n}`, p, p * PLACE_PAY[n], keep);
        if (!keep) delete bets.place[n];
      } else if (total === 7) {
        lose(`place:${n}`, p);
        delete bets.place[n];
      }
    }
    for (const n of BUY_LAY_NUMBERS) {
      const buy = bets.buy[n];
      if (!buy) continue;
      if (total === n) {
        win(`buy:${n}`, buy, buyWinnings(buy), keep);
        if (!keep) delete bets.buy[n];
      } else if (total === 7) {
        lose(`buy:${n}`, buy);
        delete bets.buy[n];
      }
    }
  }

  // --------------------------------------------------- Lay 4/10 (always working)
  for (const n of BUY_LAY_NUMBERS) {
    const lay = bets.lay[n];
    if (!lay) continue;
    if (total === 7) {
      win(`lay:${n}`, lay, layWinnings(lay), keep);
      if (!keep) delete bets.lay[n];
    } else if (total === n) {
      lose(`lay:${n}`, lay);
      delete bets.lay[n];
    }
  }

  // -------------------------------------------------- Big 6 / 8 (always working)
  if (bets.big6 > 0) {
    if (total === 6) {
      win('big6', bets.big6, bets.big6, keep);
      if (!keep) bets.big6 = 0;
    } else if (total === 7) {
      lose('big6', bets.big6);
      bets.big6 = 0;
    }
  }
  if (bets.big8 > 0) {
    if (total === 8) {
      win('big8', bets.big8, bets.big8, keep);
      if (!keep) bets.big8 = 0;
    } else if (total === 7) {
      lose('big8', bets.big8);
      bets.big8 = 0;
    }
  }

  // ------------------------------------------------------------------ Hardways
  const hardwaysWorking = !comeOut || s.settings.hardwaysWorkingOnComeOut;
  if (hardwaysWorking) {
    for (const n of HARDWAY_NUMBERS) {
      const h = bets.hardways[n];
      if (!h) continue;
      if (total === 7) {
        lose(`hardway:${n}`, h);
        delete bets.hardways[n];
      } else if (total === n) {
        if (rolledHard) {
          win(`hardway:${n}`, h, h * HARDWAY_PAY[n], keep);
          if (!keep) delete bets.hardways[n];
        } else {
          lose(`hardway:${n}`, h); // the easy way
          delete bets.hardways[n];
        }
      }
    }
  }

  // ------------------------------------------------------- Field (one roll, always on)
  if (bets.field > 0) {
    const m = fieldMultiplier(total);
    if (m !== null) {
      win('field', bets.field, bets.field * m, keep);
      if (!keep) bets.field = 0;
    } else {
      lose('field', bets.field);
      bets.field = 0;
    }
  }

  // ---------------------------------------------- One-roll props (always working)
  const props = bets.props;
  const oneRoll = (
    name: Exclude<PropName, 'horn' | 'cAndE'>,
    wins: boolean,
    rate: number,
  ) => {
    const stake = props[name];
    if (stake <= 0) return;
    if (wins) {
      win(`prop:${name}`, stake, stake * rate, keep);
      if (!keep) props[name] = 0;
    } else {
      lose(`prop:${name}`, stake);
      props[name] = 0;
    }
  };
  oneRoll('any7', total === 7, PROP_PAY.any7);
  oneRoll('anyCraps', total === 2 || total === 3 || total === 12, PROP_PAY.anyCraps);
  oneRoll('aces', total === 2, PROP_PAY.aces);
  oneRoll('boxcars', total === 12, PROP_PAY.boxcars);
  oneRoll('aceDeuce', total === 3, PROP_PAY.aceDeuce);
  oneRoll('yo', total === 11, PROP_PAY.yo);

  // Horn: four equal parts on 2 / 3 / 11 / 12. Winnings are NET of the three
  // losing quarters (the standard way a horn is paid).
  if (props.horn > 0) {
    const quarter = props.horn / 4;
    let net: number | null = null;
    if (total === 2 || total === 12) net = quarter * 30 - 3 * quarter;
    else if (total === 3 || total === 11) net = quarter * 15 - 3 * quarter;
    if (net !== null) {
      win('prop:horn', props.horn, net, keep);
      if (!keep) props.horn = 0;
    } else {
      lose('prop:horn', props.horn);
      props.horn = 0;
    }
  }

  // C&E: half on any craps (7:1 on that half), half on eleven (15:1 on that half).
  if (props.cAndE > 0) {
    const half = props.cAndE / 2;
    let net: number | null = null;
    if (total === 2 || total === 3 || total === 12) net = half * PROP_PAY.anyCraps - half;
    else if (total === 11) net = half * PROP_PAY.yo - half;
    if (net !== null) {
      win('prop:cAndE', props.cAndE, net, keep);
      if (!keep) props.cAndE = 0;
    } else {
      lose('prop:cAndE', props.cAndE);
      props.cAndE = 0;
    }
  }

  // ---------------------------------------------------------- Phase transition
  let event: RollEvent;
  if (comeOut) {
    if (isPointNumber(total)) {
      s.point = total;
      event = 'pointEstablished';
    } else if (total === 7 || total === 11) {
      event = 'comeOutNatural';
    } else {
      event = 'comeOutCraps';
    }
  } else if (total === point) {
    s.point = null;
    event = 'pointMade';
  } else if (total === 7) {
    s.point = null;
    event = 'sevenOut';
  } else {
    event = 'roll';
  }

  return { state: s, resolutions: R, event, total, dice: [a, b] };
}
