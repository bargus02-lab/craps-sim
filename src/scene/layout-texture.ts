// Paints the betting layout onto a canvas texture, styled after the modern
// Strip look: deep teal felt, white serif numerals, LOSE/WIN rows around the
// point numbers, tone-on-tone COME, gold PASS LINE wrapping the end, red
// DON'T PASS, circled field bonuses with arced captions, red hardway dice and
// white one-roll dice under pill headers, and a partial mirrored second end.
// All original art, drawn in code — no external assets.

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

const LINE = '#e9e4d2';
const WHITE = '#f4f1e4';
const GOLD = '#d9b967';
const RED = '#cf4b3c';
const FADE = 'rgba(233,228,210,0.34)'; // for the barred don't-come box
const TONE = 'rgba(255,255,255,0.13)'; // tone-on-tone lettering (COME)

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

function rectPath(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.beginPath();
  ctx.rect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * PX_PER_M, (r.z1 - r.z0) * PX_PER_M);
}

function box(ctx: CanvasRenderingContext2D, r: Rect, color = LINE, width = 3.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  rectPath(ctx, r);
  ctx.stroke();
}

interface TextOpts {
  color?: string;
  weight?: number | string;
  italic?: boolean;
  spacing?: string;
  rotate?: number;
  align?: CanvasTextAlign;
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  z: number,
  size: number,
  opts: TextOpts = {},
) {
  const { color = WHITE, weight = 700, italic = false, spacing = '0px', rotate = 0, align = 'center' } = opts;
  ctx.save();
  ctx.translate(px(x), pz(z));
  if (rotate) ctx.rotate(rotate);
  ctx.fillStyle = color;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${SERIF}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 0);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();
}

/** Characters placed along a circular arc (for the field circles' captions). */
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

/** Mini die icon. Colors configurable: red hardway dice, white one-roll dice. */
function dieIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  pips: number,
  sizePx = 52,
  fill = WHITE,
  pip = '#20180f',
  border = '#20180f',
) {
  const cx = px(x);
  const cy = pz(z);
  const s = sizePx;
  ctx.fillStyle = fill;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.18);
  ctx.fill();
  ctx.stroke();
  const off = s * 0.24;
  const dot = s * 0.095;
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

function redPair(ctx: CanvasRenderingContext2D, x: number, z: number, a: number, b: number, s = 44) {
  const gap = (s / 1000) * 0.6;
  dieIcon(ctx, x - gap, z, a, s, '#b8352c', WHITE, '#7e1f18');
  dieIcon(ctx, x + gap, z, b, s, '#b8352c', WHITE, '#7e1f18');
}

function whitePair(ctx: CanvasRenderingContext2D, x: number, z: number, a: number, b: number, s = 44) {
  const gap = (s / 1000) * 0.6;
  dieIcon(ctx, x - gap, z, a, s);
  dieIcon(ctx, x + gap, z, b, s);
}

/** Rounded "pill" section header, HARDWAYS / ONE ROLL style. */
function pill(ctx: CanvasRenderingContext2D, str: string, x: number, z: number, wPx: number) {
  const cx = px(x);
  const cy = pz(z);
  const h = 34;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(10, 40, 34, 0.55)';
  ctx.beginPath();
  ctx.roundRect(cx - wPx / 2, cy - h / 2, wPx, h, h / 2);
  ctx.fill();
  ctx.stroke();
  text(ctx, str, x, z + 0.001, 21, { spacing: '5px', color: LINE });
}

export function paintLayout(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // --- felt base: deep teal with speckle and a soft vignette ----------------
  ctx.fillStyle = '#14574b';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.lineJoin = 'round';

  // --- pass line wrap (outermost band) --------------------------------------
  {
    const bottom = region('passLine');
    const side = region('passLine2');
    const oR = 70;
    const iR = 40;
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

    text(ctx, 'PASS LINE', -0.55, 0.182, 58, { color: GOLD, spacing: '14px' });
    text(ctx, 'PASS LINE', -1.181, -0.15, 44, { color: GOLD, spacing: '8px', rotate: -Math.PI / 2 });
  }

  // Odds lane (dashed).
  {
    const odds = region('passOdds');
    ctx.strokeStyle = 'rgba(233,228,210,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    rectPath(ctx, odds);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'PASS LINE ODDS', -0.36, 0.352, 26, { color: 'rgba(233,228,210,0.55)', spacing: '6px' });
  }

  // Don't pass: vertical segment + horizontal band with the odds sub-box.
  {
    const sideDp = region('dontPass#side');
    box(ctx, sideDp, 'rgba(233,228,210,0.8)', 3);
    text(ctx, "DON'T PASS BAR", -1.06, -0.19, 30, { color: RED, rotate: -Math.PI / 2, spacing: '3px' });
    dieIcon(ctx, -1.06, 0.0, 6, 30, '#b8352c', WHITE, '#7e1f18');
    dieIcon(ctx, -1.06, 0.042, 6, 30, '#b8352c', WHITE, '#7e1f18');

    box(ctx, region('dontPass'), 'rgba(233,228,210,0.8)', 3);
    box(ctx, region('dontPassOdds'), 'rgba(233,228,210,0.8)', 3);
    text(ctx, "DON'T PASS BAR", -0.64, 0.016, 42, { color: RED, spacing: '4px' });
    redPair(ctx, -0.3, 0.014, 6, 6, 38);
    text(ctx, 'ODDS', -0.02, 0.016, 30, { color: RED, spacing: '4px' });
  }

  // COME + FIELD lanes.
  const paintLanes = (comeR: Rect, fieldR: Rect) => {
    ctx.save();
    box(ctx, comeR);
    const comeCx = (comeR.x0 + comeR.x1) / 2;
    text(ctx, 'COME', comeCx, (comeR.z0 + comeR.z1) / 2 + 0.004, 104, {
      color: TONE,
      spacing: '30px',
    });
    box(ctx, fieldR);
    const fx0 = fieldR.x0;
    const midZ = (fieldR.z0 + fieldR.z1) / 2;
    // Circled 2 (double) and 12 (triple) with arced captions.
    const two = fx0 + 0.13;
    const twelve = fieldR.x0 + 1.0;
    for (const [n, cxx, capt] of [
      ['2', two, 'PAYS DOUBLE'],
      ['12', twelve, 'PAYS TRIPLE'],
    ] as Array<[string, number, string]>) {
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px(cxx), pz(midZ + 0.012), 40, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, n, cxx, midZ + 0.013, 40, { weight: 900 });
      arcText(ctx, capt, cxx, midZ + 0.012, 54, 15, WHITE, -160, -20);
    }
    // ·3·4·9·10·11· row and the FIELD word.
    text(ctx, '· 3 · 4 · 9 · 10 · 11 ·', fx0 + 0.565, midZ - 0.028, 40, { spacing: '6px' });
    text(ctx, 'FIELD', fx0 + 0.565, midZ + 0.035, 46, { italic: true, spacing: '16px' });
    ctx.restore();
  };
  paintLanes(region('come'), region('field'));

  // --- number columns with LOSE / WIN rows ----------------------------------
  const paintNumberCol = (n: PointNumber, colRect: Rect, showBuy: boolean) => {
    ctx.save();
    const cx = (colRect.x0 + colRect.x1) / 2;
    const lose: Rect = { ...colRect, z1: LOSE_Z1 };
    const num: Rect = { ...colRect, z0: LOSE_Z1, z1: WIN_Z0 };
    const win: Rect = { ...colRect, z0: WIN_Z0 };
    box(ctx, lose);
    box(ctx, num);
    box(ctx, win);
    text(ctx, 'LOSE', cx, (lose.z0 + lose.z1) / 2 + 0.001, 28, { spacing: '4px' });
    text(ctx, String(n), cx, (num.z0 + num.z1) / 2 + 0.002, 88, { weight: 700 });
    text(ctx, 'WIN', cx, (win.z0 + win.z1) / 2 + 0.001, 28, { spacing: '4px' });
    if (showBuy) {
      text(ctx, 'BUY', colRect.x0 + 0.045, (win.z0 + win.z1) / 2 + 0.001, 18, { color: GOLD });
      ctx.strokeStyle = 'rgba(233,228,210,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(colRect.x0 + 0.09), pz(win.z0) + 4);
      ctx.lineTo(px(colRect.x0 + 0.09), pz(win.z1) - 4);
      ctx.stroke();
    }
    ctx.restore();
  };
  for (const n of [4, 5, 6, 8, 9, 10] as PointNumber[]) {
    paintNumberCol(n, numberBoxRect(n), n === 4 || n === 10);
  }

  // Don't come: barred style (faded).
  {
    const dc = region('dontCome');
    box(ctx, dc, FADE, 3);
    text(ctx, "DON'T", -1.13, -0.575, 30, { color: FADE });
    text(ctx, 'COME', -1.13, -0.537, 30, { color: FADE });
    text(ctx, 'BAR', -1.13, -0.5, 24, { color: FADE });
    dieIcon(ctx, -1.155, -0.443, 6, 30, 'rgba(150,160,150,0.5)', 'rgba(30,40,35,0.6)', 'rgba(30,40,35,0.6)');
    dieIcon(ctx, -1.105, -0.443, 6, 30, 'rgba(150,160,150,0.5)', 'rgba(30,40,35,0.6)', 'rgba(30,40,35,0.6)');
  }

  // --- center proposition block ---------------------------------------------
  {
    const ids = [
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
    ];
    for (const id of ids) box(ctx, region(id));

    const rateAt = (id: string, rate: string, dz = 0.048) => {
      const r = region(id);
      text(ctx, rate, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 + dz, 26, { color: WHITE });
    };

    redPair(ctx, 0.29, -0.33, 3, 3);
    rateAt('hardway:6', '9:1');
    redPair(ctx, 0.55, -0.33, 5, 5);
    rateAt('hardway:10', '7:1');
    redPair(ctx, 0.29, -0.19, 2, 2);
    rateAt('hardway:4', '7:1');
    redPair(ctx, 0.55, -0.19, 4, 4);
    rateAt('hardway:8', '9:1');
    pill(ctx, 'HARDWAYS', 0.42, -0.245, 190);

    const seven = region('prop:any7');
    text(ctx, 'SEVEN', (seven.x0 + seven.x1) / 2, -0.078, 36, { spacing: '4px' });
    text(ctx, '4:1', (seven.x0 + seven.x1) / 2, -0.042, 26);
    const craps = region('prop:anyCraps');
    text(ctx, 'CRAPS', (craps.x0 + craps.x1) / 2, -0.078, 36, { spacing: '4px' });
    text(ctx, '7:1', (craps.x0 + craps.x1) / 2, -0.042, 26);

    whitePair(ctx, 0.29, 0.028, 1, 1, 40);
    rateAt('prop:aces', '30:1', 0.042);
    whitePair(ctx, 0.55, 0.028, 1, 2, 40);
    rateAt('prop:aceDeuce', '15:1', 0.042);
    whitePair(ctx, 0.29, 0.148, 5, 6, 40);
    rateAt('prop:yo', '15:1', 0.042);
    whitePair(ctx, 0.55, 0.148, 6, 6, 40);
    rateAt('prop:boxcars', '30:1', 0.042);
    pill(ctx, 'ONE ROLL', 0.42, 0.1, 170);

    const ce = region('prop:cAndE');
    text(ctx, 'C · E', (ce.x0 + ce.x1) / 2, (ce.z0 + ce.z1) / 2 - 0.012, 38, { spacing: '4px' });
    text(ctx, 'CRAPS · ELEVEN', (ce.x0 + ce.x1) / 2, (ce.z0 + ce.z1) / 2 + 0.032, 16, {
      color: 'rgba(244,241,228,0.75)',
    });
    const horn = region('prop:horn');
    text(ctx, 'HORN', (horn.x0 + horn.x1) / 2, (horn.z0 + horn.z1) / 2 - 0.012, 34, { spacing: '5px' });
    text(ctx, '2 · 3 · 11 · 12', (horn.x0 + horn.x1) / 2, (horn.z0 + horn.z1) / 2 + 0.032, 18, {
      color: 'rgba(244,241,228,0.75)',
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
