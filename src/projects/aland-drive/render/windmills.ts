import type { Scene } from "three/webgpu";
import type { Placement, RoadsideMaterials } from "../art/roadside/index";
import { buildWindmill } from "../art/rural/index";
import { createPlacedModels } from "./placed-models";
import type { WorldTileEntry } from "./tile";
import { millScale, PLACE_FLOATS } from "./tile-models";

/*
 * Åland's post mills at their real places (`pipeline/farm.py`), drawn by the rural kit. A mill stands 14 m to its top
 * sail on open farmland, in sight for kilometres, so every mill on the island is one list from the start, read from
 * `world.json` as the church towers' far versions are: it never leaves with its tile's detail, and it ends only where
 * it is under two pixels, at the mills' reach.
 */
export const WINDMILL_REACH_M = 12_000;

const fit = (places: Float32Array): Placement[] => {
  const fits: Placement[] = [];
  for (let at = 0; at < places.length; at += PLACE_FLOATS) {
    const [x, y, z, yaw, , length] = places.subarray(at, at + PLACE_FLOATS);
    fits.push({ x, y, z, yaw, scale: millScale(length) });
  }
  return fits;
};

export function createWindmills(scene: Scene, materials: RoadsideMaterials, tiles: readonly WorldTileEntry[]) {
  const mills = createPlacedModels(scene, { windmill: { build: buildWindmill, materials, fit } }, WINDMILL_REACH_M, "a windmill");
  mills.add("island", { windmill: Float32Array.from(tiles.flatMap((tile) => tile.windmills ?? []).flat()) });
  return mills;
}
