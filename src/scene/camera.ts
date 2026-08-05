// First-person rail camera: fixed eye position at the rail, drag to look
// around within a limited arc, plus a smooth push-in toward the settled dice.

import * as THREE from 'three';
import { CAMERA, CLICK_SLOP_PX } from './constants';

/** Vertical FOV that keeps a constant horizontal FOV across aspect ratios. */
function verticalFov(aspect: number): number {
  const h = THREE.MathUtils.degToRad(CAMERA.horizontalFov);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

const EASE = (t: number) => t * t * (3 - 2 * t); // smoothstep

export class RailCamera {
  readonly camera: THREE.PerspectiveCamera;
  private basePos: THREE.Vector3;
  private baseQuat = new THREE.Quaternion();
  private baseYaw: number;
  private basePitch: number;
  private yawOffset = 0;
  private pitchOffset = 0;
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private engaged = false; // only rotate once the pointer has moved past the click slop

  // Push-in animation state.
  private focusPos: THREE.Vector3 | null = null;
  private focusQuat = new THREE.Quaternion();
  private blend = 0; // 0 = at rail, 1 = at focus
  private blendTarget = 0;

  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private railQuat = new THREE.Quaternion();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(verticalFov(aspect), aspect, 0.01, 30);
    const p = CAMERA.position;
    this.basePos = new THREE.Vector3(p.x, p.y, p.z);
    this.camera.position.copy(this.basePos);
    const t = CAMERA.target;
    this.camera.lookAt(t.x, t.y, t.z);
    this.baseQuat.copy(this.camera.quaternion);
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.baseYaw = e.y;
    this.basePitch = e.x;
  }

  attach(el: HTMLElement) {
    el.addEventListener('pointerdown', (ev) => {
      // Any interaction while pushed in on the dice returns to the rail view
      // (the click itself is suppressed while the camera animates back).
      if (this.blendTarget === 1) this.release();
      if (this.activePointer !== null || ev.button !== 0) return; // one finger, left button
      this.activePointer = ev.pointerId;
      this.lastX = this.downX = ev.clientX;
      this.lastY = this.downY = ev.clientY;
      this.engaged = false;
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== this.activePointer) return;
      if (!this.engaged) {
        // A click (small movement) places a bet; only real drags steer the view.
        if (Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY) <= CLICK_SLOP_PX) return;
        this.engaged = true;
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;
        return;
      }
      const dx = ev.clientX - this.lastX;
      const dy = ev.clientY - this.lastY;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.yawOffset = THREE.MathUtils.clamp(
        this.yawOffset - dx * 0.0022,
        -CAMERA.maxYaw,
        CAMERA.maxYaw,
      );
      this.pitchOffset = THREE.MathUtils.clamp(
        this.pitchOffset - dy * 0.0018,
        -CAMERA.maxPitchDown,
        CAMERA.maxPitchUp,
      );
    });
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== this.activePointer) return;
      this.activePointer = null;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Ease toward a viewpoint looking at `lookAt` (e.g. the settled dice). */
  pushTo(pos: THREE.Vector3, lookAt: THREE.Vector3) {
    // Camera convention: -Z faces the target (Matrix4.lookAt builds exactly that).
    const m = new THREE.Matrix4().lookAt(pos, lookAt, new THREE.Vector3(0, 1, 0));
    this.focusPos = pos.clone();
    this.focusQuat.setFromRotationMatrix(m);
    this.blendTarget = 1;
  }

  /** Ease back to the rail view. */
  release() {
    this.blendTarget = 0;
  }

  /** True while the push-in/release blend is animating (clicks are unreliable then). */
  get isAnimating(): boolean {
    return this.blend !== this.blendTarget;
  }

  /** True whenever the camera is not at (or settled on) the rail view. */
  get isOffRail(): boolean {
    return this.blend > 0 || this.blendTarget === 1;
  }

  update(delta: number) {
    // Rail orientation with drag offsets.
    this.railQuat.setFromEuler(
      new THREE.Euler(this.basePitch + this.pitchOffset, this.baseYaw + this.yawOffset, 0, 'YXZ'),
    );

    const speed = 1.6; // blend units per second
    if (this.blend !== this.blendTarget) {
      const dir = Math.sign(this.blendTarget - this.blend);
      this.blend = THREE.MathUtils.clamp(this.blend + dir * speed * delta, 0, 1);
    }

    if (this.focusPos && this.blend > 0) {
      const k = EASE(this.blend);
      this.fromPos.lerpVectors(this.basePos, this.focusPos, k);
      this.fromQuat.slerpQuaternions(this.railQuat, this.focusQuat, k);
      this.camera.position.copy(this.fromPos);
      this.camera.quaternion.copy(this.fromQuat);
      if (this.blend === 0) this.focusPos = null;
    } else {
      this.camera.position.copy(this.basePos);
      this.camera.quaternion.copy(this.railQuat);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.fov = verticalFov(aspect);
    this.camera.updateProjectionMatrix();
  }
}
