// Paints the full betting layout onto a canvas texture. All original art,
// drawn in code: felt base, screen-printed lines and lettering, mini dice
// icons for the hardways and props.

import * as THREE from 'three';
import { TABLE } from './constants';
import { LAYOUT_REGIONS, numberBoxRect, type Rect } from './layout';
import type { PointNumber } from '../engine/state';

const PX_PER_M = 1000;
const W = Math.round(TABLE.feltHalfX * 2 * PX_PER_M) + 80; // small margin
const H = Math.round(TABLE.feltHalfZ * 2 * PX_PER_M) + 80;

const CREAM = '#e8dcba';
const WHITE = '#f2ecd9';
const RED = '#d24a32';

// world (x,z) -> canvas px. Canvas top edge = far side of the table (-z).
function px(x: number): number {
  return (x + TABLE.feltHalfX) * PX_PER_M + 40;
}
function pz(z: number): number {
  return (z + TABLE.feltHalfZ) * PX_PER_M + 40;
}

function rectPath(ctx: CanvasRenderingContext2D, r: Rect, inset = 0) {
  ctx.beginPath();
  ctx.rect(
    px(r.x0) + inset,
    pz(r.z0) + inset,
    (r.x1 - r.x0) * PX_PER_M - inset * 2,
    (r.z1 - r.z0) * PX_PER_M - inset * 2,
  );
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  z: number,
  size: number,
  color = CREAM,
  weight = 700,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Verdana, Geneva, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px(x), pz(z));
}

/** Mini die icon (for hardways/props), centered at world (x, z). */
function dieIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  pips: number,
  sizePx = 52,
) {
  const cx = px(x);
  const cy = pz(z);
  const s = sizePx;
  ctx.fillStyle = WHITE;
  ctx.strokeStyle = '#20180f';
  ctx.lineWidth = 3;
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(cx - s / 2, cy - s / 2, s, s, r);
  ctx.fill();
  ctx.stroke();
  const off = s * 0.24;
  const dot = s * 0.09;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [
      [-off, -off],
      [off, off],
    ],
    3: [
      [-off, -off],
      [0, 0],
      [off, off],
    ],
    4: [
      [-off, -off],
      [off, -off],
      [-off, off],
      [off, off],
    ],
    5: [
      [-off, -off],
      [off, -off],
      [0, 0],
      [-off, off],
      [off, off],
    ],
    6: [
      [-off, -off],
      [off, -off],
      [-off, 0],
      [off, 0],
      [-off, off],
      [off, off],
    ],
  };
  ctx.fillStyle = '#20180f';
  for (const [dx, dy] of spots[pips]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function diePair(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  a: number,
  b: number,
  sizePx = 52,
) {
  const gap = (sizePx / 1000) * 0.62;
  dieIcon(ctx, x - gap, z, a, sizePx);
  dieIcon(ctx, x + gap, z, b, sizePx);
}

export function paintLayout(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // --- felt base with speckle and a soft vignette ---------------------------
  ctx.fillStyle = '#155235';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.lineJoin = 'round';

  // --- region borders -------------------------------------------------------
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 4;
  for (const r of LAYOUT_REGIONS) {
    rectPath(ctx, r.rect);
    ctx.stroke();
  }

  // Odds strip gets a dashed inner border instead of solid emphasis.
  const odds = LAYOUT_REGIONS.find((r) => r.id === 'passOdds')!;
  ctx.setLineDash([18, 14]);
  rectPath(ctx, odds.rect, 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- number boxes ---------------------------------------------------------
  const words: Partial<Record<PointNumber, string>> = { 6: 'SIX', 9: 'NINE' };
  for (const n of [4, 5, 6, 8, 9, 10] as PointNumber[]) {
    const box = numberBoxRect(n);
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2 - 0.02;
    const word = words[n];
    if (word) label(ctx, word, cx, cz, 72);
    else label(ctx, String(n), cx, cz, 96);
    if (n === 4 || n === 10) {
      label(ctx, 'LAY', cx, box.z0 + 0.028, 30, RED);
      label(ctx, 'BUY', cx, box.z1 - 0.028, 30, RED);
    }
  }

  // --- lanes ----------------------------------------------------------------
  label(ctx, "DON'T", -1.13, -0.55, 38, RED);
  label(ctx, 'COME', -1.13, -0.51, 38, RED);
  label(ctx, 'BAR', -1.13, -0.462, 26, RED);
  dieIcon(ctx, -1.155, -0.425, 6, 34);
  dieIcon(ctx, -1.105, -0.425, 6, 34);

  // Field: doubles circled at the ends.
  label(ctx, 'FIELD', -0.58, -0.345, 52);
  const fieldNums: Array<[string, number]> = [
    ['3', -0.86],
    ['4', -0.7],
    ['9', -0.54],
    ['10', -0.38],
    ['11', -0.22],
  ];
  for (const [t, fx] of fieldNums) label(ctx, t, fx, -0.286, 48);
  for (const [t, fx, pays] of [
    ['2', -1.06, 'DOUBLE'],
    ['12', -0.05, 'TRIPLE'],
  ] as Array<[string, number, string]>) {
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(px(fx), pz(-0.3), 46, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, t, fx, -0.3, 44, WHITE);
    label(ctx, pays, fx, -0.355, 22, WHITE);
  }

  label(ctx, 'COME', -0.58, -0.152, 74);

  label(ctx, 'BIG 6', -1.16, -0.015, 34, '#e8b93c');
  label(ctx, 'BIG 8', -1.16, 0.045, 34, '#e8b93c');

  label(ctx, "DON'T PASS BAR", -0.66, 0.015, 42, RED);
  dieIcon(ctx, -0.32, 0.013, 6, 40);
  dieIcon(ctx, -0.26, 0.013, 6, 40);
  label(ctx, 'ODDS', -0.02, 0.015, 32, RED);

  label(ctx, 'PASS LINE', -0.9, 0.18, 52);
  label(ctx, 'PASS LINE', -0.28, 0.18, 52);
  label(ctx, 'ODDS', -0.45, 0.35, 34, 'rgba(232,220,186,0.55)');

  // --- proposition block ----------------------------------------------------
  const propLabel = (id: string, lines: Array<[string, number, number, string?]>) => {
    const r = LAYOUT_REGIONS.find((x) => x.id === id)!;
    const cx = (r.rect.x0 + r.rect.x1) / 2;
    for (const [text, dz, size, color] of lines) {
      label(ctx, text, cx, (r.rect.z0 + r.rect.z1) / 2 + dz, size, color ?? CREAM);
    }
  };

  diePair(ctx, 0.29, -0.345, 3, 3, 40);
  propLabel('hardway:6', [['HARD 6  9:1', 0.035, 26]]);
  diePair(ctx, 0.55, -0.345, 5, 5, 40);
  propLabel('hardway:10', [['HARD 10  7:1', 0.035, 26]]);
  diePair(ctx, 0.29, -0.205, 2, 2, 40);
  propLabel('hardway:4', [['HARD 4  7:1', 0.035, 26]]);
  diePair(ctx, 0.55, -0.205, 4, 4, 40);
  propLabel('hardway:8', [['HARD 8  9:1', 0.035, 26]]);

  propLabel('prop:any7', [['ANY SEVEN  4:1', 0, 30, RED]]);

  diePair(ctx, 0.29, 0.012, 1, 1, 36);
  propLabel('prop:aces', [['ACES 30:1', 0.038, 24]]);
  diePair(ctx, 0.55, 0.012, 6, 6, 36);
  propLabel('prop:boxcars', [['12 PAYS 30:1', 0.038, 24]]);
  diePair(ctx, 0.29, 0.132, 1, 2, 36);
  propLabel('prop:aceDeuce', [['3 PAYS 15:1', 0.038, 24]]);
  diePair(ctx, 0.55, 0.132, 5, 6, 36);
  propLabel('prop:yo', [['YO 15:1', 0.038, 24]]);

  propLabel('prop:anyCraps', [['ANY CRAPS  7:1', 0, 28]]);
  propLabel('prop:horn', [['HORN', -0.018, 28], ['2·3·11·12', 0.028, 20, WHITE]]);
  propLabel('prop:cAndE', [['C & E', -0.018, 28], ['CRAPS · ELEVEN', 0.028, 17, WHITE]]);

  // --- outer trim -----------------------------------------------------------
  ctx.strokeStyle = 'rgba(232,220,186,0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
