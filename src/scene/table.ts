// The craps table: dark green felt, padded inner walls, wood rail cap.
// Static — only dice (and later the puck and chips) ever move.
// Dimensions come from constants.ts so physics and visuals always agree.
// Full screen-printed layout art arrives in Phase 3.

import * as THREE from 'three';
import { TABLE } from './constants';
import { paintLayout } from './layout-texture';

export function buildTable(): THREE.Group {
  const group = new THREE.Group();
  const { feltHalfX, feltHalfZ, wallHeight, wallThickness: wt, feltThickness, railWidth, railHeight } =
    TABLE;

  const feltSideMat = new THREE.MeshStandardMaterial({ color: '#113f29', roughness: 0.95 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#45291a', roughness: 0.62 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7a5433', roughness: 0.42 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#17100b', roughness: 0.9 });

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
