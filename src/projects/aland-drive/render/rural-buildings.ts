import type { Mesh, Scene } from "three/webgpu";
import { placeModel, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import { BOATHOUSE, buildBoathouse, buildBoulder, buildShed, SHED } from "../art/rural/index";
import { BOULDER_MODELS, PLACE_FLOATS, type TileModels } from "./tile-models";

/*
 * The boathouses and sheds the pipeline placed on real footprints
 * (`pipeline/outbuildings.py`), and the boulders the Topographic Database maps
 * (`pipeline/rocks.py`), drawn by the rural kit. Each model is one list of
 * places across every loaded tile, so each model is two draw calls
 * however many tiles are near, and a tile landing or leaving rebuilds only the
 * lists, which are a few floats a place.
 *
 * The pipeline says how big each footprint is; this fits the model to it: the
 * walls to the outline, and the height in proportion to the width, within reason,
 * so a long boathouse stays a boathouse rather than a barn. A boulder is scaled whole
 * to its width, and keeps the kit's own reach: it's no building, and a big one on a
 * field is seen from further than a shed.
 */

/** How far a model is scaled up or down with its footprint's width; the rest is stretch. */
const SCALE_RANGE = [0.85, 1.25] as const;

/** The kit's boulder at scale 1 is about this wide at its foot. */
const BOULDER_WIDTH_M = 1.5;

type Fit = (place: Float32Array) => Placement;

const building =
  (walls: { x: number; z: number }): Fit =>
  ([x, y, z, yaw, width, length]) => {
    const scale = Math.min(Math.max(width / (2 * walls.x), SCALE_RANGE[0]), SCALE_RANGE[1]);
    return { x, y, z, yaw, scale, stretch: width / (2 * walls.x * scale), depth: length / (2 * walls.z * scale) };
  };
const boulder: Fit = ([x, y, z, yaw, width]) => ({ x, y, z, yaw, scale: width / BOULDER_WIDTH_M });

const MODELS: Record<string, { build: () => RoadsideModel; fit: Fit; ownReach?: boolean }> = {
  "shed-red": { build: () => buildShed("red"), fit: building(SHED) },
  "shed-grey": { build: () => buildShed("grey"), fit: building(SHED) },
  "boathouse-red": { build: () => buildBoathouse("red"), fit: building(BOATHOUSE) },
  "boathouse-tarred": { build: () => buildBoathouse("tarred"), fit: building(BOATHOUSE) },
  ...Object.fromEntries(BOULDER_MODELS.map((name) => [name, { build: () => buildBoulder(Number(name.split("-")[1])), fit: boulder, ownReach: true }])),
};

function fitted(places: Float32Array, fit: Fit): Placement[] {
  const fits: Placement[] = [];
  for (let at = 0; at < places.length; at += PLACE_FLOATS) fits.push(fit(places.subarray(at, at + PLACE_FLOATS)));
  return fits;
}

/** A model with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

export function createRuralBuildings(scene: Scene, materials: RoadsideMaterials, reachM: number) {
  const models = Object.entries(MODELS).map(([name, { build, fit, ownReach = false }]) => {
    const built = build();
    return { name, model: ownReach ? built : { ...built, reachM }, fit, meshes: [] as Mesh[], count: 0 };
  });
  const tiles = new Map<string, TileModels>();

  const rebuild = (names: Iterable<string>) => {
    for (const entry of models.filter(({ name }) => [...names].includes(name))) {
      for (const mesh of entry.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      const places = [...tiles.values()].flatMap((tile) => Object.entries(tile).flatMap(([name, placed]) => (name === entry.name ? fitted(placed, entry.fit) : [])));
      entry.count = places.length;
      entry.meshes = placeModel(entry.model, places.length > 0 ? places : [NOWHERE], materials);
      for (const mesh of entry.meshes) {
        mesh.visible = places.length > 0;
        scene.add(mesh);
      }
    }
  };
  rebuild(Object.keys(MODELS));

  return {
    add(tile: string, placed: TileModels) {
      for (const name of Object.keys(placed)) if (!(name in MODELS)) throw new Error(`${tile} places a model called ${name}, which there isn't`);
      tiles.set(tile, placed);
      rebuild(Object.keys(placed));
    },
    remove(tile: string) {
      const placed = tiles.get(tile);
      if (!placed) throw new Error(`${tile} has no rural buildings to remove`);
      tiles.delete(tile);
      rebuild(Object.keys(placed));
    },
    /** Every mesh shown, for compiling before the drive; `false` puts back what has places. */
    showAll(all: boolean) {
      for (const { meshes, count } of models) for (const mesh of meshes) mesh.visible = all || count > 0;
    },
    dispose() {
      for (const { meshes, model } of models) {
        for (const mesh of meshes) mesh.geometry.dispose();
        model.near.dispose();
        model.far?.dispose();
      }
    },
  };
}
