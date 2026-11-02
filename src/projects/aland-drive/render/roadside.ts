import type { Mesh, MeshBasicNodeMaterial, Scene } from "three/webgpu";
import { buildBusShelter, buildMailbox, buildPowerPole, buildStreetLamp, buildWireSpan, placeModel, placeWires, type Placement, type RoadsideMaterials, type RoadsideModel, type SignKit, type WireSpan } from "../art/roadside/index";
import { buildGuardRail, buildGuardRailEnd, buildReflectorPost, type StreetMaterials } from "../art/street/index";
import { ROADSIDE_FLOATS, SIGN_FLOATS, WIRE_FLOATS, type TileRoadside } from "./tile-models";

/*
 * What stands beside the roads (`pipeline/roadside.py`): lamps, power poles and
 * their wires, guard rails, edge posts, mailboxes, bus shelters and signs. As with
 * the rural buildings, each model is one list of places across every loaded tile,
 * so its draws don't grow with the tiles, and a tile landing or leaving rebuilds
 * only the lists it touches, a few floats a place. Every model dissolves at its
 * reach, as the forest does, never growing or shrinking.
 */

type Kit = "roadside" | "street";

const MODELS: Record<string, { build: () => RoadsideModel; kit: Kit }> = {
  lamp: { build: buildStreetLamp, kit: "roadside" },
  pole: { build: buildPowerPole, kit: "roadside" },
  mailbox: { build: buildMailbox, kit: "roadside" },
  "bus-shelter": { build: buildBusShelter, kit: "roadside" },
  rail: { build: buildGuardRail, kit: "street" },
  "rail-end": { build: buildGuardRailEnd, kit: "street" },
  "reflector-post": { build: buildReflectorPost, kit: "street" },
};

/** A list with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };
/** A sign the compile stands in for every plate: the plates share one material, so one compiles them all. */
const COMPILED_SIGN = "give-way";

function placesOf(floats: Float32Array): Placement[] {
  const places: Placement[] = [];
  for (let at = 0; at < floats.length; at += ROADSIDE_FLOATS) {
    const [x, y, z, yaw, stretch, shear] = floats.subarray(at, at + ROADSIDE_FLOATS);
    places.push({ x, y, z, yaw, stretch, shear });
  }
  return places;
}

function postsOf(floats: Float32Array): Placement[] {
  const places: Placement[] = [];
  for (let at = 0; at < floats.length; at += SIGN_FLOATS) {
    const [x, y, z, yaw] = floats.subarray(at, at + SIGN_FLOATS);
    places.push({ x, y, z, yaw });
  }
  return places;
}

function spansOf(floats: Float32Array): WireSpan[] {
  const spans: WireSpan[] = [];
  for (let at = 0; at < floats.length; at += WIRE_FLOATS) {
    const [x, y, z, yaw, toX, toY, toZ, toYaw] = floats.subarray(at, at + WIRE_FLOATS);
    spans.push({ from: { x, y, z, yaw }, to: { x: toX, y: toY, z: toZ, yaw: toYaw } });
  }
  return spans;
}

export interface RoadsideLooks {
  roadside: RoadsideMaterials;
  street: StreetMaterials;
  wires: MeshBasicNodeMaterial;
  signs: SignKit;
}

export function createRoadside(scene: Scene, looks: RoadsideLooks) {
  const models = Object.entries(MODELS).map(([name, { build, kit }]) => ({ name, model: build(), materials: looks[kit], meshes: [] as Mesh[] }));
  const wireModel = buildWireSpan();
  const tiles = new Map<string, TileRoadside>();
  // Every mesh, and whether it has a place to show: one with none stands folded away, there to be compiled.
  const placed = new Map<Mesh, boolean>();
  let wireMeshes: Mesh[] = [];
  let signMeshes: Mesh[] = [];
  let compiling = false;
  let hidden = false;
  const visibility = (mesh: Mesh, shown: boolean) => {
    mesh.visible = compiling || (shown && !hidden);
  };

  const swap = (old: Mesh[], next: Mesh[], shown: boolean) => {
    for (const mesh of old) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      placed.delete(mesh);
    }
    for (const mesh of next) {
      visibility(mesh, shown);
      placed.set(mesh, shown);
      scene.add(mesh);
    }
    return next;
  };

  const rebuildModels = (names: ReadonlySet<string>) => {
    for (const entry of models.filter(({ name }) => names.has(name))) {
      const places = [...tiles.values()].flatMap((tile) => (entry.name in tile.models ? placesOf(tile.models[entry.name]) : []));
      entry.meshes = swap(entry.meshes, placeModel(entry.model, places.length > 0 ? places : [NOWHERE], entry.materials), places.length > 0);
    }
  };

  const rebuildWires = () => {
    const spans = [...tiles.values()].flatMap((tile) => spansOf(tile.wires));
    const nowhere = { x: 0, y: 0, z: 0, yaw: 0 };
    wireMeshes = swap(wireMeshes, [placeWires(wireModel, spans.length > 0 ? spans : [{ from: nowhere, to: nowhere }], looks.wires)], spans.length > 0);
  };

  const rebuildSigns = () => {
    const signs = new Map<string, Placement[]>();
    for (const tile of tiles.values()) {
      for (const [name, floats] of Object.entries(tile.signs)) signs.set(name, [...(signs.get(name) ?? []), ...postsOf(floats)]);
    }
    const shown = signs.size > 0;
    signMeshes = swap(signMeshes, looks.signs.place(shown ? signs : new Map([[COMPILED_SIGN, [NOWHERE]]])), shown);
  };

  const rebuild = (tile: TileRoadside) => {
    rebuildModels(new Set(Object.keys(tile.models)));
    if (tile.wires.length > 0) rebuildWires();
    if (Object.keys(tile.signs).length > 0) rebuildSigns();
  };

  rebuildModels(new Set(Object.keys(MODELS)));
  rebuildWires();
  rebuildSigns();

  return {
    add(tile: string, placed: TileRoadside) {
      for (const name of Object.keys(placed.models)) if (!(name in MODELS)) throw new Error(`${tile} places a roadside model called ${name}, which there isn't`);
      tiles.set(tile, placed);
      rebuild(placed);
    },
    remove(tile: string) {
      const placed = tiles.get(tile);
      if (!placed) throw new Error(`${tile} has no roadside to remove`);
      tiles.delete(tile);
      rebuild(placed);
    },
    /** Every mesh shown, for compiling before the drive; `false` puts back what has places. */
    showAll(all: boolean) {
      compiling = all;
      for (const [mesh, shown] of placed) visibility(mesh, shown);
    },
    /** Shows the roadside or leaves it out, to see what it does. */
    show(shown: boolean) {
      hidden = !shown;
      for (const [mesh, has] of placed) visibility(mesh, has);
    },
    /** How many places each list holds across the loaded tiles, signs as posts. */
    counts() {
      const counted: Record<string, number> = Object.fromEntries(models.map(({ name }) => [name, [...tiles.values()].reduce((sum, tile) => sum + (tile.models[name]?.length ?? 0) / ROADSIDE_FLOATS, 0)]));
      counted.wires = [...tiles.values()].reduce((sum, tile) => sum + tile.wires.length / WIRE_FLOATS, 0);
      counted.signs = [...tiles.values()].reduce((sum, tile) => sum + Object.values(tile.signs).reduce((posts, floats) => posts + floats.length / SIGN_FLOATS, 0), 0);
      return counted;
    },
    dispose() {
      for (const { meshes, model } of models) {
        for (const mesh of meshes) mesh.geometry.dispose();
        model.near.dispose();
        model.far?.dispose();
      }
      for (const mesh of wireMeshes) mesh.geometry.dispose();
      wireModel.near.dispose();
      for (const mesh of signMeshes) mesh.geometry.dispose();
      looks.signs.dispose();
    },
  };
}
