// The craps table: dark green felt, padded inner walls, wood rail cap.
// Static — only dice (and later the puck and chips) ever move.
// Dimensions come from constants.ts so physics and visuals always agree.
// Full screen-printed layout art arrives in Phase 3.

import * as THREE from 'three';
import { TABLE } from './constants';
import { paintLayout } from './layout-texture';

/** Procedural mahogany: warm base with soft darker grain streaks. */
function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6e4426');
  g.addColorStop(0.5, '#5e3820');
  g.addColorStop(1, '#69401f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256;
    const amp = 2 + Math.random() * 5;
    const alpha = 0.05 + Math.random() * 0.09;
    ctx.strokeStyle = `rgba(28, 14, 6, ${alpha})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const yy = y + Math.sin(x * 0.012 + i) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 8;
  return tex;
}

export function buildTable(): THREE.Group {
  const group = new THREE.Group();
  const { feltHalfX, feltHalfZ, wallHeight, wallThickness: wt, feltThickness, railWidth, railHeight } =
    TABLE;

  const feltSideMat = new THREE.MeshStandardMaterial({ color: '#0e4038', roughness: 0.95 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#3c2416', roughness: 0.58 });
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTexture(),
    roughness: 0.3,
    metalness: 0.05,
  });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#170f0a', roughness: 0.85 });

  // Felt slab body (its top face sits just below the printed layout plane).
  const felt = new THREE.Mesh(
    new THREE.BoxGeometry((feltHalfX + wt) * 2, feltThickness, (feltHalfZ + wt) * 2),
    feltSideMat,
  );
  felt.position.y = -feltThickness / 2 - 0.001;
  felt.receiveShadow = true;
  group.add(felt);

  // Screen-printed layout on a thin plane at the playing surface.
  const layoutMat = new THREE.MeshStandardMaterial({
    map: paintLayout(),
    roughness: 0.94,
    metalness: 0,
  });
  const layout = new THREE.Mesh(new THREE.PlaneGeometry(2.68, 1.38), layoutMat);
  layout.rotateX(-Math.PI / 2);
  layout.position.y = 0;
  layout.receiveShadow = true;
  group.add(layout);

  // Inner padded walls.
  const mkWall = (w: number, d: number, x: number, z: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), padMat);
    wall.position.set(x, wallHeight / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  };
  mkWall(wt, (feltHalfZ + wt) * 2, -(feltHalfX + wt / 2), 0); // far end
  mkWall(wt, (feltHalfZ + wt) * 2, feltHalfX + wt / 2, 0); // near end
  mkWall((feltHalfX + wt) * 2, wt, 0, feltHalfZ + wt / 2); // player side
  mkWall((feltHalfX + wt) * 2, wt, 0, -(feltHalfZ + wt / 2)); // far side

  // Wood rail cap running around the top of the walls.
  const railY = wallHeight + railHeight / 2;
  const outerX = feltHalfX + wt + railWidth;
  const outerZ = feltHalfZ + wt + railWidth;
  const mkRail = (w: number, d: number, x: number, z: number) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, railHeight, d), woodMat);
    rail.position.set(x, railY, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  };
  const sideLen = (outerX) * 2;
  mkRail(railWidth + wt, outerZ * 2, -(feltHalfX + (railWidth + wt) / 2), 0);
  mkRail(railWidth + wt, outerZ * 2, feltHalfX + (railWidth + wt) / 2, 0);
  mkRail(sideLen, railWidth + wt, 0, feltHalfZ + (railWidth + wt) / 2);
  mkRail(sideLen, railWidth + wt, 0, -(feltHalfZ + (railWidth + wt) / 2));

  // Skirt below the felt so the table has a body.
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(outerX * 2, 0.5, outerZ * 2),
    skirtMat,
  );
  skirt.position.y = -feltThickness - 0.25;
  group.add(skirt);

  return group;
}
