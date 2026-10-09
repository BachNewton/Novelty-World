import { EDGES, neighbourCell, opposite, openings, roomAt, type Layout } from "../engine/board";
import type { Catalog, Edge, PlacedTile, Rotation } from "../types";

/*
 * Where the house view's pieces go, as pure functions of the engine's board.
 * A board direction is an edge as the board sees it; a printed edge is an edge
 * of the tile as it reads upright. Board x runs right and board y runs down,
 * which the house lays along the scene's +x and +z.
 */

/** A believable small house, all legal placements, for the house view to
 *  show until it is fed a real game: the base game's starting tiles, three
 *  rooms on the ground floor (two of them turned), and two on the upper
 *  floor (the Drawing Room is Widow's Walk's, so it is upper or roof only).
 *  The Entrance Hall's bottom door meets the Chapel's wall, a door to nowhere
 *  as the real game makes them. */
export const HOUSE_FIXTURE: Layout = {
  tiles: [
    { tile: "basement-landing", floor: "basement", x: 0, y: 0, rotation: 0 },
    { tile: "entrance-hall", floor: "ground", x: 2, y: 0, rotation: 0 },
    { tile: "foyer", floor: "ground", x: 1, y: 0, rotation: 0 },
    { tile: "grand-staircase", floor: "ground", x: 0, y: 0, rotation: 0 },
    { tile: "upper-landing", floor: "upper", x: 0, y: 0, rotation: 0 },
    { tile: "dining-room", floor: "ground", x: 1, y: -1, rotation: 1 },
    { tile: "library", floor: "ground", x: 1, y: 1, rotation: 2 },
    { tile: "chapel", floor: "ground", x: 2, y: 1, rotation: 3 },
    { tile: "drawing-room", floor: "upper", x: 1, y: 0, rotation: 1 },
    { tile: "bedroom", floor: "upper", x: -1, y: 0, rotation: 0 },
  ],
};

/** Each board direction as a horizontal unit vector in the scene. */
export const DIRECTION: Record<Edge, { x: number; z: number }> = {
  top: { x: 0, z: -1 },
  right: { x: 1, z: 0 },
  bottom: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
};

/** The printed edge of a tile that faces a board direction once it is
 *  turned: the inverse of the engine's `turn`. */
export function printedEdge(direction: Edge, rotation: Rotation): Edge {
  return EDGES[(EDGES.indexOf(direction) - rotation + 4) % 4];
}

/** The turn about the vertical, in radians, that lays a tile built upright in
 *  its own frame down at its rotation (quarter turns clockwise seen from above). */
export function tileTurn(rotation: Rotation): number {
  return (-rotation * Math.PI) / 2;
}

/** A wall faces the camera when its outside does. */
export function facesCamera(direction: Edge, camera: { x: number; z: number }): boolean {
  const out = DIRECTION[direction];
  return out.x * camera.x + out.z * camera.z > 0.01;
}

/**
 * Whether a placed room's wall on a board direction is cut down, for a camera
 * looking from the horizontal direction `camera`.
 *
 * A wall is cut when it faces the camera, as on the bench, and also when a
 * room lies behind it: seen from above at a slant, a full wall hides the
 * floor beyond it for most of a tile's depth, and, from a corner view, round
 * the end of the wall too. So a wall facing away is cut when a room is on the
 * cell beyond it, or on the cell beyond and one along, on the side the camera
 * looks towards. Every wall between two rooms is cut on both sides, and only
 * outside walls at the back of the house, with nothing behind them, stand
 * full. The room in `focus`, for a close view, keeps its back walls full
 * whatever lies beyond them, as it does on the bench.
 */
export function wallIsCut(layout: Layout, tile: PlacedTile, direction: Edge, camera: { x: number; z: number }, focus: string | null): boolean {
  if (facesCamera(direction, camera)) return true;
  if (tile.tile === focus) return false;
  const beyond = neighbourCell(tile, direction);
  const along = EDGES.filter((side) => side !== direction && side !== opposite(direction) && facesCamera(opposite(side), camera));
  const behind = [beyond, ...along.map((side) => neighbourCell(beyond, side))];
  return behind.some((cell) => roomAt(layout, tile.floor, cell.x, cell.y) !== undefined);
}

/** What lies through a door: another room's door ("joined"), another room's
 *  wall ("blind"), or an empty cell not yet explored ("unexplored"). */
export type Doorway = "joined" | "blind" | "unexplored";

/** Each door of a placed room that can be left through, by printed edge, and what lies through it. */
export function doorways(layout: Layout, catalog: Catalog, tile: PlacedTile): { edge: Edge; doorway: Doorway }[] {
  return openings(catalog, tile).flatMap((direction) => {
    const edge = printedEdge(direction, tile.rotation);
    if (!catalog.rooms[tile.tile].doors.includes(edge)) return [];
    const cell = neighbourCell(tile, direction);
    const next = roomAt(layout, tile.floor, cell.x, cell.y);
    const doorway: Doorway = !next ? "unexplored" : openings(catalog, next).includes(opposite(direction)) ? "joined" : "blind";
    return [{ edge, doorway }];
  });
}
