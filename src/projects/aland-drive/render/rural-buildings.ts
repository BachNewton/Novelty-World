import type { Scene } from "three/webgpu";
import type { Placement, RoadsideMaterials } from "../art/roadside/index";
import { BOATHOUSE, buildBoathouse, buildShed, SHED } from "../art/rural/index";
import { createPlacedModels, type PlacedKind } from "./placed-models";
import { PLACE_FLOATS } from "./tile-models";

/*
 * The boathouses and sheds the pipeline placed on real footprints
 * (`pipeline/outbuildings.py`), drawn by the rural kit.
 *
 * The pipeline says how big each footprint is; this fits the model to it: the
 * walls to the outline, and the height in proportion to the width, within reason,
 * so a long boathouse stays a boathouse rather than a barn.
 */

/** How far a model is scaled up or down with its footprint's width; the rest is stretch. */
const SCALE_RANGE = [0.85, 1.25] as const;

function fitted(walls: { x: number; z: number }) {
  return (places: Float32Array): Placement[] => {
    const fits: Placement[] = [];
    for (let at = 0; at < places.length; at += PLACE_FLOATS) {
      const [x, y, z, yaw, width, length] = places.subarray(at, at + PLACE_FLOATS);
      const scale = Math.min(Math.max(width / (2 * walls.x), SCALE_RANGE[0]), SCALE_RANGE[1]);
      fits.push({ x, y, z, yaw, scale, stretch: width / (2 * walls.x * scale), depth: length / (2 * walls.z * scale) });
    }
    return fits;
  };
}

export function createRuralBuildings(scene: Scene, materials: RoadsideMaterials, reachM: number) {
  const kind = (build: PlacedKind["build"], walls: { x: number; z: number }): PlacedKind => ({ build, materials, fit: fitted(walls) });
  return createPlacedModels(
    scene,
    {
      "shed-red": kind(() => buildShed("red"), SHED),
      "shed-grey": kind(() => buildShed("grey"), SHED),
      "boathouse-red": kind(() => buildBoathouse("red"), BOATHOUSE),
      "boathouse-tarred": kind(() => buildBoathouse("tarred"), BOATHOUSE),
    },
    reachM,
    "a rural building",
  );
}
