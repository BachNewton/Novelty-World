import type { Mesh, Scene } from "three/webgpu";
import { placeModel, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import type { TileModels } from "./tile-models";

/*
 * Models the pipeline placed in each tile's lists, drawn by the kits. Each model is
 * one list of places across every loaded tile, so it is two draw calls (near and
 * far) however many tiles are near, and a tile landing or leaving rebuilds only the
 * lists of the models it has, which are a few floats a place.
 */

export interface PlacedKind {
  build: () => RoadsideModel;
  materials: RoadsideMaterials;
  /** A tile's places for this model, as the pipeline wrote them, turned into what the kit draws. */
  fit: (places: Float32Array) => Placement[];
}

/** A model with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

export function createPlacedModels(scene: Scene, kinds: Record<string, PlacedKind>, reachM: number, what: string) {
  const models = Object.entries(kinds).map(([name, { build, materials, fit }]) => ({ name, model: { ...build(), reachM }, materials, fit, meshes: [] as Mesh[], count: 0 }));
  const tiles = new Map<string, TileModels>();

  const rebuild = (names: Iterable<string>) => {
    const wanted = new Set(names);
    for (const entry of models.filter(({ name }) => wanted.has(name))) {
      for (const mesh of entry.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      const places = [...tiles.values()].flatMap((tile) => (entry.name in tile ? entry.fit(tile[entry.name]) : []));
      entry.count = places.length;
      entry.meshes = placeModel(entry.model, places.length > 0 ? places : [NOWHERE], entry.materials);
      for (const mesh of entry.meshes) {
        mesh.visible = places.length > 0;
        scene.add(mesh);
      }
    }
  };
  rebuild(Object.keys(kinds));

  return {
    add(tile: string, placed: TileModels) {
      for (const name of Object.keys(placed)) if (!(name in kinds)) throw new Error(`${tile} places ${what} called ${name}, which there isn't`);
      tiles.set(tile, placed);
      rebuild(Object.keys(placed));
    },
    remove(tile: string) {
      const placed = tiles.get(tile);
      if (!placed) throw new Error(`${tile} has no ${what} to remove`);
      tiles.delete(tile);
      rebuild(Object.keys(placed));
    },
    /** How many places each model has across the loaded tiles. */
    counts(): Record<string, number> {
      return Object.fromEntries(models.map(({ name, count }) => [name, count]));
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
