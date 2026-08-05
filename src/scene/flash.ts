// Short-lived colored flashes over layout regions when bets resolve:
// green for wins, red for losses, amber for pushes/returns, blue for travels.

import * as THREE from 'three';
import { LAYOUT_REGIONS, anchorForBetId, type Rect } from './layout';

const LIFETIME = 1.4; // seconds

interface FlashItem {
  mesh: THREE.Mesh;
  age: number;
}

export class RegionFlash {
  readonly group = new THREE.Group();
  private items: FlashItem[] = [];

  private make(rect: Rect, color: string) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    mesh.rotateX(-Math.PI / 2);
    mesh.position.set((rect.x0 + rect.x1) / 2, 0.0035, (rect.z0 + rect.z1) / 2);
    this.group.add(mesh);
    this.items.push({ mesh, age: 0 });
  }

  /** Flash the region for a bet id; falls back to a patch around its chip anchor. */
  flashBet(betId: string, color: string) {
    const region = LAYOUT_REGIONS.find((r) => r.id === betId);
    if (region) {
      this.make(region.rect, color);
    } else {
      const a = anchorForBetId(betId);
      this.make({ x0: a.x - 0.055, z0: a.z - 0.045, x1: a.x + 0.055, z1: a.z + 0.045 }, color);
    }
  }

  update(delta: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.age += delta;
      const t = item.age / LIFETIME;
      if (t >= 1) {
        this.group.remove(item.mesh);
        item.mesh.geometry.dispose();
        (item.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
      } else {
        (item.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - t) * (1 - t);
      }
    }
  }
}
