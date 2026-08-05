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

export const CHIP_DENOMS = [100, 50, 25, 5, 1] as const;
export type ChipDenom = (typeof CHIP_DENOMS)[number];

export const CHIP_STYLE: Record<ChipDenom, { base: string; accent: string; text: string }> = {
  1: { base: '#e9e4d7', accent: '#a7a08f', text: '#39352b' },
  5: { base: '#b03028', accent: '#f2ecdd', text: '#f2ecdd' },
  25: { base: '#1d7a44', accent: '#f2ecdd', text: '#f2ecdd' },
  50: { base: '#d3831c', accent: '#f2ecdd', text: '#2c2010' },
  100: { base: '#1d1d21', accent: '#f2ecdd', text: '#f2ecdd' },
};

export const CHIP_RADIUS = 0.019;
export const CHIP_HEIGHT = 0.0036;
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
    rot: a * Math.PI * 2,
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

    for (const { id, amount } of iterBets(bets)) {
      const anchor = anchorForBetId(id);
      const chips = chipsFor(amount);
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
  }
}
