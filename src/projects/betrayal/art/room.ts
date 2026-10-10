import type * as THREE from "three";
import type { Edge } from "../types";
import type { PaletteKey } from "./palette";

/** One unit is one metre. Every room is the same square tile. */
export const TILE = 6;
export const WALL_HEIGHT = 3.2;
export const WALL_THICKNESS = 0.2;
/** Height a wall is cut down to when it stands between the camera and the room. */
export const CUT_HEIGHT = 0.45;
export const DOOR_WIDTH = 1.1;
export const DOOR_HEIGHT = 2.3;
/** The house's front door is drawn larger than the others. */
export const FRONT_DOOR_WIDTH = 1.7;
export const FRONT_DOOR_HEIGHT = 2.9;
export const WINDOW_WIDTH = 1.0;
export const WINDOW_SILL = 1.0;
export const WINDOW_TOP = 2.5;
export const WAINSCOT_HEIGHT = 1.0;
/** How far the wainscot panelling stands off the wall face. A piece backed
 *  against a wall must not put a face in this plane, or the two fight. */
export const WAINSCOT_DEPTH = 0.03;
/**
 * The heights of the house's choice marks: flat glows over the floor that
 * draw no depth (the fill of a room or doorway offered as a choice, the ring
 * round a figure, and the border). A room keeps its faces out of these planes,
 * or they fight the glow; `clearOfMarks` moves a height clear of them.
 */
export const MARK_PLANES = { fill: 0.03, ring: 0.035, edge: 0.05 } as const;
/** How far clear of a mark's plane `clearOfMarks` moves a height. */
const MARK_CLEAR = 0.0015;

/** A height, or the nearest one clear of the choice marks' planes. */
export function clearOfMarks(y: number): number {
  for (const plane of Object.values(MARK_PLANES)) {
    if (Math.abs(y - plane) < MARK_CLEAR) return y < plane ? plane - MARK_CLEAR : plane + MARK_CLEAR;
  }
  return y;
}
/**
 * An outdoor tile (the tile data's `outside`) has no walls and no ceiling.
 * Its edges are a low wall of the room's `wall` surface, exactly the cut
 * height tall so cutting it changes nothing, with iron railings of its
 * `trim` colour above, which the cut takes away. Stone piers stand either
 * side of each gate (a door) and at the corners, square and flush with the
 * tile's edge, so they reach `PIER` − `WALL_THICKNESS` into the walkable floor.
 */
export const OUTDOOR = { railing: 1.25, pier: 0.3, pierTop: 1.45 };

/** Half the walkable floor: props stay within ±INNER of the centre. */
export const INNER = TILE / 2 - WALL_THICKNESS;

/** A surface texture, made when the room is built (textures need a browser). */
export type Surface = () => THREE.Texture;

/** Where a prop stands: floor position, height of its base, and turn about
 *  the vertical in degrees. A piece faces +z (towards the bottom edge) unturned. */
export interface Placement {
  at: [x: number, z: number];
  y?: number;
  turn?: number;
  /** The walls it hangs on: one (set by `onWall`), or two for a piece in a
   *  corner. Hung above the cut height, it hides when the camera cuts away
   *  any of them. */
  walls?: Edge[];
}

export interface PropPlacement extends Placement {
  build: () => THREE.Object3D;
  /** What the overlap check and the close-ups call it; defaults to the
   *  build function's own name, when it has one. */
  name?: string;
  /** Contacts it is built to make, which the overlap check accepts. */
  contacts?: Contact[];
}

/**
 * A piece meant to pass into another, or to share a face with it, declared
 * in one line with its reason: `{ with: "left", because: "it has fallen against the wall" }`.
 */
export interface Contact {
  /** A wall's edge, `floor`, a keep-clear zone (`pawn`, `doorway top`), or another piece's name. */
  with: string;
  because: string;
}

/** A piece's name: its own, or its build function's (an inline arrow is
 *  named `build` after the field, which says nothing). */
export function pieceName(prop: PropPlacement): string {
  const own = prop.build.name;
  return prop.name ?? (own && own !== "build" ? own : "prop");
}

/** A piece's name and where it stands, which tells apart pieces of one name. */
export function pieceLabel(prop: PropPlacement): string {
  const [x, z] = prop.at;
  return `${pieceName(prop)} at (${x.toFixed(2)}, ${z.toFixed(2)})${prop.y ? ` up ${prop.y.toFixed(2)}` : ""}`;
}

/** A light of its own (a fire's glow, a lamp); candles in the kit bring theirs.
 *  Every light is baked, shadows and all, and spills through open doorways. */
export interface LightSpec {
  at: [x: number, y: number, z: number];
  colour: PaletteKey;
  /** Candela; a candle is about 1.5, a hearth about 6. */
  intensity: number;
  /** Metres beyond which the light has no effect. */
  range: number;
  /** 0 is steady; 0.15 is a candle's gentle waver, 0.3 a fire; at most 0.5. */
  flicker?: number;
  /** What it wavers with (see `FlickerSignal`); a flame picks one of the four flame signals by default. */
  signal?: FlickerSignal;
}

/**
 * What a light wavers with: one of the four flame signals (0–3), or `water`,
 * the slow swell of light thrown off water. A glow that names the same signal
 * and reads `flickerOf` wavers in step with the light.
 */
export type FlickerSignal = 0 | 1 | 2 | 3 | "water";

/** The close-up's aim when a room names none: just above the middle of the floor. */
export const DEFAULT_FOCUS: [x: number, y: number, z: number] = [0, 0.4, 0];

export interface RoomDefinition {
  /** A room tile id from data/rooms.ts; its doors and windows come from there. */
  id: string;
  floor: Surface;
  wall: Surface;
  /** Panelling on the lower metre of the walls. */
  wainscot?: Surface;
  /** Skirting, crown, door and window frames. */
  trim: PaletteKey;
  props: PropPlacement[];
  lights?: LightSpec[];
  /** Where the close-up looks. Defaults to `DEFAULT_FOCUS`. */
  focus?: [x: number, y: number, z: number];
  /** Holes cut through the floor (a stairwell, a lake), in room metres. */
  floorOpenings?: FloorOpening[];
  /** The prime standing spot, the first the house fills: where the active
   *  explorer stands, and where the bench stands its explorer. */
  pawn?: [x: number, z: number];
  /** The five standing spots after `pawn`, in the order the house fills
   *  them. Each is clear for a figure's base and reachable from the doors. */
  spots?: [x: number, z: number][];
  /** For each room a fixed link (a stair) joins this one to, the way an
   *  explorer walks it: points in room metres, from this room's floor to
   *  where the stair leaves the room. A walk between the two rooms goes up
   *  one room's stair and down the other's. */
  stairs?: Record<string, [x: number, y: number, z: number][]>;
  /** In a barrier room, the way across from one half to the other, along
   *  its visible crossing (a bridge, an arch): points in room metres, from
   *  one end to the other. A point stands in the half of the end it is
   *  nearer, and a walk between the halves goes along it. */
  crossing?: [x: number, y: number, z: number][];
  /** Where a straight walk across the room would pass through something (a
   *  table, a corner of wall), the lanes walks keep to round it: lines of
   *  clear floor, as points in room metres, joined where they share a point.
   *  A walk steps onto them, follows them and steps off again by whichever
   *  way is shortest. Without lanes, walks go straight. */
  lanes?: (readonly [x: number, z: number])[][];
}

/** How far inside a doorway a walker lines up with it, so it passes through
 *  square rather than cutting past the frame. */
export const DOOR_APPROACH = 0.8;

/** Lanes straight across the room from the middle of each side to the
 *  middle of the opposite one, crossing in the middle: for a cross of
 *  corridors, or a room clear down its middle lines. */
export function crossLanes(): [x: number, z: number][][] {
  const end = TILE / 2 - DOOR_APPROACH;
  return [
    [[0, -end], [0, 0], [0, end]],
    [[-end, 0], [0, 0], [end, 0]],
  ];
}

/** A point in a room's own frame, in metres, `y` up from its floor. */
export type RoomPoint = readonly [x: number, y: number, z: number];

/** What a walk across a room keeps to. */
export type RoomWays = Pick<RoomDefinition, "stairs" | "crossing" | "lanes">;

type Flat = readonly [x: number, z: number];

const flatDistance = (a: Flat, b: Flat) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The nearest point to `p` on the segment from `a` to `b`. */
function nearestOn(p: Flat, a: Flat, b: Flat): Flat {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const squared = dx * dx + dz * dz;
  const t = squared === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / squared));
  return [a[0] + dx * t, a[1] + dz * t];
}

/** How much further than the nearest lane a walk may step onto another,
 *  when that makes it shorter: as near, give or take a step. */
const STEP_ON = 0.3;

/**
 * The way from `a` to `b` by the lanes, as the points it passes through:
 * onto the lanes at the nearest point to `a` (or one about as near), along
 * them, and off them where they come nearest `b`, by the shortest way.
 */
function byLanes(lanes: readonly (readonly Flat[])[], a: RoomPoint, b: RoomPoint): RoomPoint[] {
  const points: Flat[] = [];
  const indexOf = ([x, z]: Flat) => {
    const found = points.findIndex(([px, pz]) => px === x && pz === z);
    return found === -1 ? points.push([x, z]) - 1 : found;
  };
  const stretches = lanes.flatMap((lane) => lane.slice(1).map((point, i) => [indexOf(lane[i]), indexOf(point)] as const));
  const links: (readonly [number, number])[] = [...stretches];
  /** Joins a walk's end to where it may step onto the lanes, and those to the ends of their stretches; by stretch. */
  const stepOn = (end: Flat) => {
    const node = points.push(end) - 1;
    const near = stretches.map((stretch) => nearestOn(end, points[stretch[0]], points[stretch[1]]));
    const nearest = Math.min(...near.map((at) => flatDistance(end, at)));
    const on = new Map<(typeof stretches)[number], number>();
    near.forEach((at, i) => {
      if (flatDistance(end, at) > nearest + STEP_ON) return;
      const point = points.push(at) - 1;
      links.push([node, point], [point, stretches[i][0]], [point, stretches[i][1]]);
      on.set(stretches[i], point);
    });
    return { node, on };
  };
  const [from, to] = [stepOn([a[0], a[2]]), stepOn([b[0], b[2]])];
  for (const [stretch, point] of from.on) {
    const other = to.on.get(stretch);
    if (other !== undefined) links.push([point, other]);
  }
  // The shortest way between every two points (Floyd–Warshall: a room's lanes have a handful).
  const n = points.length;
  const far = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const next = Array.from({ length: n }, () => Array.from({ length: n }, (_, j) => j));
  for (const [i, j] of links) far[i][j] = far[j][i] = flatDistance(points[i], points[j]);
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (far[i][k] + far[k][j] < far[i][j]) {
          far[i][j] = far[i][k] + far[k][j];
          next[i][j] = next[i][k];
        }
  const way: Flat[] = [];
  for (let at = next[from.node][to.node]; at !== to.node; at = next[at][to.node]) way.push(points[at]);
  // A point the walk is already at is no turn.
  const ends = [points[from.node], points[to.node]];
  return way
    .filter((point, i) => ends.every((end) => flatDistance(point, end) > 1e-6) && (i === 0 || flatDistance(point, way[i - 1]) > 1e-6))
    .map(([x, z]): RoomPoint => [x, 0, z]);
}

/**
 * The points a walk passes through on its way across a room from `a` to `b`,
 * both in room metres and on its floor: along the crossing where they lie in
 * different halves of a barrier room, and by the room's lanes, where it has
 * them; with neither, none, straight across.
 */
export function waypoints(ways: RoomWays, a: RoomPoint, b: RoomPoint): RoomPoint[] {
  const { crossing, lanes } = ways;
  const across = (from: RoomPoint, to: RoomPoint) => (lanes ? byLanes(lanes, from, to) : []);
  if (!crossing || crossing.length === 0) return across(a, b);
  const ends = [crossing[0], crossing[crossing.length - 1]];
  const half = ([x, , z]: RoomPoint) => (Math.hypot(x - ends[0][0], z - ends[0][2]) <= Math.hypot(x - ends[1][0], z - ends[1][2]) ? 0 : 1);
  if (half(a) === half(b)) return across(a, b);
  const way = half(a) === 0 ? [...crossing] : [...crossing].reverse();
  return [...across(a, way[0]), ...way, ...across(way[way.length - 1], b)];
}

/** A hole through the floor: a rectangle, as x and z ranges, or a polygon of
 *  [x, z] corners (either winding, not crossing itself) for a ragged edge. */
export type FloorOpening = { x: [number, number]; z: [number, number] } | { polygon: [x: number, z: number][] };

/** Each explorer after the first in a room stands this much further from the pawn spot, towards the middle of the room. */
const MAKE_ROOM = 0.9;

/** Where the explorer in `slot` stands in a room: the pawn spot for the
 *  first (0), then `MAKE_ROOM` further towards the middle for each after. */
export function explorerSpot(pawn: [x: number, z: number], slot: number): [x: number, z: number] {
  const [x, z] = pawn;
  const towardMiddle = Math.min((slot * MAKE_ROOM) / Math.max(Math.hypot(x, z), 1e-6), 1);
  return [x * (1 - towardMiddle), z * (1 - towardMiddle)];
}

/** Every standing spot of a room, in the order the house fills them: `pawn`, then `spots`. */
export function standingSpots(def: RoomDefinition): [x: number, z: number][] {
  return def.pawn ? [def.pawn, ...(def.spots ?? [])] : [];
}

const WALL_TURN: Record<Edge, number> = { top: 0, right: -90, bottom: 180, left: 90 };

/**
 * A placement against the inside of a wall, facing into the room. `along` is
 * metres from the wall's centre, positive to the right as you face the wall;
 * `out` is how far the piece's origin stands off the wall face.
 */
export function onWall(edge: Edge, along: number, { y = 0, out = 0 } = {}): Placement {
  const depth = INNER - out;
  const at: Record<Edge, [number, number]> = {
    top: [along, -depth],
    right: [depth, along],
    bottom: [-along, depth],
    left: [-depth, -along],
  };
  return { at: at[edge], y, turn: WALL_TURN[edge], walls: [edge] };
}

export function wallTurn(edge: Edge): number {
  return WALL_TURN[edge];
}
