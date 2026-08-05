// Procedural casino dice — sharp-edged translucent-red look with white pips,
// drawn onto canvas textures. All original art, generated in code.

import * as THREE from 'three';
import { DICE } from './constants';

const TEX_SIZE = 256;

/** Pip centers on a 256px face, in the standard arrangements. */
const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[128, 128]],
  2: [
    [72, 72],
    [184, 184],
  ],
  3: [
    [64, 64],
    [128, 128],
    [192, 192],
  ],
  4: [
    [72, 72],
    [184, 72],
    [72, 184],
    [184, 184],
  ],
  5: [
    [64, 64],
    [192, 64],
    [128, 128],
    [64, 192],
    [192, 192],
  ],
  6: [
    [72, 60],
    [184, 60],
    [72, 128],
    [184, 128],
    [72, 196],
    [184, 196],
  ],
};

function makeFaceTexture(pips: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Deep casino red with a soft radial falloff toward the edges.
  const g = ctx.createRadialGradient(128, 118, 30, 128, 128, 190);
  g.addColorStop(0, '#c81626');
  g.addColorStop(0.7, '#ad0f1e');
  g.addColorStop(1, '#8d0b17');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Slightly darkened edge band so faces read as separate at glancing angles.
  ctx.strokeStyle = 'rgba(60, 4, 10, 0.55)';
  ctx.lineWidth = 10;
  ctx.strokeRect(3, 3, TEX_SIZE - 6, TEX_SIZE - 6);

  // Pips: white with a subtle recessed shading.
  for (const [x, y] of PIP_LAYOUTS[pips]) {
    const shade = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, 22);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.75, '#f2f0ea');
    shade.addColorStop(1, '#c9c4b8');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 6, 12, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let sharedMaterials: THREE.MeshStandardMaterial[] | null = null;

/**
 * Materials in BoxGeometry face order [+X, -X, +Y, -Y, +Z, -Z], matching
 * FACE_NORMALS in src/dice/faces.ts: 3, 4, 1, 6, 2, 5.
 */
function dieMaterials(): THREE.MeshStandardMaterial[] {
  if (!sharedMaterials) {
    sharedMaterials = [3, 4, 1, 6, 2, 5].map(
      (pips) =>
        new THREE.MeshStandardMaterial({
          map: makeFaceTexture(pips),
          roughness: 0.28,
          metalness: 0.0,
        }),
    );
  }
  return sharedMaterials;
}

export function createDieMesh(): THREE.Mesh {
  const size = DICE.half * 2;
  const geo = new THREE.BoxGeometry(size, size, size);
  const mesh = new THREE.Mesh(geo, dieMaterials());
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}
