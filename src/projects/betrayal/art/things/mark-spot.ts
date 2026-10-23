import type { Edge, RoomTile } from "../../types";
import { strokeDistance, type PlacementRoom } from "../placement";
import { edgeOpenings, FLOOR_RINGS, INNER, onWall } from "../room";

/*
 * Where a connection's mark goes on its room's walls, read off the built
 * room as the placement solver reads its free floor: a stretch of wall whose
 * foot is clear (`FloorPlan.markClearance`), clear of the wall's doorways and windows
 * and of the marks already on it, for the mark's art; and a clear patch of
 * floor in front of it for its icon. The wall the game names is kept: where
 * it has no clear stretch, the art gives way and the icon stands on the
 * nearest clear floor. Every built room is checked with every kind on every
 * wall (`marks.slow.test.ts`).
 */

/** Where a connection's mark goes, in its room's own frame: the edge (as
 *  printed) and how far along it from its middle, positive to the right
 *  facing the wall; whether its art fits there; and where its icon stands. */
export interface EdgeSpot {
  edge: Edge;
  along: number;
  /** The wall has a clear stretch for the mark's art there; when it hasn't, only the icon shows. */
  fits: boolean;
  icon: readonly [x: number, z: number];
}

/** How much wall a mark's art takes, centred on its spot, and how far into the room it reaches from the wall's face, in metres. */
export interface MarkFootprint {
  width: number;
  depth: number;
}

/** Each kind's footprint, by token id, matching its art (`marks.ts`). */
export const MARK_FOOTPRINTS: Readonly<Record<string, MarkFootprint>> = {
  "secret-passage": { width: 0.95, depth: 0.65 },
  "secret-stairs": { width: 1.2, depth: 0.7 },
  "wall-switch": { width: 1.4, depth: 0.55 },
};
/** A mark on a wall with no art of its own yet (a lock): a bar along the stub and a strip on the floor before it. */
const STAND_IN: MarkFootprint = { width: 0.8, depth: 0.25 };

export const markFootprint = (token: string | null): MarkFootprint => (token !== null && Object.hasOwn(MARK_FOOTPRINTS, token) ? MARK_FOOTPRINTS[token] : STAND_IN);

/** A connection's icon on the floor: the radius of its plate (an object's, `FLOOR_RINGS`), and the floor kept clear round it. */
export const MARK_ICON = { radius: FLOOR_RINGS.plate.radius, clear: FLOOR_RINGS.plate.radius + 0.03 };

/** A stretch of wall a mark already takes: along `edge`, from `from` to `to`. */
export interface TakenStretch {
  edge: Edge;
  from: number;
  to: number;
}

export const takenBy = (spot: EdgeSpot, token: string | null): TakenStretch => {
  const half = markFootprint(token).width / 2;
  return { edge: spot.edge, from: spot.along - half, to: spot.along + half };
};

/** The wall a mark keeps from the wall across a corner, past that wall's dressing, and from a doorway's or a window's casing, in metres. */
const CORNER_CLEAR = 0.1;
const OPENING_CLEAR = 0.12;
/** The depth of a wall's own dressing at its foot (its skirting, an outdoor wall's coping), which a mark's art stands in front of. */
const DRESSING = 0.05;
/** The grid the stretches and the icon's floor are read on: the floor plan's cell. */
const STEP = 0.05;
/** How much worse a wall with a doorway in it is than a plain one, for a mark the game puts on no wall in particular, in metres along. */
const DOORWAY_WALL = 2;
const WINDOW_WALL = 0.6;
/** How much worse a mark on the floor is in a doorway's lane, or on the prime place, than this many metres further from its spot. */
const IN_THE_WAY = 1.5;
/** How far a mark on the floor keeps from the prime place: a figure's base standing there. */
const PRIME_CLEAR = 0.45;

const PRINTED: readonly Edge[] = ["top", "right", "bottom", "left"];
const ALONG_AXIS: Record<Edge, readonly [x: number, z: number]> = { top: [1, 0], right: [0, 1], bottom: [-1, 0], left: [0, -1] };
const TOWARD_EDGE: Record<Edge, readonly [x: number, z: number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

/** Which way along `edge` a corner with `toward` lies: +1 or −1. */
function cornerward(edge: Edge, toward: Edge): number {
  const [ax, az] = ALONG_AXIS[edge];
  const [tx, tz] = TOWARD_EDGE[toward];
  return Math.sign(ax * tx + az * tz);
}

/** A point `out` metres off a wall's face, `along` it. */
const offWall = (edge: Edge, along: number, out: number) => onWall(edge, along, { out }).at;

/** Where a connection's mark goes on its room's walls: on the wall the game
 *  puts it on, in its middle (in a corner, as far into it as the corner's
 *  walls allow, on either), or else on the clear stretch of wall nearest the
 *  middle of a plain wall, then one with a window, then one with a doorway.
 *  `taken` are the stretches the room's other marks hold. */
export function markSpot(room: PlacementRoom, tile: Pick<RoomTile, "doors" | "passages" | "windows" | "frontDoor">, token: string | null, wall: readonly Edge[] | null, taken: readonly TakenStretch[] = []): EdgeSpot {
  const { floor, hints } = room;
  const print = markFootprint(token);
  const half = print.width / 2;
  const reach = INNER - CORNER_CLEAR - half;
  const named = wall !== null && wall.length > 0;
  const edges = named ? wall : PRINTED;
  const free = (x: number, z: number) => floor.markClearance[floor.cellAt(x, z)] > 0 && (hints.within === null || hints.within(x, z));
  const clearStretch = (edge: Edge, along: number) => {
    for (let out = DRESSING + STEP / 2; out < print.depth; out += STEP) {
      for (let at = along - half; at <= along + half + 1e-9; at += STEP) if (!free(...offWall(edge, at, out))) return false;
    }
    return true;
  };
  /** How far a spot is from where the mark would best go; the least wins. */
  const cost = (edge: Edge, along: number): number => {
    if (wall !== null && wall.length === 2) return INNER - cornerward(edge, edge === wall[0] ? wall[1] : wall[0]) * along + (edge === wall[0] ? 0 : 0.01);
    if (named) return Math.abs(along);
    const openings = edgeOpenings(tile, edge);
    return Math.abs(along) + (openings.some((opening) => opening.kind === "door") ? DOORWAY_WALL : openings.length > 0 ? WINDOW_WALL : 0) + PRINTED.indexOf(edge) * 1e-3;
  };

  let best: { edge: Edge; along: number; cost: number } | null = null;
  for (const edge of edges) {
    if (tile.passages.includes(edge)) continue;
    const blocked = [
      ...edgeOpenings(tile, edge).map((opening) => [opening.centre - opening.width / 2 - OPENING_CLEAR, opening.centre + opening.width / 2 + OPENING_CLEAR] as const),
      ...taken.filter((stretch) => stretch.edge === edge).map((stretch) => [stretch.from, stretch.to] as const),
    ];
    for (let along = -reach; along <= reach + 1e-9; along += STEP) {
      if (blocked.some(([from, to]) => along + half > from && along - half < to)) continue;
      const value = cost(edge, along);
      if (best && value >= best.cost) continue;
      if (clearStretch(edge, along)) best = { edge, along, cost: value };
    }
  }
  if (best) return { edge: best.edge, along: best.along, fits: true, icon: iconSpot(room, offWall(best.edge, best.along, print.depth + MARK_ICON.clear)) };
  // No clear stretch: the art gives way, and the icon stands as near as it can to where the mark belongs.
  const edge = edges.find((candidate) => !tile.passages.includes(candidate)) ?? edges[0];
  const along = wall !== null && wall.length === 2 ? cornerward(wall[0], wall[1]) * reach : 0;
  return { edge, along, fits: false, icon: iconSpot(room, offWall(edge, along, MARK_ICON.clear + STEP)) };
}

/** The floor nearest `wanted` an icon's plate fits on, clear of anything a
 *  step up and on floor a figure reaches, off the doorways' lanes and the
 *  prime place where it can be. */
export function iconSpot(room: PlacementRoom, wanted: readonly [x: number, z: number]): readonly [x: number, z: number] {
  return clearDisc(room, wanted, MARK_ICON.clear, 1);
}

/** Where a mark on the floor (the Slide, the landing) goes: the clear floor
 *  `reach` round, nearest the prime place (or the middle) but off it and off
 *  the doorways' lanes. */
export function floorSpot(room: PlacementRoom, reach: number): readonly [x: number, z: number] {
  return clearDisc(room, room.hints.prime ?? [0, 0], reach, 2);
}

/** The middle of a disc of floor `radius` round, clear of anything a step up
 *  and on floor a figure reaches, nearest `wanted`, where a disc in a
 *  doorway's lane or over the prime place counts `IN_THE_WAY` metres further. */
function clearDisc(room: PlacementRoom, wanted: readonly [x: number, z: number], radius: number, step: number): readonly [x: number, z: number] {
  const { floor, hints } = room;
  let best: { at: [number, number]; cost: number } | null = null;
  for (let row = 0; row < floor.size; row += step) {
    for (let column = 0; column < floor.size; column += step) {
      const cell = row * floor.size + column;
      if (!floor.reached[cell]) continue;
      const [x, z] = floor.centre(cell);
      if (hints.within !== null && !hints.within(x, z)) continue;
      const inTheWay =
        hints.keepClear.some((stroke) => strokeDistance(x, z, stroke) < stroke.radius) || (hints.prime !== null && Math.hypot(x - hints.prime[0], z - hints.prime[1]) < radius + PRIME_CLEAR);
      const value = Math.hypot(x - wanted[0], z - wanted[1]) + (inTheWay ? IN_THE_WAY : 0);
      if (floor.markClearance[cell] >= radius && (!best || value < best.cost)) best = { at: [x, z], cost: value };
    }
  }
  if (!best) throw new Error(`No clear floor ${radius} m round for a connection's mark: the room's floor reaches nowhere`);
  return best.at;
}
