import type { Mesh, Scene } from "three/webgpu";
import { placeModel, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import type { SeasonLook } from "../art/season";
import type { InSeason } from "../climate/placed-season";
import { inSeasonMaterials } from "./in-season";
import type { TileModels } from "./tile-models";

/*
 * Models the pipeline placed in each tile's lists, drawn by the kits. Each model is
 * one list of places across every loaded tile, so it is two draw calls (near and
 * far) however many tiles are near, and a tile landing or leaving rebuilds only the
 * lists of the models it has, which are a few floats a place. A kind out only in
 * its season (`climate/placed-season.ts`) draws through a copy of its kit's materials that
 * folds each place away on its own threshold, so the season rebuilds nothing.
 */

export interface PlacedKind {
  build: () => RoadsideModel;
  materials: RoadsideMaterials;
  /** A tile's places for this model, as the pipeline wrote them, turned into what the kit draws. */
  fit: (places: Float32Array) => Placement[];
  /** Keep the kit's own reach rather than the one every model here shares. */
  ownReach?: boolean;
  /** Out only in its season, each place on its own threshold. */
  inSeason?: InSeason;
}

/** A model with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

export function createPlacedModels(scene: Scene, kinds: Record<string, PlacedKind>, reachM: number, what: string, season?: SeasonLook) {
  // One copy of a kit's materials for each way of following the season, shared by every kind that follows it so.
  const seasonal = new Map<RoadsideMaterials, Map<InSeason, RoadsideMaterials>>();
  const materialsOf = (materials: RoadsideMaterials, inSeason: InSeason | undefined) => {
    if (inSeason === undefined || season === undefined) return materials;
    const copies = seasonal.get(materials) ?? new Map<InSeason, RoadsideMaterials>();
    seasonal.set(materials, copies);
    const copy = copies.get(inSeason) ?? inSeasonMaterials(materials, season, inSeason);
    copies.set(inSeason, copy);
    return copy;
  };
  const models = Object.entries(kinds).map(([name, { build, materials, fit, ownReach = false, inSeason }]) => {
    const built = build();
    return { name, model: ownReach ? built : { ...built, reachM }, materials: materialsOf(materials, inSeason), fit, meshes: [] as Mesh[], count: 0 };
  });
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
      for (const copies of seasonal.values()) {
        for (const { near, far } of copies.values()) {
          near.dispose();
          far.dispose();
        }
      }
    },
  };
}
