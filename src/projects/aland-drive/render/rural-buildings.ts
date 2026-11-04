import type { Scene } from "three/webgpu";
import type { Placement, RoadsideMaterials } from "../art/roadside/index";
import { BOATHOUSE, buildBoathouse, buildBoulder, buildCow, buildHayBale, buildSheep, buildShed, buildTractor, buildWrappedBale, SHED, type CowPose, type SheepPose } from "../art/rural/index";
import { createPlacedModels, type PlacedKind } from "./placed-models";
import { BOULDER_MODELS, FARM_MODELS, PLACE_FLOATS } from "./tile-models";

/*
 * The boathouses and sheds the pipeline placed on real footprints
 * (`pipeline/outbuildings.py`), and the boulders the Topographic Database maps
 * (`pipeline/rocks.py`), drawn by the rural kit.
 *
 * The pipeline says how big each footprint is; this fits the model to it: the
 * walls to the outline, and the height in proportion to the width, within reason,
 * so a long boathouse stays a boathouse rather than a barn. A boulder is scaled whole
 * to its width, and keeps the kit's own reach: it's no building, and a big one on a
 * field is seen from further than a shed. So do the farm's bales, tractors and sheep
 * (`pipeline/farm.py`), each at the scale its place carries.
 */

/** How far a model is scaled up or down with its footprint's width; the rest is stretch. */
const SCALE_RANGE = [0.85, 1.25] as const;

/** The kit's boulder at scale 1 is about this wide at its foot. */
const BOULDER_WIDTH_M = 1.5;

function fitted(fit: (place: Float32Array) => Placement) {
  return (places: Float32Array): Placement[] => {
    const fits: Placement[] = [];
    for (let at = 0; at < places.length; at += PLACE_FLOATS) fits.push(fit(places.subarray(at, at + PLACE_FLOATS)));
    return fits;
  };
}

const building =
  (walls: { x: number; z: number }) =>
  ([x, y, z, yaw, width, length]: Float32Array): Placement => {
    const scale = Math.min(Math.max(width / (2 * walls.x), SCALE_RANGE[0]), SCALE_RANGE[1]);
    return { x, y, z, yaw, scale, stretch: width / (2 * walls.x * scale), depth: length / (2 * walls.z * scale) };
  };
const boulder = ([x, y, z, yaw, width]: Float32Array): Placement => ({ x, y, z, yaw, scale: width / BOULDER_WIDTH_M });
const prop = ([x, y, z, yaw, scale]: Float32Array): Placement => ({ x, y, z, yaw, scale });

function farmModel(name: (typeof FARM_MODELS)[number]) {
  if (name === "bale-wrapped") return buildWrappedBale();
  if (name === "bale-hay") return buildHayBale();
  if (name === "tractor") return buildTractor();
  const [animal, pose] = name.split("-");
  return animal === "cow" ? buildCow(pose as CowPose) : buildSheep(pose as SheepPose);
}

export function createRuralBuildings(scene: Scene, materials: RoadsideMaterials, reachM: number) {
  const kind = (build: PlacedKind["build"], walls: { x: number; z: number }): PlacedKind => ({ build, materials, fit: fitted(building(walls)) });
  return createPlacedModels(
    scene,
    {
      "shed-red": kind(() => buildShed("red"), SHED),
      "shed-grey": kind(() => buildShed("grey"), SHED),
      "boathouse-red": kind(() => buildBoathouse("red"), BOATHOUSE),
      "boathouse-tarred": kind(() => buildBoathouse("tarred"), BOATHOUSE),
      ...Object.fromEntries(BOULDER_MODELS.map((name): [string, PlacedKind] => [name, { build: () => buildBoulder(Number(name.split("-")[1])), materials, fit: fitted(boulder), ownReach: true }])),
      ...Object.fromEntries(FARM_MODELS.map((name): [string, PlacedKind] => [name, { build: () => farmModel(name), materials, fit: fitted(prop), ownReach: true }])),
    },
    reachM,
    "a rural building",
  );
}
