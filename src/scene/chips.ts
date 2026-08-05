// Casino chips as instanced meshes — one InstancedMesh per denomination.
// Stacks build largest-denomination-first with deterministic positional and
// rotational jitter (hashed from bet id + index) so stacks look hand-placed
// but never wobble between re-renders.

import * as THREE from 'three';
import {
  POINT_NUMBERS,
  BUY_LAY_NUMBERS,
  HARDWAY_NUMBERS,
  PROP_NAMES,
  type Bets,
} from '../engine/state';
import { anchorForBetId } from './layout';

export const CHIP_DENOMS = [100, 25, 5, 1] as const;
export type ChipDenom = (typeof CHIP_DENOMS)[number];

export const CHIP_STYLE: Record<ChipDenom, { base: string; accent: string; text: string }> = {
  1: { base: '#e9e4d7', accent: '#a7a08f', text: '#39352b' },
  5: { base: '#b03028', accent: '#f2ecdd', text: '#f2ecdd' },
  25: { base: '#1d7a44', accent: '#f2ecdd', text: '#f2ecdd' },
  100: { base: '#1d1d21', accent: '#f2ecdd', text: '#f2ecdd' },
};

// Well over real size so stacks and denominations stay readable from above.
export const CHIP_RADIUS = 0.032;
export const CHIP_HEIGHT = 0.006;
const MAX_PER_DENOM = 256;
const MAX_STACK = 14; // taller piles split into adjacent columns

// One texture per denomination: the chip face fills the top 256x256 of the
// canvas, the edge-stripe strip fills the bottom 64 rows. The cylinder's UVs
// are remapped so caps sample the face region and the side wall samples the
// strip — a single material, because InstancedMesh + material-group arrays
// does not render reliably.
const FACE_V = 0.8; // fraction of the atlas (in UV space) used by the face

function chipAtlasTexture(denom: ChipDenom): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320; // 256 face + 64 side strip
  const ctx = c.getContext('2d')!;
  const { base, accent, text } = CHIP_STYLE[denom];

  // Face (top 256x256).
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.fillRect(-24, -128, 48, 34);
    ctx.restore();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = '700 84px Verdana, Geneva, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${denom}`, 128, 132);

  // Side stripes (bottom strip).
  ctx.fillStyle = base;
  ctx.fillRect(0, 256, 256, 64);
  ctx.fillStyle = accent;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(i * 43 + 12, 256, 18, 64);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cylinder with UVs remapped into the face/side atlas regions. */
function chipGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_HEIGHT, 28);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const index = geo.getIndex()!;
  const sideVerts = new Set<number>();
  const capVerts = new Set<number>();
  geo.groups.forEach((g, gi) => {
    for (let i = g.start; i < g.start + g.count; i++) {
      (gi === 0 ? sideVerts : capVerts).add(index.getX(i));
    }
  });
  for (const vi of sideVerts) uv.setY(vi, uv.getY(vi) * (1 - FACE_V));
  for (const vi of capVerts) uv.setY(vi, 1 - FACE_V + uv.getY(vi) * FACE_V);
  geo.clearGroups();
  return geo;
}

/** FNV-1a hash for deterministic jitter. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function jitter(seed: number): { dx: number; dz: number; rot: number } {
  // Two cheap derived values in [0,1).
  const a = ((seed * 0x9e3779b9) >>> 0) / 0xffffffff;
  const b = ((seed * 0x85ebca6b) >>> 0) / 0xffffffff;
  return {
    dx: (a - 0.5) * 0.003,
    dz: (b - 0.5) * 0.003,
    // Denomination stays upright toward the player: only a slight wobble
    // around the orientation that faces the +z point of view.
    rot: Math.PI / 2 + (a - 0.5) * 0.24,
  };
}

/** Greedy decomposition into denominations, largest first. */
export function chipsFor(amount: number): ChipDenom[] {
  const chips: ChipDenom[] = [];
  let left = Math.floor(amount + 1e-9);
  for (const d of CHIP_DENOMS) {
    while (left >= d) {
      chips.push(d);
      left -= d;
    }
  }
  return chips;
}

function* iterBets(bets: Bets): Generator<{ id: string; amount: number }> {
  const y = (id: string, amount: number) => ({ id, amount });
  if (bets.passLine > 0) yield y('passLine', bets.passLine);
  if (bets.passOdds > 0) yield y('passOdds', bets.passOdds);
  if (bets.dontPass > 0) yield y('dontPass', bets.dontPass);
  if (bets.dontPassOdds > 0) yield y('dontPassOdds', bets.dontPassOdds);
  if (bets.come > 0) yield y('come', bets.come);
  if (bets.dontCome > 0) yield y('dontCome', bets.dontCome);
  for (const n of POINT_NUMBERS) {
    const cp = bets.comePoints[n];
    if (cp) {
      if (cp.flat > 0) yield y(`comePoint:${n}`, cp.flat);
      if (cp.odds > 0) yield y(`comeOdds:${n}`, cp.odds);
    }
    const dcp = bets.dontComePoints[n];
    if (dcp) {
      if (dcp.flat > 0) yield y(`dontComePoint:${n}`, dcp.flat);
      if (dcp.odds > 0) yield y(`dontComeOdds:${n}`, dcp.odds);
    }
    const p = bets.place[n];
    if (p) yield y(`place:${n}`, p);
  }
  for (const n of BUY_LAY_NUMBERS) {
    if (bets.buy[n]) yield y(`buy:${n}`, bets.buy[n]!);
    if (bets.lay[n]) yield y(`lay:${n}`, bets.lay[n]!);
  }
  if (bets.field > 0) yield y('field', bets.field);
  if (bets.big6 > 0) yield y('big6', bets.big6);
  if (bets.big8 > 0) yield y('big8', bets.big8);
  for (const n of HARDWAY_NUMBERS) {
    if (bets.hardways[n]) yield y(`hardway:${n}`, bets.hardways[n]!);
  }
  for (const p of PROP_NAMES) {
    if (bets.props[p] > 0) yield y(`prop:${p}`, bets.props[p]);
  }
}

export class ChipRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<ChipDenom, THREE.InstancedMesh>();
  private mat4 = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3(1, 1, 1);
  private axisY = new THREE.Vector3(0, 1, 0);

  // "Total" discs: the top chip of every stack shows the stack's full value,
  // like a dealer's lammer — white inset with the amount in the chip's color.
  private discGeo = new THREE.CircleGeometry(CHIP_RADIUS * 0.7, 28);
  private discPool: THREE.Mesh[] = [];
  private discTexCache = new Map<string, THREE.CanvasTexture>();

  private discTexture(total: number, base: string, ink: string): THREE.CanvasTexture {
    const key = `${total}:${base}:${ink}`;
    const cached = this.discTexCache.get(key);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);
    // Inverted look: the disc IS the chip color, numbers in white ink.
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    const label = `${Math.round(total)}`;
    const size = label.length <= 2 ? 118 : label.length === 3 ? 92 : label.length === 4 ? 72 : 58;
    ctx.fillStyle = ink;
    ctx.font = `800 ${size}px 'Avenir Next', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 136);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.discTexCache.set(key, tex);
    return tex;
  }

  private placeDisc(
    index: number,
    x: number,
    z: number,
    y: number,
    total: number,
    base: string,
    ink: string,
  ) {
    let disc = this.discPool[index];
    if (!disc) {
      disc = new THREE.Mesh(
        this.discGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      );
      disc.rotateX(-Math.PI / 2); // face up, lettering upright toward the player
      this.discPool[index] = disc;
      this.group.add(disc);
    }
    (disc.material as THREE.MeshBasicMaterial).map = this.discTexture(total, base, ink);
    (disc.material as THREE.MeshBasicMaterial).needsUpdate = true;
    disc.position.set(x, y, z);
    disc.visible = true;
  }

  constructor() {
    const geo = chipGeometry();
    for (const d of CHIP_DENOMS) {
      const material = new THREE.MeshStandardMaterial({
        map: chipAtlasTexture(d),
        roughness: 0.38,
      });
      const mesh = new THREE.InstancedMesh(geo, material, MAX_PER_DENOM);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // instances sit far from the shared geometry origin
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(d, mesh);
      this.group.add(mesh);
    }
  }

  /** Rebuild all chip instances from the current bets. */
  update(bets: Bets) {
    const counts = new Map<ChipDenom, number>();
    for (const d of CHIP_DENOMS) counts.set(d, 0);
    let discIndex = 0;

    for (const { id, amount } of iterBets(bets)) {
      const anchor = anchorForBetId(id);
      // Smallest denominations at the BOTTOM of the stack — a red $5 added to
      // a green $25 slides underneath it.
      const chips = chipsFor(amount).reverse();

      // Total disc rides the top chip of the first column.
      const topCount = Math.min(chips.length, MAX_STACK);
      const topDenom = chips[topCount - 1];
      // Disc wears the chip's own color; the near-white $1 keeps dark ink.
      const base = CHIP_STYLE[topDenom].base;
      const ink = topDenom === 1 ? '#5f5949' : '#f4f1e6';
      this.placeDisc(
        discIndex++,
        anchor.x,
        anchor.z,
        0.001 + (topCount - 1) * (CHIP_HEIGHT * 1.04) + CHIP_HEIGHT + 0.0006,
        amount,
        base,
        ink,
      );

      const baseSeed = hash(id);
      let slot = 0; // advances only for chips actually rendered — no floating gaps
      for (let i = 0; i < chips.length; i++) {
        const denom = chips[i];
        const mesh = this.meshes.get(denom)!;
        const idx = counts.get(denom)!;
        if (idx >= MAX_PER_DENOM) continue; // display cap; money stays correct in state

        const column = Math.floor(slot / MAX_STACK);
        const level = slot % MAX_STACK;
        slot++;
        // Columns fan out alternately left/right of the anchor.
        const colOffset =
          column === 0 ? 0 : (Math.ceil(column / 2) * (column % 2 === 1 ? 1 : -1)) * (CHIP_RADIUS * 2.15);
        const j = jitter(baseSeed ^ (i * 0x45d9f3b));
        this.pos.set(
          anchor.x + colOffset + j.dx,
          0.001 + CHIP_HEIGHT / 2 + level * (CHIP_HEIGHT * 1.04),
          anchor.z + j.dz,
        );
        this.quat.setFromAxisAngle(this.axisY, j.rot);
        this.mat4.compose(this.pos, this.quat, this.scl);
        mesh.setMatrixAt(idx, this.mat4);
        counts.set(denom, idx + 1);
      }
    }

    for (const d of CHIP_DENOMS) {
      const mesh = this.meshes.get(d)!;
      mesh.count = counts.get(d)!;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = discIndex; i < this.discPool.length; i++) {
      this.discPool[i].visible = false;
    }
  }
}
