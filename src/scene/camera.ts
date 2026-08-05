// Camera rig with two betting views and a dice close-up:
// - 'overhead': directly above the table, whole layout visible — the default
//   betting view.
// - 'rail': first-person at the rail with a limited drag-look arc — the view
//   the throw is watched from.
// - focus: temporary push-in on the settled dice, dismissed by interaction.
// All transitions are smoothly blended.

import * as THREE from 'three';
import { CAMERA, CLICK_SLOP_PX, TABLE } from './constants';

export type ViewMode = 'rail' | 'overhead';

/** Vertical FOV that keeps a constant horizontal FOV across aspect ratios. */
function verticalFov(aspect: number): number {
  const h = THREE.MathUtils.degToRad(CAMERA.horizontalFov);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

const EASE = (t: number) => t * t * (3 - 2 * t); // smoothstep

export class RailCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Called when the player dismisses the dice close-up with a press. */
  onUserDismiss: (() => void) | null = null;

  // Rail pose + drag-look state.
  private railPos: THREE.Vector3;
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

  // Overhead pose (recomputed per aspect so the whole felt always fits).
  private overheadPos = new THREE.Vector3();
  private overheadQuat = new THREE.Quaternion();

  // View-mode blend: 0 = rail, 1 = overhead.
  private viewMode: ViewMode;
  private modeBlend: number;
  private modeTarget: number;

  // Dice close-up (focus) blend: 0 = base view, 1 = at the dice.
  private focusPos: THREE.Vector3 | null = null;
  private focusQuat = new THREE.Quaternion();
  private blend = 0;
  private blendTarget = 0;

  private railQuat = new THREE.Quaternion();
  private basePosTmp = new THREE.Vector3();
  private baseQuatTmp = new THREE.Quaternion();
  private outPos = new THREE.Vector3();
  private outQuat = new THREE.Quaternion();

  constructor(aspect: number, initialMode: ViewMode = 'overhead') {
    this.camera = new THREE.PerspectiveCamera(verticalFov(aspect), aspect, 0.01, 30);
    const p = CAMERA.position;
    this.railPos = new THREE.Vector3(p.x, p.y, p.z);
    this.camera.position.copy(this.railPos);
    const t = CAMERA.target;
    this.camera.lookAt(t.x, t.y, t.z);
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.baseYaw = e.y;
    this.basePitch = e.x;

    this.computeOverhead(aspect);
    this.viewMode = initialMode;
    this.modeBlend = this.modeTarget = initialMode === 'overhead' ? 1 : 0;
    this.update(0);
  }

  private overheadDist = 3;

  private computeOverhead(aspect: number) {
    // Not straight down: a gently tilted plan view (the "main view"), like a
    // player leaning over the table. Framed on the ACTIVE half of the table
    // (the printed end section + props, x -1.3..0.7) rather than the empty
    // shooter's apron, with the rail allowed to crop top/bottom.
    const elevation = THREE.MathUtils.degToRad(64);
    const hfov = THREE.MathUtils.degToRad(CAMERA.horizontalFov);
    const vfov = THREE.MathUtils.degToRad(verticalFov(aspect));
    const hx = 1.14; // half-width of the framed area around the layout
    const hz = TABLE.feltHalfZ + TABLE.wallThickness + 0.03;
    const dW = hx / Math.tan(hfov / 2);
    const dH = (hz * Math.sin(elevation) + 0.06) / Math.tan(vfov / 2);
    const d = Math.max(dW, dH) + 0.06;
    this.overheadDist = d;

    const target = new THREE.Vector3(-0.2, 0, -0.02);
    const dir = new THREE.Vector3(0, -Math.sin(elevation), -Math.cos(elevation));
    this.overheadPos.copy(target).addScaledVector(dir, -d);
    const m = new THREE.Matrix4().lookAt(this.overheadPos, target, new THREE.Vector3(0, 1, 0));
    this.overheadQuat.setFromRotationMatrix(m);
  }

  get mode(): ViewMode {
    return this.viewMode;
  }

  /** Camera-to-table distance of the main view (for depth-of-field focus). */
  get overheadHeight(): number {
    return this.overheadDist;
  }

  setMode(mode: ViewMode) {
    this.viewMode = mode;
    this.modeTarget = mode === 'overhead' ? 1 : 0;
  }

  attach(el: HTMLElement) {
    el.addEventListener('pointerdown', (ev) => {
      // Any interaction while pushed in on the dice returns to the base view
      // (the click itself is suppressed while the camera animates back).
      if (this.blendTarget === 1) {
        this.release();
        this.onUserDismiss?.();
      }
      if (this.activePointer !== null || ev.button !== 0) return; // one finger, left button
      this.activePointer = ev.pointerId;
      this.lastX = this.downX = ev.clientX;
      this.lastY = this.downY = ev.clientY;
      this.engaged = false;
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== this.activePointer) return;
      if (this.viewMode !== 'rail') return; // drag-look only exists at the rail
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

  /** Ease back to the base (rail/overhead) view. */
  release() {
    this.blendTarget = 0;
  }

  /** True while any camera transition is animating (clicks are unreliable then). */
  get isAnimating(): boolean {
    return this.blend !== this.blendTarget || this.modeBlend !== this.modeTarget;
  }

  /** True whenever the dice close-up is engaged or returning. */
  get isFocusEngaged(): boolean {
    return this.blend > 0 || this.blendTarget === 1;
  }

  update(delta: number) {
    // Rail orientation with drag offsets.
    this.railQuat.setFromEuler(
      new THREE.Euler(this.basePitch + this.pitchOffset, this.baseYaw + this.yawOffset, 0, 'YXZ'),
    );

    // View-mode blend (rail <-> overhead).
    const modeSpeed = 1.8;
    if (this.modeBlend !== this.modeTarget) {
      const dir = Math.sign(this.modeTarget - this.modeBlend);
      this.modeBlend = THREE.MathUtils.clamp(this.modeBlend + dir * modeSpeed * delta, 0, 1);
    }
    const mk = EASE(this.modeBlend);
    this.basePosTmp.lerpVectors(this.railPos, this.overheadPos, mk);
    this.baseQuatTmp.slerpQuaternions(this.railQuat, this.overheadQuat, mk);

    // Focus blend (base <-> dice close-up).
    const focusSpeed = 1.6;
    if (this.blend !== this.blendTarget) {
      const dir = Math.sign(this.blendTarget - this.blend);
      this.blend = THREE.MathUtils.clamp(this.blend + dir * focusSpeed * delta, 0, 1);
    }

    if (this.focusPos && this.blend > 0) {
      const k = EASE(this.blend);
      this.outPos.lerpVectors(this.basePosTmp, this.focusPos, k);
      this.outQuat.slerpQuaternions(this.baseQuatTmp, this.focusQuat, k);
      this.camera.position.copy(this.outPos);
      this.camera.quaternion.copy(this.outQuat);
    } else {
      if (this.blend === 0) this.focusPos = null;
      this.camera.position.copy(this.basePosTmp);
      this.camera.quaternion.copy(this.baseQuatTmp);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.fov = verticalFov(aspect);
    this.camera.updateProjectionMatrix();
    this.computeOverhead(aspect);
  }
}
