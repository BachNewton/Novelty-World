import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { BASE_TOP } from "../explorers/figure";
import { cylinder, flat, glow, group } from "../shapes";

export interface MonsterOptions {
  /** Shown stunned (rules.md, How Monsters Work): it misses its next turn,
   *  so it drops out of its idle into a pose of its own. */
  stunned?: boolean;
}

/** Glowing paint that keeps its colour under the bench's and the house's
 *  exposure: tone mapping would wash every glow out towards the same white. */
export function ghostly(colour: PaletteKey, map?: THREE.Texture): THREE.MeshBasicMaterial {
  const material = glow(colour, map);
  material.toneMapped = false;
  return material;
}

/**
 * A monster's round base: the explorers' base, as wide as the monster needs,
 * with an arrow inlaid at its front edge when the way it faces matters (it
 * faces +z). The arrow is sunk into the rim, so it reads as paint, not a part.
 */
export function monsterBase(radius: number, { rim = "stoneDark", arrow }: { rim?: PaletteKey; arrow?: PaletteKey } = {}): THREE.Group {
  const result = group(cylinder(radius, BASE_TOP, flat(rim), [0, 0, 0], { top: radius - 0.02, sides: radius > 0.6 ? 24 : 16 }));
  if (arrow) {
    const size = radius * 0.32;
    const shape = new THREE.Shape([
      new THREE.Vector2(0, size),
      new THREE.Vector2(size * 0.7, -size * 0.3),
      new THREE.Vector2(0, 0),
      new THREE.Vector2(-size * 0.7, -size * 0.3),
    ]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    // Lay it flat, point forward, its top 5 mm proud of the base.
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, BASE_TOP + 0.005, radius - 0.04 - size);
    result.add(new THREE.Mesh(geometry, ghostly(arrow)));
  }
  return result;
}
