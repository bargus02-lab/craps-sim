// Pure table state + bet placement. No DOM, no Three.js, no side effects.

export type Die = 1 | 2 | 3 | 4 | 5 | 6;
export type PointNumber = 4 | 5 | 6 | 8 | 9 | 10;
export type HardwayNumber = 4 | 6 | 8 | 10;
export type BuyLayNumber = 4 | 10;

export const POINT_NUMBERS: readonly PointNumber[] = [4, 5, 6, 8, 9, 10];
export const HARDWAY_NUMBERS: readonly HardwayNumber[] = [4, 6, 8, 10];
export const BUY_LAY_NUMBERS: readonly BuyLayNumber[] = [4, 10];

export type PropName =
  | 'any7'
  | 'anyCraps'
  | 'aces'
  | 'boxcars'
  | 'aceDeuce'
  | 'yo'
  | 'horn'
  | 'cAndE';

export const PROP_NAMES: readonly PropName[] = [
  'any7',
  'anyCraps',
  'aces',
  'boxcars',
  'aceDeuce',
  'yo',
  'horn',
  'cAndE',
];

/**
 * Odds cap policy.
 * - '345': 3x on 4/10, 4x on 5/9, 5x on 6/8 for take-odds; the don't side may
 *   lay enough to WIN up to 6x the flat bet (the standard 3-4-5x lay rule).
 * - flat: take-odds up to `multiple` x flat; don't side may lay to WIN up to
 *   `multiple` x flat.
 */
export type OddsPolicy = { type: '345' } | { type: 'flat'; multiple: number };

export interface Settings {
  /** Standing bets stay up on a win; contract bets auto re-place. Default ON. */
  keepWinningBetsOnTable: boolean;
  /** Place (and Buy) bets working on the come-out. Default OFF. */
  placeWorkingOnComeOut: boolean;
  /** Hardways working on the come-out. Default OFF. */
  hardwaysWorkingOnComeOut: boolean;
  /** Odds behind established Come points working on the come-out. Default OFF.
   *  (Don't Come odds are ALWAYS working — not togglable, per standard rules.) */
  comeOddsWorkingOnComeOut: boolean;
  oddsPolicy: OddsPolicy;
}

export interface PointBet {
  flat: number;
  odds: number;
}

export interface Bets {
  passLine: number;
  passOdds: number;
  dontPass: number;
  dontPassOdds: number;
  /** Flat come bet that has not yet traveled to a number. */
  come: number;
  comePoints: Partial<Record<PointNumber, PointBet>>;
  /** Flat don't come bet that has not yet traveled. */
  dontCome: number;
  dontComePoints: Partial<Record<PointNumber, PointBet>>;
  place: Partial<Record<PointNumber, number>>;
  buy: Partial<Record<BuyLayNumber, number>>;
  lay: Partial<Record<BuyLayNumber, number>>;
  field: number;
  big6: number;
  big8: number;
  hardways: Partial<Record<HardwayNumber, number>>;
  props: Record<PropName, number>;
}

export interface TableState {
  /** null = come-out roll. */
  point: PointNumber | null;
  bankroll: number;
  bets: Bets;
  settings: Settings;
}

export function defaultSettings(): Settings {
  return {
    keepWinningBetsOnTable: true,
    placeWorkingOnComeOut: false,
    hardwaysWorkingOnComeOut: false,
    comeOddsWorkingOnComeOut: false,
    oddsPolicy: { type: '345' },
  };
}

export function emptyBets(): Bets {
  return {
    passLine: 0,
    passOdds: 0,
    dontPass: 0,
    dontPassOdds: 0,
    come: 0,
    comePoints: {},
    dontCome: 0,
    dontComePoints: {},
    place: {},
    buy: {},
    lay: {},
    field: 0,
    big6: 0,
    big8: 0,
    hardways: {},
    props: {
      any7: 0,
      anyCraps: 0,
      aces: 0,
      boxcars: 0,
      aceDeuce: 0,
      yo: 0,
      horn: 0,
      cAndE: 0,
    },
  };
}

export function createState(opts?: {
  bankroll?: number;
  settings?: Partial<Settings>;
}): TableState {
  return {
    point: null,
    bankroll: opts?.bankroll ?? 1000,
    bets: emptyBets(),
    settings: { ...defaultSettings(), ...opts?.settings },
  };
}

function clonePointBets(
  src: Partial<Record<PointNumber, PointBet>>,
): Partial<Record<PointNumber, PointBet>> {
  const out: Partial<Record<PointNumber, PointBet>> = {};
  for (const n of POINT_NUMBERS) {
    const pb = src[n];
    if (pb) out[n] = { flat: pb.flat, odds: pb.odds };
  }
  return out;
}

/** Fast manual deep clone — resolve() is called millions of times in simulations. */
export function cloneState(s: TableState): TableState {
  return {
    point: s.point,
    bankroll: s.bankroll,
    settings: { ...s.settings, oddsPolicy: { ...s.settings.oddsPolicy } },
    bets: {
      passLine: s.bets.passLine,
      passOdds: s.bets.passOdds,
      dontPass: s.bets.dontPass,
      dontPassOdds: s.bets.dontPassOdds,
      come: s.bets.come,
      comePoints: clonePointBets(s.bets.comePoints),
      dontCome: s.bets.dontCome,
      dontComePoints: clonePointBets(s.bets.dontComePoints),
      place: { ...s.bets.place },
      buy: { ...s.bets.buy },
      lay: { ...s.bets.lay },
      field: s.bets.field,
      big6: s.bets.big6,
      big8: s.bets.big8,
      hardways: { ...s.bets.hardways },
      props: { ...s.bets.props },
    },
  };
}

export function updateSettings(
  state: TableState,
  patch: Partial<Settings>,
): TableState {
  const s = cloneState(state);
  s.settings = { ...s.settings, ...patch };
  return s;
}

export type BetTarget =
  | { kind: 'passLine' }
  | { kind: 'passOdds' }
  | { kind: 'dontPass' }
  | { kind: 'dontPassOdds' }
  | { kind: 'come' }
  | { kind: 'comeOdds'; number: PointNumber }
  | { kind: 'dontCome' }
  | { kind: 'dontComeOdds'; number: PointNumber }
  | { kind: 'place'; number: PointNumber }
  | { kind: 'buy'; number: BuyLayNumber }
  | { kind: 'lay'; number: BuyLayNumber }
  | { kind: 'field' }
  | { kind: 'big6' }
  | { kind: 'big8' }
  | { kind: 'hardway'; number: HardwayNumber }
  | { kind: 'prop'; prop: PropName };

const EPS = 1e-9;

export function maxTakeOddsMultiple(policy: OddsPolicy, n: PointNumber): number {
  if (policy.type === 'flat') return policy.multiple;
  return n === 4 || n === 10 ? 3 : n === 5 || n === 9 ? 4 : 5;
}

/**
 * Maximum lay-odds AMOUNT behind a don't bet.
 * - 3-4-5x: the don't side may lay up to 6x the flat bet on any point —
 *   winning 3x/4x/5x the flat depending on the point, the exact mirror of the
 *   take-odds schedule (the standard casino rule).
 * - Flat Nx: the don't side may lay enough to WIN up to Nx the flat
 *   (e.g. 100x on the 4 allows laying 200x to win 100x).
 */
export function maxLayAmount(
  policy: OddsPolicy,
  point: PointNumber,
  flat: number,
): number {
  if (policy.type === '345') return 6 * flat;
  return (policy.multiple * flat) / LAY_ODDS[point];
}

import { LAY_ODDS } from './payouts';

/** Returns a new state with the bet added and bankroll debited. Throws on invalid bets. */
export function placeBet(
  state: TableState,
  target: BetTarget,
  amount: number,
): TableState {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bet amount must be a positive number');
  }
  if (amount > state.bankroll + EPS) {
    throw new Error('Insufficient bankroll');
  }
  const s = cloneState(state);
  const bets = s.bets;
  const policy = s.settings.oddsPolicy;

  switch (target.kind) {
    case 'passLine':
      if (s.point !== null)
        throw new Error('Pass line bets may only be placed on the come-out');
      bets.passLine += amount;
      break;
    case 'passOdds': {
      if (s.point === null) throw new Error('Pass odds require an established point');
      if (bets.passLine <= 0) throw new Error('Pass odds require a pass line bet');
      const max = bets.passLine * maxTakeOddsMultiple(policy, s.point);
      if (bets.passOdds + amount > max + EPS)
        throw new Error(`Max pass odds behind ${bets.passLine} on ${s.point} is ${max}`);
      bets.passOdds += amount;
      break;
    }
    case 'dontPass':
      if (s.point !== null)
        throw new Error("Don't pass bets may only be placed on the come-out");
      bets.dontPass += amount;
      break;
    case 'dontPassOdds': {
      if (s.point === null) throw new Error("Don't pass odds require an established point");
      if (bets.dontPass <= 0) throw new Error("Don't pass odds require a don't pass bet");
      const max = maxLayAmount(policy, s.point, bets.dontPass);
      if (bets.dontPassOdds + amount > max + EPS)
        throw new Error(`Max lay odds behind ${bets.dontPass} on the ${s.point} is ${max}`);
      bets.dontPassOdds += amount;
      break;
    }
    case 'come':
      if (s.point === null) throw new Error('Come bets require an established point');
      bets.come += amount;
      break;
    case 'comeOdds': {
      const cp = bets.comePoints[target.number];
      if (!cp || cp.flat <= 0) throw new Error(`No come point established on ${target.number}`);
      const max = cp.flat * maxTakeOddsMultiple(policy, target.number);
      if (cp.odds + amount > max + EPS)
        throw new Error(`Max come odds on ${target.number} is ${max}`);
      cp.odds += amount;
      break;
    }
    case 'dontCome':
      if (s.point === null) throw new Error("Don't come bets require an established point");
      bets.dontCome += amount;
      break;
    case 'dontComeOdds': {
      const dcp = bets.dontComePoints[target.number];
      if (!dcp || dcp.flat <= 0)
        throw new Error(`No don't come point established on ${target.number}`);
      const max = maxLayAmount(policy, target.number, dcp.flat);
      if (dcp.odds + amount > max + EPS)
        throw new Error(`Max lay odds behind ${dcp.flat} on the ${target.number} is ${max}`);
      dcp.odds += amount;
      break;
    }
    case 'place':
      bets.place[target.number] = (bets.place[target.number] ?? 0) + amount;
      break;
    case 'buy':
      bets.buy[target.number] = (bets.buy[target.number] ?? 0) + amount;
      break;
    case 'lay':
      bets.lay[target.number] = (bets.lay[target.number] ?? 0) + amount;
      break;
    case 'field':
      bets.field += amount;
      break;
    case 'big6':
      bets.big6 += amount;
      break;
    case 'big8':
      bets.big8 += amount;
      break;
    case 'hardway':
      bets.hardways[target.number] = (bets.hardways[target.number] ?? 0) + amount;
      break;
    case 'prop':
      bets.props[target.prop] += amount;
      break;
  }

  s.bankroll -= amount;
  return s;
}

/**
 * Take a bet down (between rolls) and return it to the bankroll.
 * Contract bets that are already "traveling" cannot be removed:
 * pass/don't-pass flat with a point up... pass line is locked; don't pass MAY
 * come down (player-unfavorable, but legal). Come/Don't-come points: the flat
 * is locked on the do side, removable on the don't side. Odds are always removable.
 */
export function takeDownBet(state: TableState, target: BetTarget): TableState {
  const s = cloneState(state);
  const bets = s.bets;
  let returned = 0;

  switch (target.kind) {
    case 'passLine':
      if (s.point !== null)
        throw new Error('Pass line is a contract bet and cannot come down with a point up');
      returned = bets.passLine;
      bets.passLine = 0;
      break;
    case 'passOdds':
      returned = bets.passOdds;
      bets.passOdds = 0;
      break;
    case 'dontPass':
      returned = bets.dontPass + bets.dontPassOdds;
      bets.dontPass = 0;
      bets.dontPassOdds = 0;
      break;
    case 'dontPassOdds':
      returned = bets.dontPassOdds;
      bets.dontPassOdds = 0;
      break;
    case 'come':
      returned = bets.come;
      bets.come = 0;
      break;
    case 'comeOdds': {
      const cp = bets.comePoints[target.number];
      if (cp) {
        returned = cp.odds;
        cp.odds = 0;
      }
      break;
    }
    case 'dontCome':
      returned = bets.dontCome;
      bets.dontCome = 0;
      break;
    case 'dontComeOdds': {
      const dcp = bets.dontComePoints[target.number];
      if (dcp) {
        returned = dcp.odds;
        dcp.odds = 0;
      }
      break;
    }
    case 'place':
      returned = bets.place[target.number] ?? 0;
      delete bets.place[target.number];
      break;
    case 'buy':
      returned = bets.buy[target.number] ?? 0;
      delete bets.buy[target.number];
      break;
    case 'lay':
      returned = bets.lay[target.number] ?? 0;
      delete bets.lay[target.number];
      break;
    case 'field':
      returned = bets.field;
      bets.field = 0;
      break;
    case 'big6':
      returned = bets.big6;
      bets.big6 = 0;
      break;
    case 'big8':
      returned = bets.big8;
      bets.big8 = 0;
      break;
    case 'hardway':
      returned = bets.hardways[target.number] ?? 0;
      delete bets.hardways[target.number];
      break;
    case 'prop':
      returned = bets.props[target.prop];
      bets.props[target.prop] = 0;
      break;
  }

  s.bankroll += returned;
  return s;
}

/** A don't-come point flat may be taken down (don't side is removable). */
export function takeDownDontComePoint(
  state: TableState,
  number: PointNumber,
): TableState {
  const s = cloneState(state);
  const dcp = s.bets.dontComePoints[number];
  if (dcp) {
    s.bankroll += dcp.flat + dcp.odds;
    delete s.bets.dontComePoints[number];
  }
  return s;
}

/**
 * Take part of a bet down (chip-level removal in the UI). Clamped to the
 * current amount; enforces the same contract-bet restrictions as takeDownBet.
 */
export function reduceBet(
  state: TableState,
  target: BetTarget,
  amount: number,
): TableState {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  const s = cloneState(state);
  const bets = s.bets;

  const take = (current: number, apply: (left: number) => void): number => {
    const removed = Math.min(current, amount);
    apply(current - removed);
    return removed;
  };

  let returned = 0;
  switch (target.kind) {
    case 'passLine':
      if (s.point !== null)
        throw new Error('Pass line is a contract bet and cannot come down with a point up');
      returned = take(bets.passLine, (left) => (bets.passLine = left));
      break;
    case 'passOdds':
      returned = take(bets.passOdds, (left) => (bets.passOdds = left));
      break;
    case 'dontPass':
      returned = take(bets.dontPass, (left) => (bets.dontPass = left));
      // Lay odds cannot exist without the flat bet (takeDownBet parity).
      if (bets.dontPass === 0 && bets.dontPassOdds > 0) {
        returned += bets.dontPassOdds;
        bets.dontPassOdds = 0;
      }
      break;
    case 'dontPassOdds':
      returned = take(bets.dontPassOdds, (left) => (bets.dontPassOdds = left));
      break;
    case 'come':
      returned = take(bets.come, (left) => (bets.come = left));
      break;
    case 'comeOdds': {
      const cp = bets.comePoints[target.number];
      if (cp) returned = take(cp.odds, (left) => (cp.odds = left));
      break;
    }
    case 'dontCome':
      returned = take(bets.dontCome, (left) => (bets.dontCome = left));
      break;
    case 'dontComeOdds': {
      const dcp = bets.dontComePoints[target.number];
      if (dcp) returned = take(dcp.odds, (left) => (dcp.odds = left));
      break;
    }
    case 'place':
      returned = take(bets.place[target.number] ?? 0, (left) => {
        if (left > 0) bets.place[target.number] = left;
        else delete bets.place[target.number];
      });
      break;
    case 'buy':
      returned = take(bets.buy[target.number] ?? 0, (left) => {
        if (left > 0) bets.buy[target.number] = left;
        else delete bets.buy[target.number];
      });
      break;
    case 'lay':
      returned = take(bets.lay[target.number] ?? 0, (left) => {
        if (left > 0) bets.lay[target.number] = left;
        else delete bets.lay[target.number];
      });
      break;
    case 'field':
      returned = take(bets.field, (left) => (bets.field = left));
      break;
    case 'big6':
      returned = take(bets.big6, (left) => (bets.big6 = left));
      break;
    case 'big8':
      returned = take(bets.big8, (left) => (bets.big8 = left));
      break;
    case 'hardway':
      returned = take(bets.hardways[target.number] ?? 0, (left) => {
        if (left > 0) bets.hardways[target.number] = left;
        else delete bets.hardways[target.number];
      });
      break;
    case 'prop':
      returned = take(bets.props[target.prop], (left) => (bets.props[target.prop] = left));
      break;
  }

  if (returned <= 0) throw new Error('Nothing to take down there');
  s.bankroll += returned;
  return s;
}

/** Total of every wager currently working on the table. */
export function totalOnTable(bets: Bets): number {
  let sum =
    bets.passLine +
    bets.passOdds +
    bets.dontPass +
    bets.dontPassOdds +
    bets.come +
    bets.dontCome +
    bets.field +
    bets.big6 +
    bets.big8;
  for (const n of POINT_NUMBERS) {
    sum += bets.comePoints[n] ? bets.comePoints[n].flat + bets.comePoints[n].odds : 0;
    sum += bets.dontComePoints[n]
      ? bets.dontComePoints[n].flat + bets.dontComePoints[n].odds
      : 0;
    sum += bets.place[n] ?? 0;
  }
  for (const n of BUY_LAY_NUMBERS) {
    sum += (bets.buy[n] ?? 0) + (bets.lay[n] ?? 0);
  }
  for (const n of HARDWAY_NUMBERS) sum += bets.hardways[n] ?? 0;
  for (const p of PROP_NAMES) sum += bets.props[p];
  return sum;
}
