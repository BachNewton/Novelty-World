import type { Point } from "@/shared/lib/input";
import type { GameView } from "../contract";
import { ADJACENCY, type TerritoryId } from "../map";
import type { Rect } from "../ui/camera";
import { BORDERS, GRAPH_WIDTH, NODES } from "./graph-layout";

/*
 * The board as a graph, pure: where territories sit, the lines drawn between them, and the way a
 * fortifying army marches.
 */

/** A territory's marker and the short name under it, in board units (neighbours are about
 *  `GRAPH_UNIT` apart). */
export const MARKER = 62;
export const NAME_SIZE = 21;

/** What a territory draws round its place, lit ring and name included: the part of the board an
 *  overlay must not cover. */
const REACH = { side: 50, above: 50, below: MARKER / 2 + 8 + NAME_SIZE };
export const FOOTPRINTS: readonly Rect[] = Object.values(NODES).map(([x, y]) => ({ left: x - REACH.side, right: x + REACH.side, top: y - REACH.above, bottom: y + REACH.below }));

/** CSS pixels between the two closest territories that a fingertip needs to pick either. */
export const FINGERTIP = 44;
const values = Object.values(NODES);
const CLOSEST = Math.min(...values.flatMap((a, i) => values.slice(i + 1).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
/** The least scale the board is shown at: the closest two territories a fingertip apart. */
export const TOUCH_SCALE = FINGERTIP / CLOSEST;

/** The board wraps east to west: Alaska's west is Kamchatka, one board width along. */
export const WRAP_WIDTH = GRAPH_WIDTH;

export function locate(territory: TerritoryId): Point {
  const [x, y] = NODES[territory];
  return { x, y };
}

export const isWrap = (a: TerritoryId, b: TerritoryId) => (a === "alaska" && b === "kamchatka") || (a === "kamchatka" && b === "alaska");

type Segment = readonly [readonly [number, number], readonly [number, number]];

/** The straight lines a border is drawn as: one, or Alaska–Kamchatka's two, each from one end
 *  across the board's edge to where the other end's copy is. */
export function borderLines(a: TerritoryId, b: TerritoryId): readonly Segment[] {
  if (!isWrap(a, b)) return [[NODES[a], NODES[b]]];
  return [
    [NODES.alaska, [NODES.kamchatka[0] - WRAP_WIDTH, NODES.kamchatka[1]]],
    [NODES.kamchatka, [NODES.alaska[0] + WRAP_WIDTH, NODES.alaska[1]]],
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
