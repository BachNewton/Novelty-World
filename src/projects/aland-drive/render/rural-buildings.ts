import type { Mesh, Scene } from "three/webgpu";
import { placeModel, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import { BOATHOUSE, buildBoathouse, buildShed, SHED } from "../art/rural/index";
import { PLACE_FLOATS, type TileModels } from "./tile-models";

/*
 * The boathouses and sheds the pipeline placed on real footprints
 * (`pipeline/outbuildings.py`), drawn by the rural kit. Each model is one list of
 * places across every loaded tile, so each model is two draw calls
 * however many tiles are near, and a tile landing or leaving rebuilds only the
 * lists, which are a few floats a place.
 *
 * The pipeline says how big each footprint is; this fits the model to it: the
 * walls to the outline, and the height in proportion to the width, within reason,
 * so a long boathouse stays a boathouse rather than a barn.
 */

/** How far a model is scaled up or down with its footprint's width; the rest is stretch. */
const SCALE_RANGE = [0.85, 1.25] as const;

const MODELS: Record<string, { build: () => RoadsideModel; walls: { x: number; z: number } }> = {
  "shed-red": { build: () => buildShed("red"), walls: SHED },
  "shed-grey": { build: () => buildShed("grey"), walls: SHED },
  "boathouse-red": { build: () => buildBoathouse("red"), walls: BOATHOUSE },
  "boathouse-tarred": { build: () => buildBoathouse("tarred"), walls: BOATHOUSE },
};

function fitted(places: Float32Array, walls: { x: number; z: number }): Placement[] {
  const fits: Placement[] = [];
  for (let at = 0; at < places.length; at += PLACE_FLOATS) {
    const [x, y, z, yaw, width, length] = places.subarray(at, at + PLACE_FLOATS);
    const scale = Math.min(Math.max(width / (2 * walls.x), SCALE_RANGE[0]), SCALE_RANGE[1]);
    fits.push({ x, y, z, yaw, scale, stretch: width / (2 * walls.x * scale), depth: length / (2 * walls.z * scale) });
  }
  return fits;
}

/** A model with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

export function createRuralBuildings(scene: Scene, materials: RoadsideMaterials, reachM: number) {
  const models = Object.entries(MODELS).map(([name, { build, walls }]) => ({ name, model: { ...build(), reachM }, walls, meshes: [] as Mesh[], count: 0 }));
  const tiles = new Map<string, TileModels>();

  const rebuild = (names: Iterable<string>) => {
    for (const entry of models.filter(({ name }) => [...names].includes(name))) {
      for (const mesh of entry.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      const places = [...tiles.values()].flatMap((tile) => Object.entries(tile).flatMap(([name, placed]) => (name === entry.name ? fitted(placed, entry.walls) : [])));
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
