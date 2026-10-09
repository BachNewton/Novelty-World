import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { batch, cylinder, flat, group, type Size } from "../shapes";

/** A plank crate, `size` metres, with dark battens up its corners and a band
 *  round its middle. Base at y = 0. */
export function crate(size: Size = [0.55, 0.5, 0.55], wood: PaletteKey = "wood"): THREE.Group {
  const [w, h, d] = size;
  const b = batch();
  b.block([w, h, d], wood, [0, 0, 0]);
  for (const sx of [-1, 1]) b.block([0.05, h + 0.01, d + 0.02], "woodDark", [(sx * (w - 0.05)) / 2, -0.005, 0]);
  b.block([w - 0.1, 0.05, d + 0.015], "woodMid", [0, h / 2 - 0.025, 0]);
  return group(b.mesh());
}

export interface CaskOptions {
  radius?: number;
  height?: number;
  /** A lid in the staves' lighter wood, or an open top. */
  lid?: boolean;
}

/** An upright cask on its end, hooped in iron. Base at y = 0. */
export function cask({ radius = 0.24, height = 0.72, lid = true }: CaskOptions = {}): THREE.Group {
  const hoop = flat("soot");
  const result = group(
    cylinder(radius, height, flat("woodMid"), [0, 0, 0], { sides: 10 }),
    cylinder(radius + 0.015, 0.04, hoop, [0, height * 0.14, 0], { sides: 10 }),
    cylinder(radius + 0.015, 0.04, hoop, [0, height * 0.8, 0], { sides: 10 }),
  );
  if (lid) result.add(cylinder(radius - 0.02, 0.02, flat("wood"), [0, height, 0], { sides: 10 }));
  return result;
}
