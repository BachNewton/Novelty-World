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
}

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
  /** Holes cut through the floor (a stairwell), as x and z ranges in room metres. */
  floorOpenings?: { x: [number, number]; z: [number, number] }[];
  /** Where the scale-reference explorer pawn stands, and where an explorer
   *  in the house stands in the room. */
  pawn?: [x: number, z: number];
  /** For each room a fixed link (a stair) joins this one to, the way an
   *  explorer walks it: points in room metres, from this room's floor to
   *  where the stair leaves the room. A walk between the two rooms goes up
   *  one room's stair and down the other's. */
  stairs?: Record<string, [x: number, y: number, z: number][]>;
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
