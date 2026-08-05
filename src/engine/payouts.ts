// Payout tables. All values are win-per-unit-staked multipliers (net winnings,
// excluding the returned stake). Pure data + tiny pure helpers.

import type { PointNumber, HardwayNumber } from './state';

/** Take-odds behind Pass/Come. True odds, zero house edge. */
export const TAKE_ODDS: Record<PointNumber, number> = {
  4: 2,
  5: 3 / 2,
  6: 6 / 5,
  8: 6 / 5,
  9: 3 / 2,
  10: 2,
};

/** Lay-odds behind Don't Pass/Don't Come. True odds, zero house edge. */
export const LAY_ODDS: Record<PointNumber, number> = {
  4: 1 / 2,
  5: 2 / 3,
  6: 5 / 6,
  8: 5 / 6,
  9: 2 / 3,
  10: 1 / 2,
};

export const PLACE_PAY: Record<PointNumber, number> = {
  4: 9 / 5,
  5: 7 / 5,
  6: 7 / 6,
  8: 7 / 6,
  9: 7 / 5,
  10: 9 / 5,
};

export const HARDWAY_PAY: Record<HardwayNumber, number> = {
  4: 7,
  6: 9,
  8: 9,
  10: 7,
};

export const PROP_PAY = {
  any7: 4,
  anyCraps: 7,
  aces: 30,
  boxcars: 30,
  aceDeuce: 15,
  yo: 15,
} as const;

/** Buy 4/10: paid 2:1 less a 5% commission on the BET, charged only on a win. */
export const BUY_COMMISSION = 0.05;
/** Lay 4/10: paid 1:2 less a 5% commission on the WIN, charged only on a win. */
export const LAY_COMMISSION = 0.05;

export function buyWinnings(bet: number): number {
  return bet * 2 - bet * BUY_COMMISSION;
}

export function layWinnings(bet: number): number {
  const win = bet / 2;
  return win - win * LAY_COMMISSION;
}

/** Field win multiplier for a roll total, or null if the field loses. */
export function fieldMultiplier(total: number): number | null {
  switch (total) {
    case 2:
      return 2;
    case 12:
      return 3;
    case 3:
    case 4:
    case 9:
    case 10:
    case 11:
      return 1;
    default:
      return null;
  }
}
