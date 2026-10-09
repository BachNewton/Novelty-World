import { EDGES, liftTile, neighbourCell, openings, opposite, roomAt, type Layout, type Spot } from "../engine/board";
import type { Catalog, Edge, Rotation } from "../types";

/*
 * A room tile shown where it would go, before it is placed: which way round
 * it may be turned, and what each way does to the doorways round it. It is
 * worked out from the engine's own board rules, so what the ghost shows is
 * what placing it would do.
 */

/** What one side of a tile turned one way would do. */
export type GhostDoorway =
  /** A door of the tile meets a door of the room beside it: a way through. */
  | "joined"
  /** A door of the tile faces the wall of the room beside it: a false door. */
  | "blind"
  /** A door of the tile opens onto an empty cell, to be explored. */
  | "unexplored"
  /** A door of the room beside it faces the tile's wall, and becomes a false door. */
  | "shut";

export interface GhostDoor {
  /** The side of the cell, as the board sees it. */
  direction: Edge;
  doorway: GhostDoorway;
}

/**
 * What each side of a cell would be with `tile` on it turned `rotation`
 * quarter turns: a door joined, blind or unexplored, or a neighbour's door
 * shut, by the board's openings. A tile already in the house is picked up
 * first, as when it moves. Sides with no door on either side are left out.
 */
export function ghostDoors(catalog: Catalog, layout: Layout, tile: string, spot: Spot, rotation: Rotation): GhostDoor[] {
  const lifted = liftTile(layout, tile);
  const ours = openings(catalog, { tile, ...spot, rotation });
  return EDGES.flatMap((direction): GhostDoor[] => {
    const cell = neighbourCell(spot, direction);
    const next = roomAt(lifted, spot.floor, cell.x, cell.y);
    const theirs = next !== undefined && openings(catalog, next).includes(opposite(direction));
    if (!ours.includes(direction)) return theirs ? [{ direction, doorway: "shut" }] : [];
    if (!next) return [{ direction, doorway: "unexplored" }];
    return [{ direction, doorway: theirs ? "joined" : "blind" }];
  });
}

/** The option `step` places on from `current` in a list of them, round and
 *  round; the first when `current` isn't one of them. */
export function cycle<T>(options: readonly T[], current: T, step: 1 | -1): T {
  if (options.length === 0) throw new Error("Nothing to cycle through");
  const at = options.indexOf(current);
  if (at < 0) return options[0];
  return options[(at + step + options.length) % options.length];
}

/** How many of each kind of doorway, in reading order, for summing up a way round. */
export function countDoors(doors: readonly GhostDoor[]): Record<GhostDoorway, number> {
  const counts: Record<GhostDoorway, number> = { joined: 0, blind: 0, unexplored: 0, shut: 0 };
  for (const { doorway } of doors) counts[doorway]++;
  return counts;
}
