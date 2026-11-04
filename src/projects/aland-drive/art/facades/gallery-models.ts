import type { Group, InstancedMesh, MeshBasicNodeMaterial, Node, Vector3 } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildingMeshes } from "../../render/buildings";
import type { SolidsCell } from "../../render/solids";
import type { World } from "../../sim/world";
import { placed, triangles } from "../landmarks/landmark";
import { doorFacades, supermarketEntrances, villaAddOns } from "./add-on-places";
import { ADD_ON_MODELS } from "./add-ons";
import { buildChurch } from "./church";
import { CHURCHES } from "./churches";
import { painter, triangles as count } from "./paint";
import FUEL from "./fuel-stations.json";
import { fuelStation, supermarketEntrance, type FuelStation } from "./roadside-shops";

/* What the gallery stands in the real world: a church on request. The add-ons, entrances and fuel stations are the game's own. */

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

export function placeModels(hook: ModelHook, group: Group, cells: SolidsCell[], stage?: ModelStage): StagedModels {
  const { world, manifest, wallMaterial } = hook;
  const paint = painter(inks);
  const heightAt = (east: number, north: number) => world.height(east - manifest.worldOrigin.east, manifest.worldOrigin.north - north);

  if (stage?.church) {
    const spec = CHURCHES.find(({ id }) => id === stage.church);
    if (!spec) throw new Error(`no church ${stage.church}`);
    const church = buildChurch(spec, inks, heightAt);
    const { group: meshes, cells: shown } = buildingMeshes([placed(church, church[stage.version ?? "near"], manifest.worldOrigin)], wallMaterial);
    for (const { mesh } of shown) mesh.visible = true;
    group.add(meshes);
    return { counts: { id: spec.id, near: triangles(church.near), far: triangles(church.far) }, meshes: [] };
  }
  // The game stands the add-ons, the entrances and the stations itself (`render/building-add-ons.ts`): a fuel stage is only its look.
  const doors = doorFacades(cells);
  const budgets = Object.fromEntries(Object.entries(ADD_ON_MODELS).map(([kind, build]) => [kind, count(build(paint))]));
  const stations = FUEL as unknown as FuelStation[];
  return {
    counts: { addOns: villaAddOns(doors).length, supermarkets: supermarketEntrances(doors).length, budgets, fuel: stations.map((station) => count(fuelStation(paint, station))), entrance: count(supermarketEntrance(paint, "MATHOLMEN", 1)) },
    meshes: [],
  };
}
