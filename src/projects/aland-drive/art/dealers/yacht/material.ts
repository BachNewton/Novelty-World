import type { Node } from "three/webgpu";
import { attribute, float, mix, positionGeometry, round } from "three/tsl";
import { boatMaterials, type BoatInputs } from "../../boats/material";
import { BOAT_PARTS } from "../../boats/mesh";
import type { RoadsideMaterials } from "../../roadside/index";
import "../tokens.css";
import "../../night/tokens.css";

/*
 * The boats kit's materials, which place, rock, haze and swap the yacht as they do every boat, with its glass lit from
 * inside once the lamps are on: a yacht in harbour is lit all evening, so every pane glows, warm and steady, in the lit
 * windows' colours (`art/night`). The glow is added after the hour's light and the haze, so the night doesn't dim it.
 */

/** How bright a lit pane is: the saloons' warm lamps above, and the car deck's showroom light in the hull, paler. */
const GLASS_GLOW = 0.5;
/** Below this, a pane is in the hull: the car deck's. */
const HULL_TOP_Y = 4;

export function yachtMaterials(inputs: BoatInputs, lampsOn: Node<"float"> = float(0)): RoadsideMaterials {
  const isGlass = round(attribute<"vec4">("tint", "vec4").r.mul(255)).equal(BOAT_PARTS.indexOf("glass"));
  const inHull = positionGeometry.y.lessThan(HULL_TOP_Y).select(float(1), float(0));
  const lit = mix(inputs.colour("night-window-warm"), inputs.colour("night-window-pale"), inHull);
  const glow = lit.mul(lampsOn.mul(GLASS_GLOW)).mul(isGlass.select(float(1), float(0)));
  const materials = boatMaterials({ ...inputs, hazed: (colour) => inputs.hazed(colour).add(glow) });
  for (const material of [materials.near, materials.far]) material.name = `yacht-${material.name}`;
  return materials;
}
