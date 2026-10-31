import type { Group, InstancedMesh, MeshBasicNodeMaterial, Node, Vector3 } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildingMeshes } from "../../render/buildings";
import type { SolidsCell } from "../../render/solids";
import type { World } from "../../sim/world";
import { placed, triangles } from "../landmarks/landmark";
import { addOnMaterial, addOnMeshes, ADD_ON_MODELS, doorFacades, villaAddOns } from "./add-ons";
import { buildChurch } from "./church";
import { CHURCHES } from "./churches";
import IDS from "./facade-ids.json";
import { painter, triangles as count } from "./paint";
import FUEL from "./fuel-stations.json";
import { fuelOrigin, fuelStation, supermarketEntrance, type FuelStation } from "./roadside-shops";

/* What the gallery stands in the real world: add-ons read from the loaded cells, shops' models, and a church on request. */

export interface ModelStage {
  church?: string;
  version?: "near" | "far";
  fuel?: number;
}

export interface ModelHook {
  world: World;
  manifest: { worldOrigin: { east: number; north: number } };
  wallMaterial: MeshBasicNodeMaterial;
  colour: (name: string) => Node<"vec3">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

export interface StagedModels {
  counts: unknown;
  meshes: InstancedMesh[];
}

const inks = (name: string) => `#${themeColor(`--color-aland-drive-${name}`).getHexString()}`;

function cellOf(mesh: { positions: Float32Array; facades: Float32Array; tints: Uint8Array; indices: Uint16Array }, x: number, y: number, z: number, turn = 0): SolidsCell {
  const positions = new Float32Array(mesh.positions.length);
  const [sin, cos] = [Math.sin(turn), Math.cos(turn)];
  for (let at = 0; at < positions.length; at += 3) {
    const [px, py, pz] = [mesh.positions[at], mesh.positions[at + 1], mesh.positions[at + 2]];
    positions[at] = x + px * cos + pz * sin;
    positions[at + 1] = y + py;
    positions[at + 2] = z - px * sin + pz * cos;
  }
  return { x, z, positions, facades: mesh.facades, tints: mesh.tints, indices: mesh.indices };
}

export function placeModels(hook: ModelHook, group: Group, cells: SolidsCell[], stage?: ModelStage): StagedModels {
  const { world, manifest, wallMaterial } = hook;
  const paint = painter(inks);
  const [originEast, originNorth] = [manifest.worldOrigin.east, manifest.worldOrigin.north];
  const heightAt = (east: number, north: number) => world.height(east - originEast, originNorth - north);
  const addCells = (list: SolidsCell[]) => {
    const { group: meshes, cells: shown } = buildingMeshes(list, wallMaterial);
    for (const { mesh } of shown) mesh.visible = true;
    group.add(meshes);
  };

  if (stage?.church) {
    const spec = CHURCHES.find(({ id }) => id === stage.church);
    if (!spec) throw new Error(`no church ${stage.church}`);
    const church = buildChurch(spec, inks, heightAt);
    addCells([placed(church, church[stage.version ?? "near"], manifest.worldOrigin)]);
    return { counts: { id: spec.id, near: triangles(church.near), far: triangles(church.far) }, meshes: [] };
  }
  if (stage?.fuel !== undefined) {
    const station = (FUEL as unknown as FuelStation[])[stage.fuel];
    const { east, north } = fuelOrigin(station);
    addCells([cellOf(fuelStation(paint, station.word, 40, station.bearing), east - originEast, heightAt(east, north), originNorth - north)]);
    return { counts: null, meshes: [] };
  }

  const addOns = villaAddOns(cells);
  const material = addOnMaterial(wallMaterial);
  const meshes = addOnMeshes(addOns, paint, material);
  group.add(...meshes);
  const fronts = doorFacades(cells).filter(({ front }) => front === IDS.fronts.supermarket);
  addCells(fronts.map(({ word, seed, x, y, z, outX, outZ }) => cellOf(supermarketEntrance(paint, IDS.words[word], seed), x, y, z, Math.atan2(outX, outZ))));
  const budgets = Object.fromEntries(Object.entries(ADD_ON_MODELS).map(([kind, build]) => [kind, count(build(paint))]));
  return { counts: { addOns: addOns.length, supermarkets: fronts.length, budgets, fuel: count(fuelStation(paint, "TÄRNAN", 1)), entrance: count(supermarketEntrance(paint, "MATHOLMEN", 1)) }, meshes };
}
