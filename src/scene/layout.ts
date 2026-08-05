// The betting layout: one source of truth for clickable regions, chip anchor
// points, and the painted felt art. All coordinates are world-space meters on
// the felt plane (x along the table, z across it; player rail is +z).
//
// Arrangement follows modern Strip tables: a LOSE row (lay) above the point
// numbers and a WIN row (place) below, COME and FIELD lanes, a pass line that
// wraps the end with DON'T PASS just inside it, a center proposition block,
// and a partial mirrored second end on the right. Mirrored/alias regions use
// ids with a '#' or 'mirror:' prefix and map to the same engine bets; regions
// with a null target exist only to explain themselves in a toast.

import type { BetTarget, PointNumber } from '../engine/state';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface LayoutRegion {
  /** Stable id; canonical engine ids come first, aliases use '#'/'mirror:'. */
  id: string;
  /** null = informational cell (clicking toasts the label). */
  target: BetTarget | null;
  rect: Rect;
  /** Hover / toast label. */
  label: string;
  /** Chip anchor (defaults to rect center). */
  anchor?: { x: number; z: number };
}

const center = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

// ---- Number columns across the far side ------------------------------------
export const NUM_Z0 = -0.63;
export const NUM_Z1 = -0.4;
/** Row split: LOSE (lay) strip, the number itself, WIN (place) strip. */
export const LOSE_Z1 = -0.572;
export const WIN_Z0 = -0.452;
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
    const cx = (box.x0 + box.x1) / 2;
    const isBuyLay = n === 4 || n === 10;
    const loseRect: Rect = { ...box, z1: LOSE_Z1 };
    const numRect: Rect = { ...box, z0: LOSE_Z1, z1: WIN_Z0 };
    const winRect: Rect = { ...box, z0: WIN_Z0 };

    // LOSE row: lay bets (engine offers lay on 4 and 10 only).
    if (isBuyLay) {
      regions.push({
        id: `lay:${n}`,
        target: { kind: 'lay', number: n as 4 | 10 },
        rect: loseRect,
        label: `Lay ${n}`,
        anchor: { x: cx + 0.05, z: -0.601 },
      });
    } else {
      regions.push({
        id: `noLay:${n}`,
        target: null,
        rect: loseRect,
        label: 'Lay is offered on 4 and 10 only',
      });
    }

    // The number itself: place bet (big target).
    regions.push({
      id: `place:${n}`,
      target: { kind: 'place', number: n },
      rect: numRect,
      label: `Place ${n}`,
      anchor: { x: cx, z: -0.426 },
    });

    // WIN row: place again (with a BUY tag on 4/10's left edge).
    if (isBuyLay) {
      regions.push({
        id: `buy:${n}`,
        target: { kind: 'buy', number: n as 4 | 10 },
        rect: { ...winRect, x1: box.x0 + 0.09 },
        label: `Buy ${n}`,
        anchor: { x: box.x0 + 0.045, z: -0.426 },
      });
      regions.push({
        id: `place#win:${n}`,
        target: { kind: 'place', number: n },
        rect: { ...winRect, x0: box.x0 + 0.09 },
        label: `Place ${n}`,
      });
    } else {
      regions.push({
        id: `place#win:${n}`,
        target: { kind: 'place', number: n },
        rect: winRect,
        label: `Place ${n}`,
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
      rect: { x0: -1.0, z0: -0.385, x1: 0.1, z1: -0.245 },
      label: 'Field',
    },
    {
      id: 'come',
      target: { kind: 'come' },
      rect: { x0: -1.0, z0: -0.23, x1: 0.1, z1: -0.075 },
      label: 'Come',
    },
    {
      id: 'dontPass',
      target: { kind: 'dontPass' },
      rect: { x0: -1.0, z0: -0.045, x1: -0.14, z1: 0.075 },
      label: "Don't Pass",
    },
    {
      id: 'dontPassOdds',
      target: { kind: 'dontPassOdds' },
      rect: { x0: -0.14, z0: -0.045, x1: 0.1, z1: 0.075 },
      label: "Don't Pass Odds",
    },
    {
      // Vertical don't-pass segment just inside the pass line wrap.
      id: 'dontPass#side',
      target: { kind: 'dontPass' },
      rect: { x0: -1.1, z0: -0.385, x1: -1.02, z1: 0.075 },
      label: "Don't Pass",
    },
    {
      id: 'passLine',
      target: { kind: 'passLine' },
      rect: { x0: -1.26, z0: 0.1, x1: 0.1, z1: 0.26 },
      label: 'Pass Line',
      anchor: { x: -0.35, z: 0.18 },
    },
    {
      // The pass line wraps up the left end of the lanes, Vegas-style.
      id: 'passLine2',
      target: { kind: 'passLine' },
      rect: { x0: -1.26, z0: -0.385, x1: -1.1, z1: 0.1 },
      label: 'Pass Line',
    },
    {
      id: 'passOdds',
      target: { kind: 'passOdds' },
      rect: { x0: -1.0, z0: 0.28, x1: 0.1, z1: 0.42 },
      label: 'Pass Line Odds',
      anchor: { x: -0.35, z: 0.35 },
    },
  );

  // ---- Proposition block, center ------------------------------------------
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
      rect: { x0: PX0, z0: -0.105, x1: PMID, z1: -0.02 },
      label: 'Seven (any) 4:1',
    },
    {
      id: 'prop:anyCraps',
      target: { kind: 'prop', prop: 'anyCraps' },
      rect: { x0: PMID, z0: -0.105, x1: PX1, z1: -0.02 },
      label: 'Any Craps 7:1',
    },
    {
      id: 'prop:aces',
      target: { kind: 'prop', prop: 'aces' },
      rect: { x0: PX0, z0: -0.02, x1: PMID, z1: 0.1 },
      label: 'Aces (2) 30:1',
    },
    {
      id: 'prop:aceDeuce',
      target: { kind: 'prop', prop: 'aceDeuce' },
      rect: { x0: PMID, z0: -0.02, x1: PX1, z1: 0.1 },
      label: 'Ace-Deuce (3) 15:1',
    },
    {
      id: 'prop:yo',
      target: { kind: 'prop', prop: 'yo' },
      rect: { x0: PX0, z0: 0.1, x1: PMID, z1: 0.22 },
      label: 'Yo (11) 15:1',
    },
    {
      id: 'prop:boxcars',
      target: { kind: 'prop', prop: 'boxcars' },
      rect: { x0: PMID, z0: 0.1, x1: PX1, z1: 0.22 },
      label: 'Boxcars (12) 30:1',
    },
    {
      id: 'prop:cAndE',
      target: { kind: 'prop', prop: 'cAndE' },
      rect: { x0: PX0, z0: 0.22, x1: PMID, z1: 0.34 },
      label: 'C & E',
    },
    {
      id: 'prop:horn',
      target: { kind: 'prop', prop: 'horn' },
      rect: { x0: PMID, z0: 0.22, x1: PX1, z1: 0.34 },
      label: 'Horn',
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
    // parks at the top-left corner, clear of all four anchors.
    switch (m[1]) {
      case 'comePoint':
        return { x: cx - 0.08, z: -0.525 };
      case 'comeOdds':
        return { x: cx - 0.08, z: -0.472 };
      case 'dontComePoint':
        return { x: cx + 0.08, z: -0.525 };
      case 'dontComeOdds':
        return { x: cx + 0.08, z: -0.472 };
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
      rect: { x0: cx - 0.135, z0: -0.56, x1: cx - 0.025, z1: -0.43 },
      label: `Come Odds ${n}`,
      anchor: { x: cx - 0.08, z: -0.472 },
    });
  }
  for (const n of dontComeNumbers) {
    const box = numberBoxRect(n);
    const cx = (box.x0 + box.x1) / 2;
    out.push({
      id: `dontComeOdds:${n}`,
      target: { kind: 'dontComeOdds', number: n },
      rect: { x0: cx + 0.025, z0: -0.56, x1: cx + 0.135, z1: -0.43 },
      label: `Don't Come Odds ${n}`,
      anchor: { x: cx + 0.08, z: -0.472 },
    });
  }
  return out;
}
