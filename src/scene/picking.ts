// Pointer -> felt-plane raycasting and bet-region hit testing, with a hover
// highlight quad.
//
// Gesture contract (shared with RailCamera via CLICK_SLOP_PX): a pointer that
// EVER moves beyond the slop is a camera drag and can never fire a bet — the
// exceeded flag is latched during pointermove, so an out-and-back drag that
// happens to end near its origin still counts as a drag. One pointer at a
// time; stale or foreign pointerups are ignored.

import * as THREE from 'three';
import { CLICK_SLOP_PX } from './constants';
import { regionAt, type LayoutRegion } from './layout';

export interface PickEvents {
  onBet(region: LayoutRegion): void;
  onRemove(region: LayoutRegion): void;
  onHover(region: LayoutRegion | null, clientX: number, clientY: number): void;
}

export class LayoutPicker {
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // felt y = 0
  private hit = new THREE.Vector3();
  private highlight: THREE.Mesh;
  private activePointer: number | null = null;
  private downX = 0;
  private downY = 0;
  private downRemove = false; // right button, ctrl+click, or cmd+click
  private downValid = false;
  private exceededSlop = false;
  private suppressedAtDown = false;
  private lastHoverAt = 0;

  constructor(
    private el: HTMLElement,
    private camera: THREE.Camera,
    scene: THREE.Scene,
    private events: PickEvents,
    /** When this returns true (e.g. camera mid-animation), clicks are ignored. */
    private suppressClicks: () => boolean = () => false,
    /** Dynamic regions (e.g. odds zones on traveled come points), checked first. */
    private extraRegions: () => LayoutRegion[] = () => [],
  ) {
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    this.highlight.rotateX(-Math.PI / 2);
    this.highlight.visible = false;
    scene.add(this.highlight);

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (this.activePointer !== null) return; // one pointer drives betting
      this.activePointer = e.pointerId;
      this.downX = e.clientX;
      this.downY = e.clientY;
      // Removal gestures: ctrl+click (cmd+click on Mac) or right-click. On
      // macOS, ctrl+click already arrives as button 2 — covered either way.
      this.downRemove = e.button === 2 || e.ctrlKey || e.metaKey;
      this.downValid = e.button === 0 || e.button === 2;
      this.exceededSlop = false;
      // LATCHED at gesture start: a press that begins while the camera is off
      // the rail (or dice are rolling) can never become a bet, no matter how
      // long it is held — the world may move under a stationary pointer.
      this.suppressedAtDown = this.suppressClicks();
    });
    el.addEventListener('pointermove', (e) => {
      // Slop tracking sees EVERY move (gesture correctness)...
      if (
        e.pointerId === this.activePointer &&
        Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > CLICK_SLOP_PX
      ) {
        this.exceededSlop = true; // latched: this gesture is a drag forever
      }
      // ...but the raycast + DOM hover work is throttled to ~60Hz so
      // high-report-rate mice can't flood the main thread.
      if (e.timeStamp - this.lastHoverAt < 16) return;
      this.lastHoverAt = e.timeStamp;
      const region = this.regionUnder(e);
      this.setHighlight(region);
      this.events.onHover(region, e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.activePointer) return;
      const remove = this.downRemove;
      const valid = this.downValid;
      const wasDrag = this.exceededSlop;
      const suppressed = this.suppressedAtDown;
      this.activePointer = null;
      this.downValid = false;
      if (!valid || wasDrag || suppressed || this.suppressClicks()) return;
      const region = this.regionUnder(e);
      if (!region) return;
      if (remove) this.events.onRemove(region);
      else this.events.onBet(region);
    });
    el.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.activePointer) {
        this.activePointer = null;
        this.downValid = false;
      }
    });
    el.addEventListener('pointerleave', () => {
      this.setHighlight(null);
      this.events.onHover(null, 0, 0);
    });
  }

  private regionUnder(e: PointerEvent): LayoutRegion | null {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!p) return null;
    for (const r of this.extraRegions()) {
      if (p.x >= r.rect.x0 && p.x <= r.rect.x1 && p.z >= r.rect.z0 && p.z <= r.rect.z1) {
        return r;
      }
    }
    return regionAt(p.x, p.z);
  }

  private setHighlight(region: LayoutRegion | null) {
    if (!region) {
      this.highlight.visible = false;
      this.el.style.cursor = 'default';
      return;
    }
    const { x0, z0, x1, z1 } = region.rect;
    this.highlight.scale.set(x1 - x0, z1 - z0, 1);
    this.highlight.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2);
    this.highlight.visible = true;
    this.el.style.cursor = 'pointer';
  }
}
