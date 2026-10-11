import type { Edge } from "../types";
import { definition } from "./house";
import { checkFloor, floorGrid, type FloorPlan } from "./overlap";
import type { FloorReply } from "./room-floor.worker";
import type { PlacementHints, RoomFloors } from "./placement";
import { BASE_RADIUS, DOOR_APPROACH, DOOR_WIDTH, onSide, primePlaces, TILE, type RoomDefinition, type Stroke } from "./room";
import { roomTile } from "./stage";

/*
 * A room's floor as figures stand and walk on it: the floor plan the overlap
 * check reads off the built room, and what the placement solver is told
 * about it. A room's floor depends only on its art, so it is read once, in a
 * worker, as rooms come into the house.
 */

/** How far either side of a walking lane no figure stands while the room has
 *  room: a walker's base on the lane passes a standing base without touching. */
const LANE_CLEAR = 2 * BASE_RADIUS;

/** A doorway's lane: from the tile's edge to the end of its approach, as wide as the door with a base each side. */
function doorway(edge: Edge): Stroke {
  const point = (into: number): [number, number] => {
    const at = TILE / 2 - into;
    return edge === "top" ? [0, -at] : edge === "bottom" ? [0, at] : edge === "left" ? [-at, 0] : [at, 0];
  };
  return { from: point(0), to: point(DOOR_APPROACH), radius: DOOR_WIDTH / 2 + BASE_RADIUS };
}

/** What a room tells the placement solver about one side of it (null for the
 *  whole of a room with no barrier): its prime place there, its doorways and
 *  the areas it keeps clear, its lanes, and in a barrier room the half the
 *  side's figures stand in. */
export function placementHints(def: RoomDefinition, side: Edge | null): PlacementHints {
  const tile = roomTile(def.id);
  const doorways = [...tile.doors.filter((edge) => edge !== tile.frontDoor), ...tile.passages].map(doorway);
  const lanes = (def.lanes ?? []).flatMap((lane) => lane.slice(1).map((to, i): Stroke => ({ from: lane[i], to, radius: LANE_CLEAR })));
  const prime = primePlaces(def).find(([x, z]) => onSide(side, x, z)) ?? null;
  return { prime, keepClear: [...doorways, ...(def.keepClear ?? [])], lanes, within: side === null ? null : (x, z) => onSide(side, x, z) };
}

const floors = new Map<string, FloorPlan>();
const loading = new Map<string, Promise<void>>();
let worker: Worker | null = null;
const replies = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

/** The worker that reads floor plans, started the first time one is asked for. */
function floorWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./room-floor.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<FloorReply>) => {
    const reply = replies.get(data.room);
    if (!reply) throw new Error(`The floor worker answered for ${data.room}, which nobody asked for`);
    replies.delete(data.room);
    if ("error" in data) {
      reply.reject(new Error(`Reading the floor of ${data.room} failed in a worker: ${data.error}`));
      return;
    }
    floors.set(data.room, { ...floorGrid(), blocked: data.blocked, clearance: data.clearance, reached: data.reached });
    reply.resolve();
  };
  // A worker that fails to start (or throws outside a reply) fails every room it was asked for, loudly.
  worker.onerror = (event) => {
    const error = new Error(`The floor worker failed: ${event.message} (${event.filename}:${event.lineno})`);
    for (const reply of replies.values()) reply.reject(error);
    replies.clear();
  };
  return worker;
}

/** Reads the floors of rooms in the house off the main thread, each once:
 *  null when every one is read already, or a promise of when they are. */
export function loadFloors(rooms: readonly string[]): Promise<void> | null {
  const missing = [...new Set(rooms)].filter((room) => !floors.has(room));
  if (missing.length === 0) return null;
  return Promise.all(
    missing.map((room) => {
      let load = loading.get(room);
      if (!load) {
        load = new Promise<void>((resolve, reject) => {
          replies.set(room, { resolve, reject });
          floorWorker().postMessage(room);
        });
        loading.set(room, load);
      }
      return load;
    }),
  ).then(() => undefined);
}

/** Whether a room's floor plan has been read. */
export const floorRead = (room: string) => floors.has(room);

/** A room's floor plan, read already by `loadFloors` (or `roomFloor`). */
export function readFloor(room: string): FloorPlan {
  const floor = floors.get(room);
  if (!floor) throw new Error(`The floor of ${room} hasn't been read: load it (\`loadFloors\`) before placing or walking figures there`);
  return floor;
}

/** A room's floor plan, read on the spot the first time it is asked for: for
 *  the bench and the house demo only, since reading a busy room's floor holds
 *  the main thread for hundreds of milliseconds. The game reads floors with `loadFloors`. */
export function roomFloor(room: string): FloorPlan {
  if (!floors.has(room)) floors.set(room, checkFloor(definition(room)).plan);
  return readFloor(room);
}

/** Each room's floor in the house, once read, for placing figures and walking them round each other. */
export const houseFloors: RoomFloors = (room, side) => ({ floor: readFloor(room), hints: placementHints(definition(room), side) });
