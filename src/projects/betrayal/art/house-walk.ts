import * as THREE from "three";
import { EDGES, neighbourCell, placed, type Layout } from "../engine/board";
import type { FloorId, PlacedTile } from "../types";
import { ADULT_WALK, stepLength, type Pace, type Stride } from "./explorers/figure";
import { DIRECTION, tileTurn } from "./house-layout";
import { DOOR_APPROACH, TILE, waypoints, type RoomPoint, type RoomWays } from "./room";

/*
 * How explorers get where they go, as pure functions of the engine's board:
 * the path a walk takes through the doorway centres and up or down the
 * stairs, posed along its length by the stage's clock. Where a move can go
 * is the engine's to say (`play/lookahead.ts`).
 */

/** A point in the house: on a floor, in metres, `y` measured up from that floor. */
export interface HousePoint {
  floor: FloorId;
  x: number;
  y: number;
  z: number;
}

/** A room a move goes to, and the rooms it walks through to get there. */
export interface Reach {
  room: string;
  /** Every room walked through, from where the move starts to `room`. */
  route: string[];
}

function tileOf(layout: Layout, room: string): PlacedTile {
  const tile = placed(layout, room);
  if (!tile) throw new Error(`${room} is not in the house`);
  return tile;
}

/** A point in a room's own frame (as its art is built: centred, unturned), placed in the house. */
export function inHouse(layout: Layout, room: string, [x, y, z]: readonly [number, number, number]): HousePoint {
  const tile = tileOf(layout, room);
  const turn = tileTurn(tile.rotation);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { floor: tile.floor, x: tile.x * TILE + x * cos + z * sin, y, z: tile.y * TILE - x * sin + z * cos };
}

/** A point in the house in a room's own frame: `inHouse` undone. */
export function inRoom(layout: Layout, room: string, point: HousePoint): RoomPoint {
  const tile = tileOf(layout, room);
  const turn = tileTurn(tile.rotation);
  const [dx, dz] = [point.x - tile.x * TILE, point.z - tile.y * TILE];
  return [dx * Math.cos(turn) - dz * Math.sin(turn), point.y, dx * Math.sin(turn) + dz * Math.cos(turn)];
}

/** The path a fixed link (a stair) takes out of a room towards the room it
 *  links to: from the room's floor to where it leaves the room, in room metres. */
export type Stairway = (room: string, toward: string) => readonly (readonly [number, number, number])[] | undefined;

/** How a choice shows on a floor: as its own room, as the stair that leads
 *  straight to it from a room on that floor, or (null) not at all, so it is
 *  reached by changing floor. "all" shows every floor at once. */
export type Shown = { room: string } | { stairFrom: string } | null;

export function shownOn(layout: Layout, reach: Reach, floor: FloorId | "all", stairway: Stairway): Shown {
  const floorOf = (room: string) => tileOf(layout, room).floor;
  if (floor === "all" || floorOf(reach.room) === floor) return { room: reach.room };
  const from = reach.route.at(-2);
  return from !== undefined && floorOf(from) === floor && stairway(from, reach.room) ? { stairFrom: from } : null;
}

/**
 * The path of a walk along a route: from `from`, through the centre of each
 * doorway between rooms on one floor, or along the stairway out of one room
 * and back down the other's into it where a fixed link joins them, to `to`.
 * Across each room it keeps to the room's ways (`waypoints`): its lanes, and
 * a barrier room's crossing. Where it changes floor, two points in a row lie
 * on different floors.
 */
export function walkPath(layout: Layout, route: readonly string[], from: HousePoint, to: HousePoint, ways: (room: string) => RoomWays): HousePoint[] {
  const path: HousePoint[] = [];
  /** Walks across `room` from `a` to just short of `b`. */
  const across = (room: string, a: HousePoint, b: HousePoint) => {
    path.push(a, ...waypoints(ways(room), inRoom(layout, room, a), inRoom(layout, room, b)).map((point) => inHouse(layout, room, point)));
  };
  let entered = from;
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const tileA = tileOf(layout, a);
    const tileB = tileOf(layout, b);
    const direction =
      tileA.floor === tileB.floor ? EDGES.find((edge) => {
        const cell = neighbourCell(tileA, edge);
        return cell.x === tileB.x && cell.y === tileB.y;
      }) : undefined;
    if (direction) {
      const { x: dx, z: dz } = DIRECTION[direction];
      const centre = { x: tileA.x * TILE, z: tileA.y * TILE };
      const at = (metres: number): HousePoint => ({ floor: tileA.floor, x: centre.x + dx * metres, y: 0, z: centre.z + dz * metres });
      const approach = at(TILE / 2 - DOOR_APPROACH);
      across(a, entered, approach);
      path.push(approach, at(TILE / 2));
      entered = at(TILE / 2 + DOOR_APPROACH);
      continue;
    }
    const up = ways(a).stairs?.[b];
    const down = ways(b).stairs?.[a];
    if (!up || !down) throw new Error(`No stairway joins ${a} and ${b}`);
    const [foot, ...climb] = up.map((point) => inHouse(layout, a, point));
    across(a, entered, foot);
    const descent = [...down].reverse().map((point) => inHouse(layout, b, point));
    path.push(foot, ...climb, ...descent.slice(0, -1));
    entered = descent[descent.length - 1];
  }
  across(route[route.length - 1], entered, to);
  path.push(to);
  return path;
}

/** Walking pace, in metres a second along the path: slow enough to follow.
 *  Every figure keeps it, so a turn takes as long whoever walks; a figure's
 *  own step sets its cadence. */
export const WALK_SPEED = 1.5;
/** Running pace, shared by every figure as the walking pace is. */
export const RUN_SPEED = 3.6;
/** Metres over which a walker gets into its stride, and out of it. */
const EASE = 0.5;
/** How far either side of the walker its heading looks, so it turns through
 *  a corner rather than snapping. */
const LOOK = 0.3;

export interface Walk {
  path: HousePoint[];
  /** When the walk began, on the stage's clock. */
  start: number;
  /** Walked unless it says otherwise. */
  pace?: Pace;
}

/** The length of each leg of a path; a change of floor has none. */
function legs(path: readonly HousePoint[]): number[] {
  return path.slice(1).map((b, i) => {
    const a = path[i];
    return a.floor === b.floor ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 0;
  });
}

export function walkLength(path: readonly HousePoint[]): number {
  return legs(path).reduce((sum, leg) => sum + leg, 0);
}

/** The point `distance` metres along a path, and the leg it is on. A change
 *  of floor happens the moment the walker reaches it. */
function along(path: readonly HousePoint[], distance: number): { point: HousePoint; leg: number } {
  const lengths = legs(path);
  let left = Math.max(0, distance);
  for (const [i, length] of lengths.entries()) {
    if (left < length || (left === length && i === lengths.length - 1)) {
      const t = length === 0 ? 0 : left / length;
      const [a, b] = [path[i], path[i + 1]];
      return { point: { floor: a.floor, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, leg: i };
    }
    left -= length;
  }
  return { point: path[path.length - 1], leg: Math.max(0, lengths.length - 1) };
}

/** The turn about the vertical that faces a figure (built facing +z) along
 *  a horizontal direction. */
function facing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export interface WalkPose {
  point: HousePoint;
  /** The figure's turn about the vertical, facing the way it walks. */
  heading: number;
  stride: Stride;
  done: boolean;
}

/** Where a walker is, and how it moves, at a moment on the stage's clock,
 *  taking walking steps `step` metres long (a run lengthens them). */
export function walkPose(walk: Walk, seconds: number, step = ADULT_WALK.step): WalkPose {
  const running = walk.pace === "run";
  const total = walkLength(walk.path);
  const distance = Math.min(total, Math.max(0, (seconds - walk.start) * (running ? RUN_SPEED : WALK_SPEED)));
  const here = along(walk.path, distance);
  const behind = along(walk.path, distance - LOOK).point;
  const ahead = along(walk.path, distance + LOOK).point;
  const leg = [walk.path[here.leg], walk.path[here.leg + 1]] as const;
  const sameFloor = behind.floor === ahead.floor && Math.hypot(ahead.x - behind.x, ahead.z - behind.z) > 1e-3;
  const heading = sameFloor ? facing(ahead.x - behind.x, ahead.z - behind.z) : facing(leg[1].x - leg[0].x, leg[1].z - leg[0].z);
  const ease = Math.min(1, distance / EASE, (total - distance) / EASE);
  return {
    point: here.point,
    heading,
    // Eased smoothly, so the stride never lurches as it starts or reaches full swing.
    stride: { phase: (distance / stepLength(step, running)) * Math.PI, amount: THREE.MathUtils.smoothstep(ease, 0, 1), running },
    done: distance >= total,
  };
}
