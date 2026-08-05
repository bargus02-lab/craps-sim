// The ON/OFF puck. Slides to the point's number box when a point is
// established and flips to its black OFF face back in the corner when the
// hand ends. Procedural textures, tweened movement.

import * as THREE from 'three';
import type { PointNumber } from '../engine/state';
import { numberBoxRect } from './layout';

const OFF_POS = { x: -1.21, z: -0.44 };
const RADIUS = 0.042;
const HEIGHT = 0.012;

function faceTexture(bg: string, fg: string, text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = '900 92px Verdana, Geneva, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 132);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Puck {
  readonly mesh: THREE.Mesh;
  private targetPos = new THREE.Vector3(OFF_POS.x, HEIGHT / 2 + 0.001, OFF_POS.z);
  private targetFlip = Math.PI; // OFF face up

  constructor() {
    const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 32);
    const side = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.5 });
    const on = new THREE.MeshStandardMaterial({
      map: faceTexture('#efe9da', '#1c1c1e', 'ON'),
      roughness: 0.45,
    });
    const off = new THREE.MeshStandardMaterial({
      map: faceTexture('#161618', '#efe9da', 'OFF'),
      roughness: 0.45,
    });
    this.mesh = new THREE.Mesh(geo, [side, on, off]);
    this.mesh.castShadow = true;
    this.mesh.position.copy(this.targetPos);
    this.mesh.rotation.z = this.targetFlip;
  }

  setPoint(n: PointNumber | null) {
    if (n === null) {
      this.targetPos.set(OFF_POS.x, HEIGHT / 2 + 0.001, OFF_POS.z);
      this.targetFlip = Math.PI;
    } else {
      const box = numberBoxRect(n);
      const cx = (box.x0 + box.x1) / 2;
      this.targetPos.set(cx + 0.09, HEIGHT / 2 + 0.001, -0.6);
      this.targetFlip = 0; // ON face up
    }
  }

  update(delta: number) {
    const k = 1 - Math.exp(-7 * delta);
    this.mesh.position.lerp(this.targetPos, k);
    this.mesh.rotation.z += (this.targetFlip - this.mesh.rotation.z) * k;
  }
}
