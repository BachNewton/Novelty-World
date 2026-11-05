import type { Mesh, MeshBasicNodeMaterial, Scene } from "three/webgpu";
import { buildBusShelter, buildFarmFence, buildFarmFencePost, buildMailbox, buildPowerPole, buildStreetLamp, buildTownFence, buildTownFencePost, buildWireSpan, placeVersion, placeWires, SWAP_SPREAD, type Placement, type RoadsideMaterials, type RoadsideModel, type SignKit, type WireSpan } from "../art/roadside/index";
import { buildPicnicTable, buildViewingTower, buildViewpointPlatform } from "../art/identity/index";
import { buildBench, buildBikeRack, buildBin, buildCafeSet, buildFlagpole, buildGuardRail, buildGuardRailEnd, buildLinden, buildMidsummerPole, buildParasol, buildPlanter, buildPlanterRound, buildReflectorPost, LINDEN_SEEDS, type StreetMaterials } from "../art/street/index";
import { ROADSIDE_FLOATS, roadsidePlaces, SEAT_FLOATS, SIGN_FLOATS, WIRE_FLOATS, type TileRoadside } from "./tile-models";
import { createTownRoadside, TOWN_MODELS, type TownLooks } from "./town-roadside";

/*
 * What stands beside the roads (`pipeline/roadside.py`): lamps, power poles and
 * their wires, guard rails, edge posts, mailboxes, bus shelters and signs, and the
 * street furniture (`pipeline/furniture.py`): benches, bins, bike racks, café
 * tables and parasols, the town dressing (`pipeline/dressing.py`): lindens, flag
 * and midsummer poles, fences, planters, picnic tables and viewpoints, and the
 * town's lamps, traffic lights and name signs (`town-roadside.ts`). As with
 * the rural buildings, each model is one list of places across every loaded tile,
 * so its draws don't grow with the tiles, and a tile landing or leaving rebuilds
 * only the lists it touches, a few floats a place. Every model dissolves at its
 * reach, as the forest does, never growing or shrinking. A near list holds only the
 * places within its version's range of the camera and a margin, written again when
 * the camera has moved that margin, as the parked cars' are, so a place far off runs
 * no near vertices; the material still chooses each place's version by its own
 * distance, so the list changing shows nothing. A far version is a few triangles,
 * and its list holds every place.
 */

type Kit = "roadside" | "street" | "identity";

const MODELS: Record<string, { build: () => RoadsideModel; kit: Kit }> = {
  lamp: { build: buildStreetLamp, kit: "roadside" },
  pole: { build: buildPowerPole, kit: "roadside" },
  mailbox: { build: buildMailbox, kit: "roadside" },
  "bus-shelter": { build: buildBusShelter, kit: "roadside" },
  rail: { build: buildGuardRail, kit: "street" },
  "rail-end": { build: buildGuardRailEnd, kit: "street" },
  "reflector-post": { build: buildReflectorPost, kit: "street" },
  bench: { build: buildBench, kit: "street" },
  bin: { build: buildBin, kit: "street" },
  "bike-rack": { build: buildBikeRack, kit: "street" },
  "cafe-set": { build: buildCafeSet, kit: "street" },
  parasol: { build: buildParasol, kit: "street" },
  ...Object.fromEntries(LINDEN_SEEDS.map((seed) => [`linden-${seed}`, { build: () => buildLinden(seed), kit: "street" as const }])),
  "flagpole-aland": { build: () => buildFlagpole("aland"), kit: "street" },
  "flagpole-finland": { build: () => buildFlagpole("finland"), kit: "street" },
  "midsummer-pole": { build: buildMidsummerPole, kit: "street" },
  "fence-town": { build: buildTownFence, kit: "roadside" },
  "fence-town-post": { build: buildTownFencePost, kit: "roadside" },
  "fence-farm": { build: buildFarmFence, kit: "roadside" },
  "fence-farm-post": { build: buildFarmFencePost, kit: "roadside" },
  planter: { build: buildPlanter, kit: "street" },
  "planter-round": { build: buildPlanterRound, kit: "street" },
  "picnic-table": { build: buildPicnicTable, kit: "identity" },
  "viewing-tower": { build: buildViewingTower, kit: "identity" },
  "viewpoint-platform": { build: buildViewpointPlatform, kit: "identity" },
};

/** How far the camera moves before the near lists are written again, and how far past its range each holds its places. */
const NEAR_MARGIN_M = 60;
/** A place swaps up to `SWAP_SPREAD` past its model's swap, and the two versions trade pixels up to a tenth past that. */
const PAST_SWAP = (1 + SWAP_SPREAD) * 1.1;
const nearRangeM = (model: RoadsideModel) => (model.far === null ? model.reachM : model.swapM * PAST_SWAP) + NEAR_MARGIN_M;

/** A list with no places keeps one folded to nothing, so its meshes always exist to be compiled before the drive. */
const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };
/** A sign the compile stands in for every plate: the plates share one material, so one compiles them all. */
const COMPILED_SIGN = "give-way";

/** A model's places, each at its own size where the list gives one (a linden by its height). */
function placesOf(floats: Float32Array, scales: Float32Array | undefined): Placement[] {
  return roadsidePlaces(floats).map((place, index) => ({ ...place, scale: scales?.[index] ?? 1 }));
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
  identity: RoadsideMaterials;
  wires: MeshBasicNodeMaterial;
  signs: SignKit;
  town: TownLooks;
}

export function createRoadside(scene: Scene, looks: RoadsideLooks) {
  const models = Object.entries(MODELS).map(([name, { build, kit }]) => ({ name, model: build(), materials: looks[kit], places: [] as Placement[], near: [] as Mesh[], far: [] as Mesh[] }));
  let centre: { x: number; z: number } | null = null;
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

  const refillNear = (entry: (typeof models)[number]) => {
    const range = nearRangeM(entry.model);
    const near = centre === null ? [] : entry.places.filter(({ x, z }) => Math.hypot(x - (centre?.x ?? 0), z - (centre?.z ?? 0)) < range);
    entry.near = swap(entry.near, placeVersion(entry.model, "near", near.length > 0 ? near : [NOWHERE], entry.materials), near.length > 0);
  };

  const rebuildModels = (names: ReadonlySet<string>) => {
    for (const entry of models.filter(({ name }) => names.has(name))) {
      entry.places = [...tiles.values()].flatMap((tile) => (entry.name in tile.models ? placesOf(tile.models[entry.name], tile.scales[entry.name]) : []));
      const shown = entry.places.length > 0;
      entry.far = swap(entry.far, placeVersion(entry.model, "far", shown ? entry.places : [NOWHERE], entry.materials), shown);
      refillNear(entry);
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

  const town = createTownRoadside(looks.town, swap);

  const rebuild = (tile: TileRoadside) => {
    rebuildModels(new Set(Object.keys(tile.models)));
    town.rebuild([...tiles.values()], Object.keys(tile.models));
    if (tile.wires.length > 0) rebuildWires();
    if (Object.keys(tile.signs).length > 0) rebuildSigns();
  };

  rebuildModels(new Set(Object.keys(MODELS)));
  town.rebuild([], TOWN_MODELS);
  rebuildWires();
  rebuildSigns();

  return {
    add(tile: string, lists: TileRoadside) {
      for (const name of Object.keys(lists.models)) if (!(name in MODELS) && !TOWN_MODELS.has(name)) throw new Error(`${tile} places a roadside model called ${name}, which there isn't`);
      tiles.set(tile, lists);
      rebuild(lists);
    },
    remove(tile: string) {
      const lists = tiles.get(tile);
      if (!lists) throw new Error(`${tile} has no roadside to remove`);
      tiles.delete(tile);
      rebuild(lists);
    },
    /** Each frame, before drawing: the near lists follow the camera. */
    update(camera: { x: number; z: number }) {
      if (centre !== null && Math.hypot(camera.x - centre.x, camera.z - centre.z) <= NEAR_MARGIN_M) return;
      centre = { x: camera.x, z: camera.z };
      for (const entry of models) refillNear(entry);
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
    /** How many places each list holds across the loaded tiles, signs as posts, and the seats on the furniture. */
    counts() {
      const counted: Record<string, number> = Object.fromEntries(models.map(({ name }) => [name, [...tiles.values()].reduce((sum, tile) => sum + (name in tile.models ? tile.models[name].length / ROADSIDE_FLOATS : 0), 0)]));
      Object.assign(counted, town.counts([...tiles.values()]));
      counted.wires = [...tiles.values()].reduce((sum, tile) => sum + tile.wires.length / WIRE_FLOATS, 0);
      counted.signs = [...tiles.values()].reduce((sum, tile) => sum + Object.values(tile.signs).reduce((posts, floats) => posts + floats.length / SIGN_FLOATS, 0), 0);
      counted.seats = [...tiles.values()].reduce((sum, tile) => sum + Object.values(tile.seats).reduce((seats, floats) => seats + floats.length / SEAT_FLOATS, 0), 0);
      return counted;
    },
    dispose() {
      for (const { near, far, model } of models) {
        for (const mesh of [...near, ...far]) mesh.geometry.dispose();
        model.near.dispose();
        model.far?.dispose();
      }
      for (const mesh of wireMeshes) mesh.geometry.dispose();
      wireModel.near.dispose();
      for (const mesh of signMeshes) mesh.geometry.dispose();
      looks.signs.dispose();
      town.dispose();
    },
  };
}
