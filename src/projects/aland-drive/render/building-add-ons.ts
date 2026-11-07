import type { Mesh, MeshBasicNodeMaterial, Scene } from "three/webgpu";
import type { AddOn } from "../art/facades/add-on-places";
import { addOnLists } from "../art/facades/add-ons";
import IDS from "../art/facades/facade-ids.json";
import { painter, type Inks } from "../art/facades/paint";
import { fuelStation, supermarketEntrance } from "../art/facades/roadside-shops";
import type { LandmarkMesh } from "../art/landmarks/kit";
import { FUEL_SITE_PREFIX, FUEL_STATIONS, TERMINAL_SITE } from "../art/landmarks/sites";
import { placeModel, type Placement } from "../art/roadside/material";
import { buildTerminal, type TownMaterials } from "../art/town-kit/index";
import type { SolidsCell } from "./solids";
import type { TileAddOns } from "./tile-add-ons";

/*
 * What stands at a building and isn't the building, for each tile with detail (`render/tile-add-ons.ts` places it in
 * the worker):
 *
 * - The villas' porches, verandas, bays and frontons: one instanced list per kind across every loaded tile, so four
 *   draws however many tiles are near, each folding flat on its wall with distance and gone with its building. The lists
 *   are made once and rewritten as tiles come and go, since a list made anew compiles its pipeline in that frame.
 * - The supermarkets' entrances and the fuel stations: wall-format meshes, so they join the tile's building cells as
 *   cells of their own beside the cell they stand in, shown and hidden with it.
 * - The Västerhamn terminal: the town kit's model, at its place, while its tile has detail.
 */

/** A placement for a list with no one in it, so its meshes exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };

/** A cell for every building cell that has shops beside it: their meshes merged, in the scene, under that cell's middle. */
function shopCells(cells: SolidsCell[], shops: { mesh: LandmarkMesh; x: number; y: number; z: number; yaw: number }[]): SolidsCell[] {
  const byCell = new Map<SolidsCell, LandmarkMesh[]>();
  for (const { mesh, x, y, z, yaw } of shops) {
    const home = cells.reduce<SolidsCell | null>((best, cell) => (best === null || Math.hypot(cell.x - x, cell.z - z) < Math.hypot(best.x - x, best.z - z) ? cell : best), null);
    if (home === null) continue;
    const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
    const positions = new Float32Array(mesh.positions.length);
    for (let at = 0; at < positions.length; at += 3) {
      const [px, py, pz] = mesh.positions.subarray(at, at + 3);
      positions.set([x + px * cos + pz * sin, y + py, z - px * sin + pz * cos], at);
    }
    byCell.set(home, [...(byCell.get(home) ?? []), { ...mesh, positions }]);
  }
  return [...byCell].map(([{ x, z }, meshes]) => {
    const vertices = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
    const [positions, facades, tints] = [new Float32Array(vertices * 3), new Float32Array(vertices * 4), new Uint8Array(vertices * 4)];
    const indices = new Uint16Array(meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0));
    let [vertex, index] = [0, 0];
    for (const mesh of meshes) {
      positions.set(mesh.positions, vertex * 3);
      facades.set(mesh.facades, vertex * 4);
      tints.set(mesh.tints, vertex * 4);
      indices.set(mesh.indices.map((at) => at + vertex), index);
      vertex += mesh.positions.length / 3;
      index += mesh.indices.length;
    }
    return { x, z, positions, facades, tints, indices };
  });
}

export function createBuildingAddOns(scene: Scene, wallMaterial: MeshBasicNodeMaterial, town: TownMaterials, inks: Inks) {
  const paint = painter(inks);
  const terminal = buildTerminal();
  const tiles = new Map<string, TileAddOns>();
  const villas = addOnLists(paint, wallMaterial);
  scene.add(...villas.meshes);
  let terminalMeshes: Mesh[] = [];
  let compiling = false;

  const swap = <T extends Mesh>(old: T[], next: T[], shown: boolean): T[] => {
    for (const mesh of old) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const mesh of next) {
      mesh.visible = compiling || shown;
      mesh.userData.placed = shown;
      scene.add(mesh);
    }
    return next;
  };

  const rebuild = () => {
    const placed: AddOn[] = [...tiles.values()].flatMap((tile) => tile.villas);
    villas.place(placed);
    for (const mesh of villas.meshes) {
      mesh.visible = compiling || placed.length > 0;
      mesh.userData.placed = placed.length > 0;
    }
    const terminals = [...tiles.values()].flatMap((tile) => tile.nearSites.filter(({ model }) => model === TERMINAL_SITE));
    terminalMeshes = swap(terminalMeshes, placeModel(terminal, terminals.length > 0 ? terminals : [NOWHERE], town), terminals.length > 0);
  };
  rebuild();

  return {
    /** The tile's building cells with its entrances and stations beside them, to be drawn with its buildings. */
    withShops(cells: SolidsCell[], { entrances, nearSites }: TileAddOns): SolidsCell[] {
      const shops = [
        ...entrances.map(({ x, y, z, yaw, word, seed, pylon }) => ({ mesh: supermarketEntrance(paint, IDS.words[word], seed, pylon), x, y, z, yaw })),
        ...nearSites.flatMap(({ model, x, y, z, yaw }) => {
          if (!model.startsWith(FUEL_SITE_PREFIX)) return [];
          const station = FUEL_STATIONS.get(model);
          if (!station) throw new Error(`no fuel station ${model}`);
          return [{ mesh: fuelStation(paint, station), x, y, z, yaw }];
        }),
      ];
      return [...cells, ...shopCells(cells, shops)];
    },
    add(tile: string, addOns: TileAddOns) {
      tiles.set(tile, addOns);
      if (addOns.villas.length > 0 || addOns.nearSites.length > 0) rebuild();
    },
    remove(tile: string) {
      const addOns = tiles.get(tile);
      if (!addOns) throw new Error(`${tile} has no add-ons to remove`);
      tiles.delete(tile);
      if (addOns.villas.length > 0 || addOns.nearSites.length > 0) rebuild();
    },
    /** Every mesh shown, for compiling before the drive; `false` puts back what has places. */
    showAll(all: boolean) {
      compiling = all;
      for (const mesh of [...villas.meshes, ...terminalMeshes]) mesh.visible = all || (mesh.userData.placed as boolean);
    },
    counts() {
      const loaded = [...tiles.values()];
      return { villas: loaded.reduce((sum, tile) => sum + tile.villas.length, 0), entrances: loaded.reduce((sum, tile) => sum + tile.entrances.length, 0), nearSites: loaded.reduce((sum, tile) => sum + tile.nearSites.length, 0) };
    },
    dispose() {
      for (const mesh of villas.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      swap(terminalMeshes, [], false);
    },
  };
}
