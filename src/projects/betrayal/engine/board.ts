import type {
  Board,
  Catalog,
  Edge,
  FloorId,
  PlacedTile,
  Rotation,
  SetId,
} from "../types";
import type { Random } from "./random";

// A floor is a grid of cells, one room per cell. A placed tile's printed edges
// turn with its rotation, so a "direction" below is an edge as the board sees it.

export const EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

const STEP: Record<Edge, { dx: number; dy: number }> = {
  top: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  bottom: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

/** The starting tiles laid out, and every other tile of the sets in play shuffled into one stack (p. 4). */
export function startingBoard(
  catalog: Catalog,
  sets: SetId[],
  random: Random,
): Board {
  const inPlay = Object.values(catalog.rooms)
    .filter((room) => sets.includes(room.set))
    // Not localeCompare: the order must be identical on every machine.
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    tiles: inPlay.flatMap((room) =>
      room.start
        ? [{ tile: room.id, ...room.start, rotation: 0 as const }]
        : [],
    ),
    stack: random.shuffle(
      inPlay.filter((room) => !room.start).map((room) => room.id),
    ),
    discards: [],
  };
}

export function opposite(direction: Edge): Edge {
  return turn(direction, 2);
}

/** The board direction a printed edge faces once the tile is rotated. */
export function turn(edge: Edge, rotation: Rotation | number): Edge {
  return EDGES[(EDGES.indexOf(edge) + rotation) % 4];
}

export function neighbourCell(
  tile: Pick<PlacedTile, "x" | "y">,
  direction: Edge,
): { x: number; y: number } {
  return { x: tile.x + STEP[direction].dx, y: tile.y + STEP[direction].dy };
}

export function placed(board: Board, room: string): PlacedTile | undefined {
  return board.tiles.find((t) => t.tile === room);
}

export function roomAt(
  board: Board,
  floor: FloorId,
  x: number,
  y: number,
): PlacedTile | undefined {
  return board.tiles.find((t) => t.floor === floor && t.x === x && t.y === y);
}

/** Directions a placed room can be left through: doors and passages, never the locked front door. */
export function openings(catalog: Catalog, tile: PlacedTile): Edge[] {
  const room = catalog.rooms[tile.tile];
  return [...room.doors, ...room.passages]
    .filter((edge) => edge !== room.frontDoor)
    .map((edge) => turn(edge, tile.rotation));
}

/** The room through a direction, if both sides have an opening there. A
 *  mismatched side is a false feature and leads nowhere. */
function through(
  board: Board,
  catalog: Catalog,
  tile: PlacedTile,
  direction: Edge,
): PlacedTile | undefined {
  if (!openings(catalog, tile).includes(direction)) return undefined;
  const cell = neighbourCell(tile, direction);
  const next = roomAt(board, tile.floor, cell.x, cell.y);
  if (next && openings(catalog, next).includes(opposite(direction)))
    return next;
  return undefined;
}

/** Rooms one space away by movement: through matching openings, and by the
 *  fixed links (stairs) once both ends are in the house. */
export function connections(
  board: Board,
  catalog: Catalog,
  room: string,
): string[] {
  const tile = placed(board, room);
  if (!tile) return [];
  const result = new Set<string>();
  for (const direction of EDGES) {
    const next = through(board, catalog, tile, direction);
    if (next) result.add(next.tile);
  }
  for (const other of board.tiles) {
    if (
      catalog.rooms[room].links.includes(other.tile) ||
      catalog.rooms[other.tile].links.includes(room)
    ) {
      result.add(other.tile);
    }
  }
  return [...result].sort();
}

/** Rooms sharing a side, doors or not: the rulebook's meaning of "adjacent". */
export function adjacent(board: Board, room: string): string[] {
  const tile = placed(board, room);
  if (!tile) return [];
  return EDGES.flatMap((direction) => {
    const cell = neighbourCell(tile, direction);
    const next = roomAt(board, tile.floor, cell.x, cell.y);
    return next ? [next.tile] : [];
  }).sort();
}

/** Rooms along an unbroken straight line of doors, in every direction. */
export function lineOfSight(
  board: Board,
  catalog: Catalog,
  room: string,
): string[] {
  const tile = placed(board, room);
  if (!tile) return [];
  const result: string[] = [];
  for (const direction of EDGES) {
    let current = through(board, catalog, tile, direction);
    while (current) {
      result.push(current.tile);
      current = through(board, catalog, current, direction);
    }
  }
  return result.sort();
}

/** Spaces of movement from a room to every room reachable from it. */
export function distances(
  board: Board,
  catalog: Catalog,
  from: string,
): Record<string, number> {
  const result: Record<string, number> = { [from]: 0 };
  let frontier = [from];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const room of frontier) {
      for (const neighbour of connections(board, catalog, room)) {
        if (neighbour in result) continue;
        result[neighbour] = result[room] + 1;
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return result;
}

export interface Doorway {
  room: string;
  direction: Edge;
}

/** Doors that open onto an empty cell: where a new room can be discovered. */
export function freeDoorways(
  board: Board,
  catalog: Catalog,
  floor: FloorId,
): Doorway[] {
  return board.tiles
    .filter((tile) => tile.floor === floor)
    .flatMap((tile) =>
      openings(catalog, tile)
        .filter((direction) => {
          const cell = neighbourCell(tile, direction);
          return !roomAt(board, floor, cell.x, cell.y);
        })
        .map((direction) => ({ room: tile.tile, direction })),
    );
}

export interface Placement {
  rotation: Rotation;
  /** Openings that meet an opening of a neighbouring room. */
  matched: number;
  /** Placing it this way leaves its floor no free doorway (p. 9). */
  seals: boolean;
}

/** The ways a tile can be placed through a doorway: every rotation that puts
 *  one of its doors back toward the room it was entered from. */
export function placements(
  board: Board,
  catalog: Catalog,
  tileId: string,
  doorway: Doorway,
): Placement[] {
  const from = placed(board, doorway.room);
  if (!from)
    throw new Error(`Doorway room ${doorway.room} is not on the board`);
  const cell = neighbourCell(from, doorway.direction);
  if (roomAt(board, from.floor, cell.x, cell.y)) {
    throw new Error(
      `Doorway ${doorway.room} ${doorway.direction} doesn't open onto an empty cell`,
    );
  }
  const back = opposite(doorway.direction);
  const result: Placement[] = [];
  for (const rotation of [0, 1, 2, 3] as const) {
    const tile: PlacedTile = {
      tile: tileId,
      floor: from.floor,
      ...cell,
      rotation,
    };
    const open = openings(catalog, tile);
    if (!open.includes(back)) continue;
    const after: Board = { ...board, tiles: [...board.tiles, tile] };
    const matched = open.filter((direction) =>
      through(after, catalog, tile, direction),
    ).length;
    result.push({
      rotation,
      matched,
      seals: freeDoorways(after, catalog, from.floor).length === 0,
    });
  }
  return result;
}
