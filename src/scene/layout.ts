// The betting layout: one source of truth for clickable regions, chip anchor
// points, and the painted felt art. All coordinates are world-space meters on
// the felt plane (x along the table, z across it; player rail is +z).

import type { BetTarget, PointNumber } from '../engine/state';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface LayoutRegion {
  /** Stable id matching the engine's resolution ids where applicable. */
  id: string;
  target: BetTarget;
  rect: Rect;
  /** Hover / toast label. */
  label: string;
  /** Chip anchor (defaults to rect center). */
  anchor?: { x: number; z: number };
}

const center = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

// ---- Number boxes across the far side --------------------------------------
const NUM_Z0 = -0.63;
const NUM_Z1 = -0.4;
const LAY_BAND = 0.055; // top strip of the 4/10 boxes
const BUY_BAND = 0.055; // bottom strip of the 4/10 boxes
const NUMBERS: PointNumber[] = [4, 5, 6, 8, 9, 10];
const NUM_X0 = -1.0;
const NUM_W = 0.28;

export function numberBoxRect(n: PointNumber): Rect {
  const i = NUMBERS.indexOf(n);
  return { x0: NUM_X0 + i * NUM_W, z0: NUM_Z0, x1: NUM_X0 + (i + 1) * NUM_W, z1: NUM_Z1 };
}

function buildRegions(): LayoutRegion[] {
  const regions: LayoutRegion[] = [];

  for (const n of NUMBERS) {
    const box = numberBoxRect(n);
    const isBuyLay = n === 4 || n === 10;
    const placeRect: Rect = isBuyLay
      ? { ...box, z0: box.z0 + LAY_BAND, z1: box.z1 - BUY_BAND }
      : box;
    regions.push({
      id: `place:${n}`,
      target: { kind: 'place', number: n },
      rect: placeRect,
      label: `Place ${n}`,
      anchor: { x: (box.x0 + box.x1) / 2, z: box.z1 - BUY_BAND - 0.045 },
    });
    if (isBuyLay) {
      regions.push({
        id: `lay:${n}`,
        target: { kind: 'lay', number: n as 4 | 10 },
        rect: { ...box, z1: box.z0 + LAY_BAND },
        label: `Lay ${n}`,
      });
      regions.push({
        id: `buy:${n}`,
        target: { kind: 'buy', number: n as 4 | 10 },
        rect: { ...box, z0: box.z1 - BUY_BAND },
        label: `Buy ${n}`,
      });
    }
  }

  regions.push(
    {
      id: 'dontCome',
      target: { kind: 'dontCome' },
      rect: { x0: -1.26, z0: NUM_Z0, x1: -1.0, z1: NUM_Z1 },
      label: "Don't Come",
    },
    {
      id: 'field',
      target: { kind: 'field' },
      rect: { x0: -1.08, z0: -0.385, x1: 0.1, z1: -0.245 },
      label: 'Field',
    },
    {
      id: 'come',
      target: { kind: 'come' },
      rect: { x0: -1.08, z0: -0.23, x1: 0.1, z1: -0.075 },
      label: 'Come',
    },
    {
      id: 'big6',
      target: { kind: 'big6' },
      rect: { x0: -1.06, z0: -0.045, x1: -0.9, z1: 0.015 },
      label: 'Big 6',
    },
    {
      id: 'big8',
      target: { kind: 'big8' },
      rect: { x0: -1.06, z0: 0.015, x1: -0.9, z1: 0.075 },
      label: 'Big 8',
    },
    {
      id: 'dontPass',
      target: { kind: 'dontPass' },
      rect: { x0: -0.88, z0: -0.045, x1: -0.14, z1: 0.075 },
      label: "Don't Pass",
    },
    {
      id: 'dontPassOdds',
      target: { kind: 'dontPassOdds' },
      rect: { x0: -0.14, z0: -0.045, x1: 0.1, z1: 0.075 },
      label: "Don't Pass Odds",
    },
    {
      id: 'passLine',
      target: { kind: 'passLine' },
      rect: { x0: -1.26, z0: 0.1, x1: 0.1, z1: 0.26 },
      label: 'Pass Line',
      anchor: { x: -0.35, z: 0.18 },
    },
    {
      // The pass line wraps up the left end of the lanes, Vegas-style. Alias
      // region: same bet, extra clickable surface (chips anchor on 'passLine').
      id: 'passLine2',
      target: { kind: 'passLine' },
      rect: { x0: -1.26, z0: -0.385, x1: -1.1, z1: 0.1 },
      label: 'Pass Line',
    },
    {
      id: 'passOdds',
      target: { kind: 'passOdds' },
      rect: { x0: -0.88, z0: 0.28, x1: 0.1, z1: 0.42 },
      label: 'Pass Line Odds',
      anchor: { x: -0.35, z: 0.35 },
    },
  );

  // ---- Proposition block, center-right ------------------------------------
  // Constraints: felt beyond x ~0.7 is never visible from the rail camera, and
  // the number boxes own z -0.63..-0.4 — so the block sits at x 0.16..0.68,
  // strictly BELOW the numbers row and to the right of the lanes (which end at
  // x 0.1).
  const PX0 = 0.16;
  const PX1 = 0.68;
  const PMID = (PX0 + PX1) / 2;
  const hard = (n: 4 | 6 | 8 | 10, rect: Rect) =>
    regions.push({
      id: `hardway:${n}`,
      target: { kind: 'hardway', number: n },
      rect,
      label: `Hard ${n}`,
    });
  hard(6, { x0: PX0, z0: -0.385, x1: PMID, z1: -0.245 });
  hard(10, { x0: PMID, z0: -0.385, x1: PX1, z1: -0.245 });
  hard(4, { x0: PX0, z0: -0.245, x1: PMID, z1: -0.105 });
  hard(8, { x0: PMID, z0: -0.245, x1: PX1, z1: -0.105 });

  regions.push(
    {
      id: 'prop:any7',
      target: { kind: 'prop', prop: 'any7' },
      rect: { x0: PX0, z0: -0.105, x1: PX1, z1: -0.02 },
      label: 'Any Seven',
    },
    {
      id: 'prop:aces',
      target: { kind: 'prop', prop: 'aces' },
      rect: { x0: PX0, z0: -0.02, x1: PMID, z1: 0.1 },
      label: 'Aces (2)',
    },
    {
      id: 'prop:boxcars',
      target: { kind: 'prop', prop: 'boxcars' },
      rect: { x0: PMID, z0: -0.02, x1: PX1, z1: 0.1 },
      label: 'Boxcars (12)',
    },
    {
      id: 'prop:aceDeuce',
      target: { kind: 'prop', prop: 'aceDeuce' },
      rect: { x0: PX0, z0: 0.1, x1: PMID, z1: 0.22 },
      label: 'Ace-Deuce (3)',
    },
    {
      id: 'prop:yo',
      target: { kind: 'prop', prop: 'yo' },
      rect: { x0: PMID, z0: 0.1, x1: PX1, z1: 0.22 },
      label: 'Yo (11)',
    },
    {
      id: 'prop:anyCraps',
      target: { kind: 'prop', prop: 'anyCraps' },
      rect: { x0: PX0, z0: 0.22, x1: PX1, z1: 0.3 },
      label: 'Any Craps',
    },
    {
      id: 'prop:horn',
      target: { kind: 'prop', prop: 'horn' },
      rect: { x0: PX0, z0: 0.3, x1: PMID, z1: 0.42 },
      label: 'Horn',
    },
    {
      id: 'prop:cAndE',
      target: { kind: 'prop', prop: 'cAndE' },
      rect: { x0: PMID, z0: 0.3, x1: PX1, z1: 0.42 },
      label: 'C & E',
    },
  );

  return regions;
}

export const LAYOUT_REGIONS: readonly LayoutRegion[] = buildRegions();

export function regionAt(x: number, z: number): LayoutRegion | null {
  for (const r of LAYOUT_REGIONS) {
    if (x >= r.rect.x0 && x <= r.rect.x1 && z >= r.rect.z0 && z <= r.rect.z1) return r;
  }
  return null;
}

/**
 * Chip anchor for any engine bet id — including ids with no clickable region
 * (traveled come/don't-come points and their odds), which sit inside the
 * number boxes.
 */
export function anchorForBetId(id: string): { x: number; z: number } {
  const region = LAYOUT_REGIONS.find((r) => r.id === id);
  if (region) return region.anchor ?? center(region.rect);

  const m = id.match(/^(comePoint|comeOdds|dontComePoint|dontComeOdds):(\d+)$/);
  if (m) {
    const n = Number(m[2]) as PointNumber;
    const box = numberBoxRect(n);
    const cx = (box.x0 + box.x1) / 2;
    // Come side sits left of the box center, don't-come side right; the puck
    // parks at the top-right corner, clear of all four anchors.
    switch (m[1]) {
      case 'comePoint':
        return { x: cx - 0.08, z: -0.5 };
      case 'comeOdds':
        return { x: cx - 0.08, z: -0.435 };
      case 'dontComePoint':
        return { x: cx + 0.08, z: -0.5 };
      case 'dontComeOdds':
        return { x: cx + 0.08, z: -0.435 };
    }
  }
  return { x: 0, z: 0.55 }; // should not happen; park unknown ids by the rail
}

/**
 * Click zones that only exist while a traveled come/don't-come point is up:
 * clicking the traveled chips adds odds behind them. Checked before the
 * static regions by the picker.
 */
export function oddsRegionsFor(
  comeNumbers: PointNumber[],
  dontComeNumbers: PointNumber[],
): LayoutRegion[] {
  const out: LayoutRegion[] = [];
  for (const n of comeNumbers) {
    const box = numberBoxRect(n);
    const cx = (box.x0 + box.x1) / 2;
    out.push({
      id: `comeOdds:${n}`,
      target: { kind: 'comeOdds', number: n },
      rect: { x0: cx - 0.135, z0: -0.555, x1: cx - 0.025, z1: -0.4 },
      label: `Come Odds ${n}`,
      anchor: { x: cx - 0.08, z: -0.435 },
    });
  }
  for (const n of dontComeNumbers) {
    const box = numberBoxRect(n);
    const cx = (box.x0 + box.x1) / 2;
    out.push({
      id: `dontComeOdds:${n}`,
      target: { kind: 'dontComeOdds', number: n },
      rect: { x0: cx + 0.025, z0: -0.555, x1: cx + 0.135, z1: -0.4 },
      label: `Don't Come Odds ${n}`,
      anchor: { x: cx + 0.08, z: -0.435 },
    });
  }
  return out;
}
