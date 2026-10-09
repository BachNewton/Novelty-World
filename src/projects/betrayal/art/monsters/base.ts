import * as THREE from "three";
import { BASE_TOP } from "../explorers/figure";
import { figureMaterial, form, plinth } from "../forms";
import { paletteHex, type PaletteKey } from "../palette";
import { glow, group, lightMaterial } from "../shapes";

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
 * dark to tell it from an explorer's.
 */
export function monsterBase(radius: number, { rim = "stoneDark" }: { rim?: PaletteKey } = {}): THREE.Group {
  const plate = form(figureMaterial(), plinth(radius, radius - 0.02, BASE_TOP, rim, radius > 0.6 ? 96 : 64));
  plate.name = "base";
  return group(plate);
}

/**
 * What a floating figure leaves on the floor instead of a base: a soft pool
 * of its own light, brightest beneath it and fading to nothing at `radius`,
 * so where it floats reads in a dark room. It lies just off the floor; set
 * its opacity to dim it as the figure rises.
 */
export function floorGlow(radius: number, colour: PaletteKey, opacity: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.001, radius, 40, 8);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const tint = new THREE.Color(paletteHex(colour));
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const fade = (1 - Math.min(1, Math.hypot(position.getX(i), position.getZ(i)) / radius)) ** 2;
    colours.set([tint.r * fade, tint.g * fade, tint.b * fade], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const material = lightMaterial(opacity, { vertexColors: true });
  material.toneMapped = false;
  const glow = new THREE.Mesh(geometry, material);
  glow.name = "floor glow";
  glow.position.y = 0.012;
  return glow;
}
