// The craps table: dark green felt, padded inner walls, wood rail cap.
// Static — only dice (and later the puck and chips) ever move.
// Dimensions come from constants.ts so physics and visuals always agree.
// Full screen-printed layout art arrives in Phase 3.

import * as THREE from 'three';
import { TABLE } from './constants';
import { paintLayout } from './layout-texture';

/** Procedural mahogany: deep reddish base, soft sheen band, fine grain. */
function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#82503a');
  g.addColorStop(0.35, '#6b3d26');
  g.addColorStop(0.65, '#5a2f1c');
  g.addColorStop(1, '#6f4028');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 130; i++) {
    const y = Math.random() * 256;
    const amp = 2 + Math.random() * 6;
    const alpha = 0.04 + Math.random() * 0.1;
    const light = Math.random() > 0.75;
    ctx.strokeStyle = light ? `rgba(190, 130, 90, ${alpha * 0.7})` : `rgba(26, 12, 5, ${alpha})`;
    ctx.lineWidth = 0.7 + Math.random() * 2.4;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const yy = y + Math.sin(x * 0.011 + i * 1.7) * amp;
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

/** Pyramid-rubber wall padding: rows of raised studs — the wall dice bounce off. */
function wallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d3a30';
  ctx.fillRect(0, 0, 512, 128);
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const rh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cw + cw / 2 + (r % 2 ? cw / 2 : 0);
      const cy = r * rh + rh / 2;
      const s = Math.min(cw, rh) * 0.34;
      // Lit facet (top-left) and shaded facet (bottom-right) fake the pyramid.
      ctx.fillStyle = '#1d6b55';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx - s, cy);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = '#175a47';
      ctx.fill();
      ctx.fillStyle = '#082923';
      ctx.beginPath();
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function buildTable(): THREE.Group {
  const group = new THREE.Group();
  const { feltHalfX, feltHalfZ, wallHeight, wallThickness: wt, feltThickness, railWidth, railHeight } =
    TABLE;

  const feltSideMat = new THREE.MeshStandardMaterial({ color: '#0b4237', roughness: 0.95 });
  const wallTexLong = wallTexture();
  wallTexLong.repeat.set(8, 1);
  const wallTexShort = wallTexLong.clone();
  wallTexShort.repeat.set(4, 1);
  const mkPad = (tex: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 2.2,
      roughness: 0.72,
      metalness: 0,
    });
  const padLongMat = mkPad(wallTexLong); // player/far sides (run along x)
  const padShortMat = mkPad(wallTexShort); // table ends (run along z)
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTexture(),
    roughness: 0.26,
    metalness: 0.06,
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

  // Inner padded walls with the pyramid-rubber stud texture.
  const mkWall = (w: number, d: number, x: number, z: number, mat: THREE.Material) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), mat);
    wall.position.set(x, wallHeight / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  };
  mkWall(wt, (feltHalfZ + wt) * 2, -(feltHalfX + wt / 2), 0, padShortMat); // far end
  mkWall(wt, (feltHalfZ + wt) * 2, feltHalfX + wt / 2, 0, padShortMat); // near end
  mkWall((feltHalfX + wt) * 2, wt, 0, feltHalfZ + wt / 2, padLongMat); // player side
  mkWall((feltHalfX + wt) * 2, wt, 0, -(feltHalfZ + wt / 2), padLongMat); // far side

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
