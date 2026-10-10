import { connections, type Layout } from "../engine/board";
import type { Catalog } from "../types";
import type { Reach } from "./house-walk";

/*
 * The house demo's stand-in rules for moving (`?house`), on a fixture house
 * with no game behind it: an explorer moves in legs on a budget of spaces,
 * each leg to any room within what is left by its shortest route. The game
 * itself asks the engine where a move can go (`play/lookahead.ts`); these
 * serve only the demo, its screenshots and its e2e.
 */

/**
 * Every room within `movement` spaces of `from`, each with its shortest route,
 * nearest first. Ties go to the route through the alphabetically first room,
 * as `connections` lists them, so the same board always gives the same route.
 */
export function reachable(layout: Layout, catalog: Catalog, from: string, movement: number): Reach[] {
  const routes = new Map<string, string[]>([[from, [from]]]);
  let frontier = [from];
  for (let step = 0; step < movement; step++) {
    const next: string[] = [];
    for (const room of frontier) {
      for (const neighbour of connections(layout, catalog, room)) {
        if (routes.has(neighbour)) continue;
        routes.set(neighbour, [...(routes.get(room) ?? []), neighbour]);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  routes.delete(from);
  return [...routes].map(([room, route]) => ({ room, route })).sort((a, b) => a.route.length - b.route.length || (a.room < b.room ? -1 : 1));
}

/**
 * An explorer's move this turn: where they stand, and the spaces of movement
 * they have left. A move is made in legs, each to a room within what is left
 * and spending its route's length, a stair step costing a space like any
 * other. The real engine moves a space at a time, which is a leg of one.
 */
export interface Move {
  room: string;
  left: number;
}

/** The legs a move can take next: every room within the movement left. */
export function nextLegs(layout: Layout, catalog: Catalog, move: Move): Reach[] {
  return reachable(layout, catalog, move.room, move.left);
}

/** The move after a leg along `reach`, which must start where the move stands and fit what is left. */
export function afterLeg(move: Move, reach: Reach): Move {
  const spent = reach.route.length - 1;
  if (reach.route[0] !== move.room) throw new Error(`A leg from ${reach.route[0]} can't continue a move standing in ${move.room}`);
  if (spent > move.left) throw new Error(`A leg of ${spent} spaces is more than the ${move.left} left`);
  return { room: reach.room, left: move.left - spent };
}

/** Whether a move is over without being stopped: nothing left to spend, or nowhere it can reach. */
export function moveIsOver(layout: Layout, catalog: Catalog, move: Move): boolean {
  return move.left === 0 || nextLegs(layout, catalog, move).length === 0;
}
