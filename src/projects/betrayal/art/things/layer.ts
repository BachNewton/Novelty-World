import * as THREE from "three";
import { placed, type Layout } from "../../engine/board";
import { CATALOG } from "../../data";
import type { ShownThing } from "../../play/things";
import type { FloorId } from "../../types";
import type { FloorChoice, House } from "../house";
import { tileTurn } from "../house-layout";
import type { TargetPlace } from "../house-targets";
import { inHouse } from "../house-walk";
import { patchProbe, type ProbeUniform } from "../lit-floor";
import { FLOOR_RINGS, TILE } from "../room";
import { group } from "../shapes";
import type { ReadyShaders } from "../shader-prep";
import { disposeTree } from "../stage";
import { cardModel, connectionLook, effectLook, floorMark, MOOD_COLOUR, pileModel, plate, poolGlow, rimGlow, tokenModel, type BuiltEffect } from "./looks";

/*
 * The things living in the house's rooms, drawn over the rooms the house
 * builds: each object on its plate where its cluster puts it, each room
 * effect over its tile, each connection on its wall. Objects are lit from
 * the floor's light probes, as figures are, every frame, so a pass of the
 * bake landing lights them too. Each thing joins the scene only once its
 * shaders are ready (`shader-prep.ts`), as a figure does, so a thing that
 * brings a light of its own never stalls a frame.
 *
 * Each thing is a pointer target too: pointing at it names it, and choosing
 * it reads it. Its target is its own place, a box round it on the screen.
 */

/** How far round a thing a pointer reaches, and how tall it is, in metres: a plate's model, a wall's mark, an effect's middle. */
const REACH: Record<ShownThing["place"]["kind"], { reach: number; height: number }> = {
  floor: { reach: FLOOR_RINGS.plate.radius, height: 0.3 },
  edge: { reach: 0.45, height: 0.5 },
  tile: { reach: 0.35, height: 0.4 },
};

interface Drawn {
  /** What it was built from, to rebuild it when that changes. */
  key: string;
  shown: ShownThing;
  holder: THREE.Group;
  /** An object's probe, lit each frame; null for marks of light. */
  probe: ProbeUniform | null;
  rim: THREE.MeshBasicMaterial | null;
  pool: THREE.MeshBasicMaterial | null;
  effect: BuiltEffect | null;
  /** In the scene: its shaders are ready. */
  joined: boolean;
}

const keyOf = (shown: ShownThing) => JSON.stringify(shown);

/** Builds a thing in its room's own frame, rotated as its room is turned by the holder. */
function build(shown: ShownThing): Pick<Drawn, "probe" | "rim" | "pool" | "effect"> & { object: THREE.Object3D } {
  const colour = MOOD_COLOUR[shown.mood];
  if (shown.kind === "effect") {
    const effect = effectLook(shown.token, colour);
    return { object: effect.object, probe: null, rim: null, pool: null, effect };
  }
  if (shown.place.kind === "edge") return { object: connectionLook(shown.token, colour, shown.place.spot), probe: null, rim: null, pool: null, effect: null };
  if (shown.kind === "connection") return { object: floorMark(colour), probe: null, rim: null, pool: null, effect: null };
  const { object: base, rim, pool } = plate(colour);
  const model = shown.things.length > 1 ? pileModel() : shown.card !== null && shown.token === null ? cardModel(shown.card, CATALOG.cards[shown.card].type).floor() : tokenModel().floor();
  return { object: group(base, model), probe: patchProbe(model, false), rim, pool, effect: null };
}

export function createThingsLayer() {
  const root = group();
  root.name = "things";
  const drawn = new Map<string, Drawn>();
  let layout: Layout = { tiles: [] };
  let wanted: readonly ShownThing[] = [];
  let focused: string | null = null;
  let ready: ReadyShaders | null = null;
  const point = new THREE.Vector3();

  const tileFloor = (room: string): FloorId | null => placed(layout, room)?.floor ?? null;

  const drop = (id: string) => {
    const thing = drawn.get(id);
    if (!thing) return;
    thing.holder.removeFromParent();
    disposeTree(thing.holder);
    drawn.delete(id);
  };

  /** Draws what is wanted: a thing new or changed is built and joins once its shaders are ready; one gone goes. */
  const sync = () => {
    if (ready === null) return;
    const readying = ready;
    const ids = new Set(wanted.map((shown) => shown.id));
    for (const id of [...drawn.keys()]) if (!ids.has(id)) drop(id);
    for (const shown of wanted) {
      const key = keyOf(shown);
      if (drawn.get(shown.id)?.key === key) continue;
      drop(shown.id);
      // A room not in the house yet (still being placed) waits for the next layout.
      if (!placed(layout, shown.room)) continue;
      const made = build(shown);
      if (shown.place.kind === "floor") made.object.position.set(shown.place.at[0], 0, shown.place.at[1]);
      const holder = group(made.object);
      holder.visible = false;
      const thing: Drawn = { key, shown, holder, probe: made.probe, rim: made.rim, pool: made.pool, effect: made.effect, joined: false };
      drawn.set(shown.id, thing);
      void readying(holder).then(() => {
        if (drawn.get(shown.id) !== thing) return;
        thing.joined = true;
        root.add(holder);
      });
    }
  };

  /** Where a thing's middle is in the house, on the floor, in the room's own frame. */
  const roomPoint = (shown: ShownThing): readonly [number, number] => {
    switch (shown.place.kind) {
      case "floor":
        return shown.place.at;
      case "tile":
        return [0, 0];
      case "edge": {
        const { edge, along } = shown.place.spot;
        const inward = TILE / 2 - 0.6;
        const at: Record<typeof edge, [number, number]> = { top: [along, -inward], right: [inward, along], bottom: [-along, inward], left: [-inward, -along] };
        return at[edge];
      }
    }
  };

  return {
    root,
    /** Starts drawing, readying each thing's shaders for the scene before it joins. */
    mount: (readyShaders: ReadyShaders) => {
      ready = readyShaders;
      sync();
    },
    unmount: () => {
      for (const id of [...drawn.keys()]) drop(id);
      ready = null;
    },
    set: (next: readonly ShownThing[], house: Layout) => {
      wanted = next;
      layout = house;
      sync();
    },
    setLayout: (house: Layout) => {
      layout = house;
      sync();
    },
    focus: (id: string | null) => {
      focused = id;
    },
    has: (id: string) => wanted.some((shown) => shown.id === id),
    /** Stands each thing in its room, as the room is turned and its floor stacked, shows it on the floor showing, and lights each object from its probe. */
    update: (house: House, seconds: number, showing: FloorChoice) => {
      for (const thing of drawn.values()) {
        const { shown, holder } = thing;
        const tile = placed(layout, shown.room);
        if (!tile || !thing.joined) continue;
        const at = house.scenePoint(inHouse(layout, shown.room, [0, 0, 0]));
        holder.position.copy(at);
        holder.rotation.y = tileTurn(tile.rotation);
        holder.visible = showing === "all" || showing === tile.floor;
        thing.effect?.update(seconds);
        if (thing.rim) thing.rim.opacity = rimGlow(shown.id === focused);
        if (thing.pool) thing.pool.opacity = poolGlow(shown.id === focused);
        if (thing.probe && holder.visible) {
          const [x, z] = roomPoint(shown);
          const middle = inHouse(layout, shown.room, [x, 0.1, z]);
          house.lighting.get(tile.floor)?.probeAt(point.set(middle.x, middle.y, middle.z), thing.probe.value);
        }
      }
    },
    /** Each thing as a pointer target: round its middle, on the floor it lies on, null where that floor doesn't show. */
    places: (scenePoint: House["scenePoint"], showing: FloorChoice): { id: string; place: TargetPlace }[] =>
      wanted.flatMap((shown) => {
        const floor = tileFloor(shown.room);
        const tile = placed(layout, shown.room);
        if (floor === null || !tile) return [];
        const [x, z] = roomPoint(shown);
        const base = scenePoint(inHouse(layout, shown.room, [x, 0, z]));
        const { reach, height } = REACH[shown.place.kind];
        const shows = showing === "all" || showing === floor;
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].flatMap(([dx, dz]) => {
          const corner = base.clone().add(new THREE.Vector3(dx * reach, 0, dz * reach));
          return [corner, corner.clone().setY(corner.y + height)];
        });
        const place: TargetPlace = {
          anchor: base.clone().setY(base.y + height / 2),
          outline: shows ? corners : null,
          box: true,
          mark: null,
          cell: { floor, x: tile.x, y: tile.y },
          floor,
        };
        return [{ id: shown.id, place }];
      }),
    /** Where a thing is in the scene, `height` over its floor, or null where it isn't in the house. */
    pointOf: (id: string, scenePoint: House["scenePoint"], height: number): THREE.Vector3 | null => {
      const shown = wanted.find((candidate) => candidate.id === id);
      if (!shown || !placed(layout, shown.room)) return null;
      const [x, z] = roomPoint(shown);
      return scenePoint(inHouse(layout, shown.room, [x, height, z]));
    },
    floorOf: (id: string): FloorId | null => {
      const shown = wanted.find((candidate) => candidate.id === id);
      return shown ? tileFloor(shown.room) : null;
    },
  };
}

export type ThingsLayer = ReturnType<typeof createThingsLayer>;
