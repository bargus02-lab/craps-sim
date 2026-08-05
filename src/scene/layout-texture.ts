// Paints the betting layout onto a canvas texture, styled after modern Las
// Vegas Strip tables: a pass line that wraps the end of the lanes with a
// rounded corner, condensed lettering, double-line box borders, diamond
// accents, red prop lettering, and circled field doubles. All original art,
// drawn in code — no external assets.

import * as THREE from 'three';
import { TABLE } from './constants';
import { LAYOUT_REGIONS, numberBoxRect, type Rect } from './layout';
import type { PointNumber } from '../engine/state';

const PX_PER_M = 1000;
const W = Math.round(TABLE.feltHalfX * 2 * PX_PER_M) + 80; // small margin
const H = Math.round(TABLE.feltHalfZ * 2 * PX_PER_M) + 80;

const CREAM = '#ece1c0';
const WHITE = '#f5f0df';
const RED = '#e0442c';
const GOLD = '#e3b74e';

// world (x,z) -> canvas px. Canvas top edge = far side of the table (-z).
function px(x: number): number {
  return (x + TABLE.feltHalfX) * PX_PER_M + 40;
}
function pz(z: number): number {
  return (z + TABLE.feltHalfZ) * PX_PER_M + 40;
}

function region(id: string): Rect {
  return LAYOUT_REGIONS.find((r) => r.id === id)!.rect;
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

/** Vegas boxes use a double border: heavy outer line, fine inner line. */
function doubleBox(ctx: CanvasRenderingContext2D, r: Rect, color = CREAM) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  rectPath(ctx, r);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  rectPath(ctx, r, 9);
  ctx.stroke();
}

interface TextOpts {
  color?: string;
  weight?: number;
  stretch?: number; // vertical stretch for the classic condensed look
  spacing?: string; // canvas letterSpacing, e.g. '6px'
  rotate?: number; // radians
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  z: number,
  size: number,
  opts: TextOpts = {},
) {
  const { color = CREAM, weight = 800, stretch = 1, spacing = '0px', rotate = 0 } = opts;
  ctx.save();
  ctx.translate(px(x), pz(z));
  if (rotate) ctx.rotate(rotate);
  ctx.scale(1, stretch);
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px 'Arial Narrow', 'Avenir Next Condensed', Arial, sans-serif`;
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();
}

/** Mini die icon, centered at world (x, z). */
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
  ctx.beginPath();
  ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.16);
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

function diamond(ctx: CanvasRenderingContext2D, x: number, z: number, s: number, color: string) {
  const cx = px(x);
  const cy = pz(z);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.62, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.62, cy);
  ctx.closePath();
  ctx.fill();
}

/** The pass line wraps the end of the lanes: left edge + bottom, rounded corner. */
function drawPassLineBand(ctx: CanvasRenderingContext2D) {
  const bottom = region('passLine'); // x -1.26..0.10, z 0.10..0.26
  const side = region('passLine2'); // x -1.26..-1.10, z -0.385..0.10
  const oR = 60; // outer corner radius (px)
  const iR = 34;

  const oX = px(side.x0); // outer left
  const iX = px(side.x1); // inner left
  const oZ = pz(bottom.z1); // outer bottom
  const iZ = pz(bottom.z0); // inner bottom
  const top = pz(side.z0);
  const right = px(bottom.x1);

  ctx.strokeStyle = CREAM;

  // Outer edge: down the left, around the corner, along the bottom.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(oX, top);
  ctx.lineTo(oX, oZ - oR);
  ctx.quadraticCurveTo(oX, oZ, oX + oR, oZ);
  ctx.lineTo(right, oZ);
  ctx.stroke();

  // Inner edge, matching.
  ctx.beginPath();
  ctx.moveTo(iX, top);
  ctx.lineTo(iX, iZ - iR);
  ctx.quadraticCurveTo(iX, iZ, iX + iR, iZ);
  ctx.lineTo(right, iZ);
  ctx.stroke();

  // Fine inner pinstripes for the double-line look.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(oX + 9, top);
  ctx.lineTo(oX + 9, oZ - oR);
  ctx.quadraticCurveTo(oX + 9, oZ - 9, oX + oR, oZ - 9);
  ctx.lineTo(right, oZ - 9);
  ctx.stroke();

  label(ctx, 'PASS LINE', -0.62, 0.18, 56, { stretch: 1.35, spacing: '10px' });
  label(ctx, 'PASS LINE', -1.18, -0.14, 44, {
    stretch: 1.3,
    spacing: '6px',
    rotate: -Math.PI / 2,
  });
}

export function paintLayout(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // --- felt base with speckle and a soft vignette ---------------------------
  ctx.fillStyle = '#14503a';
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

  // --- outer trim + apron diamonds ------------------------------------------
  ctx.strokeStyle = 'rgba(236,225,192,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  // Diamond rows along the shooter's apron (right end).
  for (let z = -0.5; z <= 0.5; z += 0.125) {
    diamond(ctx, 1.21, z, 15, 'rgba(236,225,192,0.28)');
  }

  // --- lanes ---------------------------------------------------------------
  drawPassLineBand(ctx);

  // Odds strip: dashed border.
  const odds = region('passOdds');
  ctx.strokeStyle = 'rgba(236,225,192,0.75)';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([20, 14]);
  rectPath(ctx, odds);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'PASS LINE ODDS', -0.39, 0.35, 30, { color: 'rgba(236,225,192,0.6)', spacing: '6px' });

  // Don't pass + its odds sub-box.
  doubleBox(ctx, region('dontPass'));
  doubleBox(ctx, region('dontPassOdds'));
  label(ctx, "DON'T PASS BAR", -0.58, 0.015, 44, { color: RED, stretch: 1.25, spacing: '4px' });
  dieIcon(ctx, -0.28, 0.013, 6, 42);
  dieIcon(ctx, -0.22, 0.013, 6, 42);
  label(ctx, 'ODDS', -0.02, 0.015, 32, { color: RED, spacing: '4px' });

  // Big 6 / Big 8.
  doubleBox(ctx, region('big6'));
  doubleBox(ctx, region('big8'));
  label(ctx, 'BIG', -1.025, -0.016, 24, { color: WHITE });
  label(ctx, '6', -0.955, -0.015, 42, { color: RED, weight: 900 });
  label(ctx, 'BIG', -1.025, 0.044, 24, { color: WHITE });
  label(ctx, '8', -0.955, 0.045, 42, { color: RED, weight: 900 });

  // COME.
  doubleBox(ctx, region('come'));
  label(ctx, 'COME', -0.49, -0.15, 96, { stretch: 1.4, spacing: '26px' });

  // FIELD.
  const field = region('field');
  doubleBox(ctx, field);
  label(ctx, 'FIELD', -0.9, -0.313, 54, { stretch: 1.35, spacing: '8px' });
  const fieldNums: Array<[string, number]> = [
    ['3', -0.64],
    ['4', -0.5],
    ['9', -0.36],
    ['10', -0.22],
    ['11', -0.08],
  ];
  for (const [t, fx] of fieldNums) {
    label(ctx, t, fx, -0.31, 52, { color: WHITE, weight: 900 });
  }
  for (let i = 0; i < fieldNums.length - 1; i++) {
    diamond(ctx, (fieldNums[i][1] + fieldNums[i + 1][1]) / 2, -0.313, 9, 'rgba(245,240,223,0.7)');
  }
  for (const [t, fx, pays] of [
    ['2', -0.76, 'DOUBLE'],
    ['12', 0.035, 'TRIPLE'],
  ] as Array<[string, number, string]>) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(px(fx), pz(-0.308), 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(fx), pz(-0.308), 51, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, t, fx, -0.31, 42, { color: GOLD, weight: 900 });
    label(ctx, pays, fx, -0.362, 20, { color: GOLD });
  }

  // --- number boxes + don't come --------------------------------------------
  const words: Partial<Record<PointNumber, string>> = { 6: 'SIX', 9: 'NINE' };
  for (const n of [4, 5, 6, 8, 9, 10] as PointNumber[]) {
    const box = numberBoxRect(n);
    doubleBox(ctx, box, WHITE);
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2 - 0.015;
    const word = words[n];
    if (word) label(ctx, word, cx, cz, 64, { color: WHITE, stretch: 1.3 });
    else label(ctx, String(n), cx, cz, 100, { color: WHITE, weight: 900, stretch: 1.15 });
    if (n === 4 || n === 10) {
      label(ctx, 'LAY', cx, box.z0 + 0.028, 26, { color: RED, spacing: '4px' });
      label(ctx, 'BUY', cx, box.z1 - 0.028, 26, { color: RED, spacing: '4px' });
    }
  }
  const dc = region('dontCome');
  doubleBox(ctx, dc);
  label(ctx, "DON'T", -1.13, -0.56, 36, { color: RED, stretch: 1.2 });
  label(ctx, 'COME', -1.13, -0.517, 36, { color: RED, stretch: 1.2 });
  label(ctx, 'BAR', -1.175, -0.462, 24, { color: RED });
  dieIcon(ctx, -1.115, -0.462, 6, 30);
  dieIcon(ctx, -1.072, -0.462, 6, 30);

  // --- proposition block ----------------------------------------------------
  const propLabel = (id: string, lines: Array<[string, number, number, string?]>) => {
    const r = region(id);
    const cx = (r.x0 + r.x1) / 2;
    for (const [text, dz, size, color] of lines) {
      label(ctx, text, cx, (r.z0 + r.z1) / 2 + dz, size, { color: color ?? CREAM, spacing: '2px' });
    }
  };
  for (const id of [
    'hardway:6',
    'hardway:10',
    'hardway:4',
    'hardway:8',
    'prop:any7',
    'prop:aces',
    'prop:boxcars',
    'prop:aceDeuce',
    'prop:yo',
    'prop:anyCraps',
    'prop:horn',
    'prop:cAndE',
  ]) {
    doubleBox(ctx, region(id));
  }

  diePair(ctx, 0.29, -0.345, 3, 3, 40);
  propLabel('hardway:6', [['HARD 6 · PAYS 9 TO 1', 0.042, 22, WHITE]]);
  diePair(ctx, 0.55, -0.345, 5, 5, 40);
  propLabel('hardway:10', [['HARD 10 · PAYS 7 TO 1', 0.042, 22, WHITE]]);
  diePair(ctx, 0.29, -0.205, 2, 2, 40);
  propLabel('hardway:4', [['HARD 4 · PAYS 7 TO 1', 0.042, 22, WHITE]]);
  diePair(ctx, 0.55, -0.205, 4, 4, 40);
  propLabel('hardway:8', [['HARD 8 · PAYS 9 TO 1', 0.042, 22, WHITE]]);

  label(ctx, 'ANY SEVEN  PAYS 4 TO 1', 0.42, -0.062, 32, {
    color: RED,
    stretch: 1.25,
    spacing: '6px',
  });

  diePair(ctx, 0.29, 0.012, 1, 1, 36);
  propLabel('prop:aces', [['ACES · PAYS 30 TO 1', 0.04, 20, WHITE]]);
  diePair(ctx, 0.55, 0.012, 6, 6, 36);
  propLabel('prop:boxcars', [['12 · PAYS 30 TO 1', 0.04, 20, WHITE]]);
  diePair(ctx, 0.29, 0.132, 1, 2, 36);
  propLabel('prop:aceDeuce', [['3 · PAYS 15 TO 1', 0.04, 20, WHITE]]);
  diePair(ctx, 0.55, 0.132, 5, 6, 36);
  propLabel('prop:yo', [['YO 11 · PAYS 15 TO 1', 0.04, 20, WHITE]]);

  label(ctx, 'ANY CRAPS  PAYS 7 TO 1', 0.42, 0.26, 28, { stretch: 1.2, spacing: '5px' });

  propLabel('prop:horn', [
    ['HORN', -0.022, 30],
    ['2 · 3 · 11 · 12', 0.026, 20, WHITE],
  ]);
  // C & E: the classic circles.
  const ce = region('prop:cAndE');
  const ceCx = (ce.x0 + ce.x1) / 2;
  for (const [letter, dx] of [
    ['C', -0.055],
    ['E', 0.055],
  ] as Array<[string, number]>) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(px(ceCx + dx), pz(0.352), 32, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, letter, ceCx + dx, 0.353, 34, { color: GOLD, weight: 900 });
  }
  label(ctx, 'CRAPS · ELEVEN', ceCx, 0.398, 15, { color: WHITE });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
