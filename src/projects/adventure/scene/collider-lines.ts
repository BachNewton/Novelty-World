import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Physics } from "../physics";

/** How far round the player, across the ground, the colliders are drawn. */
const REACH = 3;

/**
 * The debug overlay's lines: the colliders round a player as Rapier holds
 * them, every edge of every stand-in and body, so the owner sees what is
 * really met, drawn only while the overlay is open. What never moves is asked
 * of Rapier again only when the player moves to another cell or the colliders
 * change; the bodies, which move, every frame, after everyone has moved, so a
 * player's capsule is drawn where it is this frame.
 */
export class ColliderLines {
  readonly lines = new THREE.Group();
  private readonly still = new THREE.BufferGeometry();
  private readonly moving = new THREE.BufferGeometry();
  private drawn = "";

  constructor() {
    const material = new THREE.LineBasicMaterial({ color: themeColor("--color-brand-pink") });
    for (const geometry of [this.still, this.moving]) {
      const lines = new THREE.LineSegments(geometry, material);
      lines.frustumCulled = false;
      this.lines.add(lines);
    }
    this.lines.visible = false;
  }

  /** Draw the colliders round a point, as of the colliders' `version`; or nothing, when `shown` is off. */
  update(shown: boolean, physics: Physics | null, x: number, z: number, version: number): void {
    this.lines.visible = shown && physics !== null;
    if (!shown || physics === null) return;
    const [cx, cz] = [Math.floor(x) + 0.5, Math.floor(z) + 0.5];
    this.moving.setAttribute("position", new THREE.BufferAttribute(physics.linesNear(cx, cz, REACH + 0.5, true), 3));
    const key = `${cx},${cz},${version}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.still.setAttribute("position", new THREE.BufferAttribute(physics.linesNear(cx, cz, REACH + 0.5, false), 3));
  }
}
