import type { Point } from "@/shared/lib/input";
import type { GameView } from "../contract";
import { ADJACENCY, type TerritoryId } from "../map";
import { BORDERS, NODES, WRAP_GHOSTS } from "./graph-layout";

/*
 * The board as a graph, pure: where territories sit, the lines drawn between them, and the way a
 * fortifying army marches.
 */

/** The scale below which the whole board stops being readable, names at about 10 px: a smaller
 *  box starts zoomed in, panned (`startScale`). */
export const READABLE_SCALE = 0.45;

/** How far a step left or right looks round the board's edge: Alaska's west is Kamchatka, where its ghost is. */
export const WRAP_WIDTH = NODES.kamchatka[0] - WRAP_GHOSTS.kamchatka[0];

export function locate(territory: TerritoryId): Point {
  const [x, y] = NODES[territory];
  return { x, y };
}

export const isWrap = (a: TerritoryId, b: TerritoryId) => (a === "alaska" && b === "kamchatka") || (a === "kamchatka" && b === "alaska");

type Segment = readonly [readonly [number, number], readonly [number, number]];

/** The straight lines a border is drawn as: one, or Alaska–Kamchatka's two stubs off the edges. */
export function borderLines(a: TerritoryId, b: TerritoryId): readonly Segment[] {
  if (!isWrap(a, b)) return [[NODES[a], NODES[b]]];
  return [
    [NODES.alaska, WRAP_GHOSTS.kamchatka],
    [NODES.kamchatka, WRAP_GHOSTS.alaska],
  ];
}

/** Every line the board draws, each with the border it belongs to. */
export const DRAWN = BORDERS.flatMap(([a, b]) => borderLines(a, b).map((line) => ({ border: [a, b] as const, line })));

/** The shortest way from one territory to another through its owner's territories, for showing
 *  where a fortifying army marches. Null when there is none. */
export function pathThrough(territories: GameView["territories"], from: TerritoryId, to: TerritoryId): TerritoryId[] | null {
  const owner = territories[from].owner;
  const previous = new Map<TerritoryId, TerritoryId | null>([[from, null]]);
  const queue: TerritoryId[] = [from];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    if (at === to) {
      const path: TerritoryId[] = [];
      for (let step: TerritoryId | null = to; step !== null; step = previous.get(step) ?? null) path.unshift(step);
      return path;
    }
    for (const next of ADJACENCY[at]) {
      if (previous.has(next) || territories[next].owner !== owner) continue;
      previous.set(next, at);
      queue.push(next);
    }
  }
  return null;
}
