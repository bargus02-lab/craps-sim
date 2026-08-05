// Paints the betting layout onto a canvas texture — premium Strip styling:
// saturated teal felt, rounded two-tone cells, white serif numerals, gold
// COME, tone-on-tone PASS LINE, red barred lettering, circled field bonuses
// with arced captions, red hardway dice and white one-roll dice under pill
// headers. All original art, drawn in code — no external assets.

import * as THREE from 'three';
import { TABLE } from './constants';
import {
  LAYOUT_REGIONS,
  numberBoxRect,
  LOSE_Z1,
  WIN_Z0,
  type Rect,
} from './layout';
import type { PointNumber } from '../engine/state';

const PX_PER_M = 1000;
const W = Math.round(TABLE.feltHalfX * 2 * PX_PER_M) + 80; // small margin
const H = Math.round(TABLE.feltHalfZ * 2 * PX_PER_M) + 80;

const LINE = '#ecebdf';
const WHITE = '#f7f5ea';
const GOLD = '#dfc06a';
const FADE = 'rgba(236,235,223,0.4)'; // barred don't-come
const TONE = 'rgba(4, 38, 30, 0.5)'; // tone-on-tone lettering (pass line)
const CELL = 'rgba(3, 28, 23, 0.22)'; // cell interior tint

const SERIF = `Georgia, 'Times New Roman', serif`;

function px(x: number): number {
  return (x + TABLE.feltHalfX) * PX_PER_M + 40;
}
function pz(z: number): number {
  return (z + TABLE.feltHalfZ) * PX_PER_M + 40;
}

function region(id: string): Rect {
  return LAYOUT_REGIONS.find((r) => r.id === id)!.rect;
}

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius = 16) {
  ctx.beginPath();
  ctx.roundRect(
    px(r.x0),
    pz(r.z0),
    (r.x1 - r.x0) * PX_PER_M,
    (r.z1 - r.z0) * PX_PER_M,
    radius,
  );
}

/** Premium cell: rounded corners, darker interior, crisp light border. */
function cell(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  opts: { radius?: number; stroke?: string; fill?: string | null; width?: number } = {},
) {
  const { radius = 16, stroke = LINE, fill = CELL, width = 3.5 } = opts;
  roundRectPath(ctx, r, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

interface TextOpts {
  color?: string;
  weight?: number | string;
  italic?: boolean;
  spacing?: string;
  rotate?: number;
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  z: number,
  size: number,
  opts: TextOpts = {},
) {
  const { color = WHITE, weight = 700, italic = false, spacing = '0px', rotate = 0 } = opts;
  ctx.save();
  ctx.translate(px(x), pz(z));
  if (rotate) ctx.rotate(rotate);
  ctx.fillStyle = color;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${SERIF}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 0);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();
}

/** Characters placed along a circular arc (field circle captions). */
function arcText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  z: number,
  radiusPx: number,
  size: number,
  color: string,
  startDeg: number,
  endDeg: number,
) {
  const cx = px(x);
  const cy = pz(z);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  for (let i = 0; i < str.length; i++) {
    const t = str.length === 1 ? 0.5 : i / (str.length - 1);
    const a = start + (end - start) * t;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radiusPx, cy + Math.sin(a) * radiusPx);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(str[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Mini die icon. Red for hardways, white for one-roll bets. */
function dieIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  pips: number,
  sizePx = 52,
  fill = WHITE,
  pip = '#221a10',
  border = 'rgba(20, 14, 8, 0.65)',
) {
  const cx = px(x);
  const cy = pz(z);
  const s = sizePx;
  ctx.fillStyle = fill;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.2);
  ctx.fill();
  ctx.stroke();
  const off = s * 0.24;
  const dot = s * 0.1;
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
  ctx.fillStyle = pip;
  for (const [dx, dy] of spots[pips]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function redPair(ctx: CanvasRenderingContext2D, x: number, z: number, a: number, b: number, s = 46) {
  const gap = (s / 1000) * 0.62;
  dieIcon(ctx, x - gap, z, a, s, '#c33a2c', WHITE, '#82241a');
  dieIcon(ctx, x + gap, z, b, s, '#c33a2c', WHITE, '#82241a');
}

function whitePair(ctx: CanvasRenderingContext2D, x: number, z: number, a: number, b: number, s = 46) {
  const gap = (s / 1000) * 0.62;
  dieIcon(ctx, x - gap, z, a, s);
  dieIcon(ctx, x + gap, z, b, s);
}

/** Rounded "pill" section header, HARDWAYS / ONE ROLL style. */
function pill(ctx: CanvasRenderingContext2D, str: string, x: number, z: number, wPx: number) {
  const cx = px(x);
  const cy = pz(z);
  const h = 38;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = '#0a3028'; // fully solid — no felt bleed-through
  ctx.beginPath();
  ctx.roundRect(cx - wPx / 2, cy - h / 2, wPx, h, h / 2);
  ctx.fill();
  ctx.stroke();
  text(ctx, str, x, z + 0.001, 22, { spacing: '6px', color: LINE });
}

export function paintLayout(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // --- felt base: saturated teal with speckle and gentle vignette -----------
  ctx.fillStyle = '#10604e';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,0.03)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.lineJoin = 'round';

  // --- pass line wrap (outermost band) --------------------------------------
  {
    const bottom = region('passLine');
    const side = region('passLine2');
    const oR = 90;
    const iR = 52;
    const oX = px(side.x0);
    const iX = px(side.x1);
    const oZ = pz(bottom.z1);
    const iZ = pz(bottom.z0);
    const top = pz(side.z0);
    const right = px(bottom.x1);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(oX, top);
    ctx.lineTo(oX, oZ - oR);
    ctx.quadraticCurveTo(oX, oZ, oX + oR, oZ);
    ctx.lineTo(right, oZ);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iX, top);
    ctx.lineTo(iX, iZ - iR);
    ctx.quadraticCurveTo(iX, iZ, iX + iR, iZ);
    ctx.lineTo(right, iZ);
    ctx.stroke();

    // Tone-on-tone lettering, like the premium tables.
    text(ctx, 'PASS LINE', -0.55, 0.184, 62, { color: TONE, spacing: '18px' });
    text(ctx, 'PASS LINE', -1.181, -0.15, 46, { color: TONE, spacing: '10px', rotate: -Math.PI / 2 });
  }

  // Odds lane (dashed, whisper-quiet).
  {
    const odds = region('passOdds');
    ctx.strokeStyle = 'rgba(236,235,223,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 16]);
    roundRectPath(ctx, odds, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'PASS LINE ODDS', -0.36, 0.352, 27, { color: 'rgba(236,235,223,0.5)', spacing: '8px' });
  }

  // Don't pass: vertical segment + horizontal band with the odds sub-box.
  {
    const sideDp = region('dontPass#side');
    cell(ctx, sideDp, { stroke: 'rgba(236,235,223,0.6)', fill: null, width: 2.5, radius: 12 });
    text(ctx, "DON'T PASS BAR", -1.06, -0.19, 30, {
      color: 'rgba(225, 75, 54, 0.75)',
      rotate: -Math.PI / 2,
      spacing: '4px',
    });
    dieIcon(ctx, -1.06, 0.0, 6, 30, '#c33a2c', WHITE, '#82241a');
    dieIcon(ctx, -1.06, 0.043, 6, 30, '#c33a2c', WHITE, '#82241a');

    cell(ctx, region('dontPass'), { radius: 18 });
    cell(ctx, region('dontPassOdds'), { radius: 18 });
    text(ctx, "DON'T PASS BAR", -0.64, 0.016, 44, {
      color: 'rgba(225, 75, 54, 0.8)',
      spacing: '6px',
    });
    redPair(ctx, -0.3, 0.014, 6, 6, 40);
    text(ctx, 'ODDS', -0.02, 0.016, 32, { color: 'rgba(225, 75, 54, 0.8)', spacing: '6px' });
  }

  // COME — gold serif, the premium signature.
  {
    const come = region('come');
    cell(ctx, come, { radius: 20 });
    text(ctx, 'COME', (come.x0 + come.x1) / 2, (come.z0 + come.z1) / 2 + 0.005, 110, {
      color: GOLD,
      spacing: '34px',
    });
  }

  // FIELD.
  {
    const field = region('field');
    cell(ctx, field, { radius: 20 });
    const midZ = (field.z0 + field.z1) / 2;
    for (const [n, cxx, capt] of [
      ['2', field.x0 + 0.13, 'PAYS DOUBLE'],
      ['12', field.x0 + 1.0, 'PAYS TRIPLE'],
    ] as Array<[string, number, string]>) {
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px(cxx), pz(midZ + 0.012), 42, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, n, cxx, midZ + 0.013, 42, { weight: 900 });
      arcText(ctx, capt, cxx, midZ + 0.012, 57, 16, WHITE, -160, -20);
    }
    text(ctx, '· 3 · 4 · 9 · 10 · 11 ·', field.x0 + 0.565, midZ - 0.028, 44, { spacing: '8px' });
    text(ctx, 'FIELD', field.x0 + 0.565, midZ + 0.036, 50, { italic: true, spacing: '20px' });
  }

  // --- number columns with LOSE / WIN rows ----------------------------------
  for (const n of [4, 5, 6, 8, 9, 10] as PointNumber[]) {
    const colRect = numberBoxRect(n);
    const showBuy = n === 4 || n === 10;
    const cx = (colRect.x0 + colRect.x1) / 2;
    const lose: Rect = { ...colRect, z1: LOSE_Z1 };
    const num: Rect = { ...colRect, z0: LOSE_Z1, z1: WIN_Z0 };
    const win: Rect = { ...colRect, z0: WIN_Z0 };
    cell(ctx, lose, { radius: 12 });
    cell(ctx, num, { radius: 12, fill: 'rgba(3, 28, 23, 0.14)' });
    cell(ctx, win, { radius: 12 });
    text(ctx, 'LOSE', cx, (lose.z0 + lose.z1) / 2 + 0.001, 30, { spacing: '5px' });
    text(ctx, String(n), cx, (num.z0 + num.z1) / 2 + 0.002, 96, { weight: 700 });
    text(ctx, 'WIN', cx, (win.z0 + win.z1) / 2 + 0.001, 30, { spacing: '5px' });
    if (showBuy) {
      text(ctx, 'BUY', colRect.x0 + 0.045, (win.z0 + win.z1) / 2 + 0.001, 19, { color: GOLD });
      ctx.strokeStyle = 'rgba(236,235,223,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(colRect.x0 + 0.09), pz(win.z0) + 6);
      ctx.lineTo(px(colRect.x0 + 0.09), pz(win.z1) - 6);
      ctx.stroke();
    }
  }

  // Don't come: barred style (faded red, premium ghosting).
  {
    const dc = region('dontCome');
    cell(ctx, dc, { stroke: FADE, fill: 'rgba(3, 28, 23, 0.14)', width: 2.5, radius: 14 });
    text(ctx, "DON'T", -1.13, -0.578, 31, { color: 'rgba(225, 75, 54, 0.75)' });
    text(ctx, 'COME', -1.13, -0.54, 31, { color: 'rgba(225, 75, 54, 0.75)' });
    text(ctx, 'BAR', -1.13, -0.503, 25, { color: 'rgba(225, 75, 54, 0.75)' });
    dieIcon(ctx, -1.155, -0.445, 6, 30, 'rgba(160, 70, 58, 0.55)', 'rgba(240,235,225,0.6)', 'rgba(60,20,14,0.5)');
    dieIcon(ctx, -1.105, -0.445, 6, 30, 'rgba(160, 70, 58, 0.55)', 'rgba(240,235,225,0.6)', 'rgba(60,20,14,0.5)');
  }

  // --- center proposition block ---------------------------------------------
  {
    for (const id of [
      'hardway:6',
      'hardway:10',
      'hardway:4',
      'hardway:8',
      'prop:any7',
      'prop:anyCraps',
      'prop:aces',
      'prop:aceDeuce',
      'prop:yo',
      'prop:boxcars',
      'prop:cAndE',
      'prop:horn',
    ]) {
      cell(ctx, region(id), { radius: 14 });
    }

    const rateAt = (id: string, rate: string, dz = 0.05) => {
      const r = region(id);
      text(ctx, rate, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 + dz, 28, { color: WHITE });
    };

    redPair(ctx, 0.29, -0.33, 3, 3);
    rateAt('hardway:6', '9:1');
    redPair(ctx, 0.55, -0.33, 5, 5);
    rateAt('hardway:10', '7:1');
    redPair(ctx, 0.29, -0.19, 2, 2);
    rateAt('hardway:4', '7:1');
    redPair(ctx, 0.55, -0.19, 4, 4);
    rateAt('hardway:8', '9:1');
    pill(ctx, 'HARDWAYS', 0.42, -0.245, 210);

    const seven = region('prop:any7');
    text(ctx, 'SEVEN', (seven.x0 + seven.x1) / 2, -0.08, 40, { spacing: '5px' });
    text(ctx, '4:1', (seven.x0 + seven.x1) / 2, -0.041, 28);
    const craps = region('prop:anyCraps');
    text(ctx, 'CRAPS', (craps.x0 + craps.x1) / 2, -0.08, 40, { spacing: '5px' });
    text(ctx, '7:1', (craps.x0 + craps.x1) / 2, -0.041, 28);

    whitePair(ctx, 0.29, 0.026, 1, 1, 42);
    rateAt('prop:aces', '30:1', 0.045);
    whitePair(ctx, 0.55, 0.026, 1, 2, 42);
    rateAt('prop:aceDeuce', '15:1', 0.045);
    whitePair(ctx, 0.29, 0.146, 5, 6, 42);
    rateAt('prop:yo', '15:1', 0.045);
    whitePair(ctx, 0.55, 0.146, 6, 6, 42);
    rateAt('prop:boxcars', '30:1', 0.045);
    pill(ctx, 'ONE ROLL', 0.42, 0.1, 190);

    const ce = region('prop:cAndE');
    text(ctx, 'C · E', (ce.x0 + ce.x1) / 2, (ce.z0 + ce.z1) / 2 - 0.014, 42, { spacing: '5px' });
    text(ctx, 'CRAPS · ELEVEN', (ce.x0 + ce.x1) / 2, (ce.z0 + ce.z1) / 2 + 0.034, 17, {
      color: 'rgba(247,245,234,0.7)',
    });
    const horn = region('prop:horn');
    text(ctx, 'HORN', (horn.x0 + horn.x1) / 2, (horn.z0 + horn.z1) / 2 - 0.014, 38, { spacing: '6px' });
    text(ctx, '2 · 3 · 11 · 12', (horn.x0 + horn.x1) / 2, (horn.z0 + horn.z1) / 2 + 0.034, 19, {
      color: 'rgba(247,245,234,0.7)',
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
