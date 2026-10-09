import * as THREE from "three";
import { BASE_TOP, joins } from "../explorers/figure";
import { figureMaterial, form, plinth, roundBox, shaped } from "../forms";
import type { PaletteKey } from "../palette";
import { glow, group } from "../shapes";

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

/** A glowing figure's material, coloured by its geometry's colours (shade
 *  them with `glowShaded`), kept out of tone mapping as `ghostly` is.
 *  `brightness` dims the whole glow, for a spectre stunned. */
export function spectral(brightness = 1): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  material.color.setScalar(brightness);
  material.toneMapped = false;
  return material;
}

/**
 * A monster's round base: the explorers' base, as wide as the monster needs,
 * with an arrow inlaid at its front edge when the way it faces matters (it
 * faces +z). The arrow is sunk into the rim, so it reads as paint, not a part.
 */
export function monsterBase(radius: number, { rim = "stoneDark", arrow }: { rim?: PaletteKey; arrow?: PaletteKey } = {}): THREE.Group {
  const plate = form(figureMaterial(), plinth(radius, radius - 0.02, BASE_TOP, rim, radius > 0.6 ? 96 : 64));
  plate.name = "base";
  const result = group(plate);
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
    const middle = new THREE.Vector3(0, BASE_TOP - 0.015, radius - 0.04 - size + size * 0.35);
    geometry.translate(0, BASE_TOP + 0.005, radius - 0.04 - size);
    const inlay = new THREE.Mesh(shaped(geometry, roundBox(middle.toArray(), [size * 0.7, 0.02, size * 0.65], 0)), ghostly(arrow));
    inlay.name = "arrow";
    const set = group();
    set.position.copy(middle);
    result.add(inlay, set);
    // The arrow is set into the rim, as an inlay.
    joins(result, [{ parts: [inlay, plate], at: set, radius: size * 1.2 }]);
  }
  return result;
}
