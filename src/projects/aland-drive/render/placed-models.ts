import type { Mesh, Scene } from "three/webgpu";
import { farRangeM, nearRangeM, placeVersion, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import type { SeasonLook } from "../art/season";
import type { InSeason } from "../climate/placed-season";
import { inSeasonMaterials, markInSeason } from "./in-season";
import type { TileModels } from "./tile-models";

/*
 * Models the pipeline placed in each tile's lists, drawn by the kits. Each model is
 * one list of places across every loaded tile, so it is two draw calls (near and
 * far) however many tiles are near, and a tile landing or leaving rebuilds only the
 * lists of the models it has, which are a few floats a place. A kind out only in
 * its season (`climate/placed-season.ts`) draws through a copy of its kit's materials that
 * folds each place away on its own threshold, so the season rebuilds nothing: one copy a kit,
 * which every kind of that kit draws through, each mesh marked with its kind.
 *
 * Each list holds only the places within its version's range of the camera and a margin,
 * written again when the camera has moved that margin, as the roadside's and the parked
 * cars' are: a place past its version's range folds to nothing in the shader anyway, but
 * still ran its vertices, and a marina's berthed boats ran more of them than anything else
 * drawn. The material still picks each place's version by its own distance, so a list
 * changing shows nothing.
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

/** How far the camera moves before the near lists are written again, and how far past their range they hold places. */
const NEAR_MARGIN_M = 60;
/** The same for the far lists, which hold more places and whose versions reach further. */
const FAR_MARGIN_M = 250;

/** A model with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

export function createPlacedModels(scene: Scene, kinds: Record<string, PlacedKind>, reachM: number, what: string, season?: SeasonLook) {
  // One copy of a kit's materials that follows the season, for every kind of a kit any of whose kinds does.
  const seasonalKits = new Set(Object.values(kinds).flatMap(({ materials, inSeason }) => (inSeason === undefined ? [] : [materials])));
  const copies = new Map<RoadsideMaterials, RoadsideMaterials>();
  const materialsOf = (materials: RoadsideMaterials) => {
    if (season === undefined || !seasonalKits.has(materials)) return materials;
    const copy = copies.get(materials) ?? inSeasonMaterials(materials, season);
    copies.set(materials, copy);
    return copy;
  };
  const models = Object.entries(kinds).map(([name, { build, materials, fit, ownReach = false, inSeason }]) => {
    const built = build();
    return { name, model: ownReach ? built : { ...built, reachM }, materials: materialsOf(materials), inSeason, fit, places: [] as Placement[], near: [] as Mesh[], far: [] as Mesh[] };
  });
  const tiles = new Map<string, TileModels>();
  /** Every mesh in the scene, and whether it has places to show. */
  const placed = new Map<Mesh, boolean>();
  let compiling = false;
  const centres: Record<"near" | "far", { x: number; z: number } | null> = { near: null, far: null };

  const swap = (old: Mesh[], next: Mesh[], shown: boolean) => {
    for (const mesh of old) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      placed.delete(mesh);
    }
    for (const mesh of next) {
      mesh.visible = compiling || shown;
      placed.set(mesh, shown);
      scene.add(mesh);
    }
    return next;
  };
  const refill = (entry: (typeof models)[number], version: "near" | "far") => {
    const centre = centres[version];
    const range = version === "near" ? nearRangeM(entry.model, NEAR_MARGIN_M) : farRangeM(entry.model, FAR_MARGIN_M);
    const within = centre === null ? entry.places : entry.places.filter(({ x, z }) => Math.hypot(x - centre.x, z - centre.z) < range);
    entry[version] = swap(entry[version], markInSeason(placeVersion(entry.model, version, within.length > 0 ? within : [NOWHERE], entry.materials), entry.inSeason), within.length > 0);
  };

  const rebuild = (names: Iterable<string>) => {
    const wanted = new Set(names);
    for (const entry of models.filter(({ name }) => wanted.has(name))) {
      entry.places = [...tiles.values()].flatMap((tile) => (entry.name in tile ? entry.fit(tile[entry.name]) : []));
      refill(entry, "far");
      refill(entry, "near");
    }
  };
  rebuild(Object.keys(kinds));

  return {
    add(tile: string, placedHere: TileModels) {
      for (const name of Object.keys(placedHere)) if (!(name in kinds)) throw new Error(`${tile} places ${what} called ${name}, which there isn't`);
      tiles.set(tile, placedHere);
      rebuild(Object.keys(placedHere));
    },
    remove(tile: string) {
      const placedHere = tiles.get(tile);
      if (!placedHere) throw new Error(`${tile} has no ${what} to remove`);
      tiles.delete(tile);
      rebuild(Object.keys(placedHere));
    },
    /** Each frame, before drawing: the lists follow the camera. */
    follow(camera: { x: number; z: number }) {
      for (const version of ["near", "far"] as const) {
        const centre = centres[version];
        if (centre !== null && Math.hypot(camera.x - centre.x, camera.z - centre.z) <= (version === "near" ? NEAR_MARGIN_M : FAR_MARGIN_M)) continue;
        centres[version] = { x: camera.x, z: camera.z };
        for (const entry of models) refill(entry, version);
      }
    },
    /** How many places each model has across the loaded tiles. */
    counts(): Record<string, number> {
      return Object.fromEntries(models.map(({ name, places }) => [name, places.length]));
    },
    /** Every mesh shown, for compiling before the drive; `false` puts back what has places. */
    showAll(all: boolean) {
      compiling = all;
      for (const [mesh, shown] of placed) mesh.visible = all || shown;
    },
    dispose() {
      for (const { near, far, model } of models) {
        for (const mesh of [...near, ...far]) mesh.geometry.dispose();
        model.near.dispose();
        model.far?.dispose();
      }
      for (const { near, far } of copies.values()) {
        near.dispose();
        far.dispose();
      }
    },
  };
}
