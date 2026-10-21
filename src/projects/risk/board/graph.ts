import type { Point } from "@/shared/lib/input";
import type { GameView } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import type { Rect, Stretch } from "../ui/camera";
import { shortName } from "../ui/short-names";
import { BORDERS, GRAPH_WIDTH, NODES, REGION_PAD } from "./graph-layout";
import { LABEL_WIDTHS } from "./label-widths";

/*
 * The board as a graph, pure: where territories sit, what each draws round its place, the lines
 * and regions drawn between them, and the way a fortifying army marches.
 */

/** A territory's marker and the short name under it, in board units (neighbours are about
 *  `GRAPH_UNIT` apart). */
export const MARKER = 62;
export const NAME_SIZE = 21;
/** Where the short name's letters start below a territory's middle. */
export const NAME_Y = MARKER / 2 + 8;
/** The ring a territory on offer or chosen lights, and how far its stroke reaches. */
export const LIT_RING = MARKER * 0.78;
const RING_REACH = LIT_RING + 4;
/** The name's box, below the middle, halo included. */
const NAME_BOX = { top: 32, bottom: 64, halo: 2.5 };

const nameHalf = (id: TerritoryId) => LABEL_WIDTHS[shortName(id)] / 2 + NAME_BOX.halo;

/** A territory's name's box, in board units from its middle. */
export function nameBox(id: TerritoryId): Rect {
  const half = nameHalf(id);
  return { left: -half, right: half, top: NAME_BOX.top, bottom: NAME_BOX.bottom };
}

/** What each territory draws round its place, its lit ring and name included, in board units
 *  from it: the part of the board an overlay must not cover. */
export const DRAWS: Readonly<Record<TerritoryId, Rect>> = Object.fromEntries(
  (Object.keys(NODES) as TerritoryId[]).map((id) => {
    const half = Math.max(RING_REACH, nameHalf(id));
    return [id, { left: -half, right: half, top: -RING_REACH, bottom: NAME_BOX.bottom }];
  }),
) as Record<TerritoryId, Rect>;

/** Everything a territory draws keeps clear of everything another draws: no lit ring over
 *  another ring or name, no two names meeting. Each clash, for the tests to name. */
export function clashes(nodes: Readonly<Record<TerritoryId, readonly [number, number]>>): string[] {
  const ids = Object.keys(nodes) as TerritoryId[];
  const out: string[] = [];
  const boxAt = (id: TerritoryId) => {
    const box = nameBox(id);
    const [x, y] = nodes[id];
    return { left: x + box.left, right: x + box.right, top: y + box.top, bottom: y + box.bottom };
  };
  for (const a of ids) {
    const box = boxAt(a);
    for (const b of ids) {
      if (a === b) continue;
      const [x, y] = nodes[b];
      const nearest = Math.hypot(x - Math.min(Math.max(x, box.left), box.right), y - Math.min(Math.max(y, box.top), box.bottom));
      if (nearest < RING_REACH) out.push(`${b}'s ring over ${a}'s name`);
      if (a < b) {
        const [ax, ay] = nodes[a];
        if (Math.hypot(x - ax, y - ay) < 2 * RING_REACH) out.push(`${a}'s and ${b}'s rings`);
        const other = boxAt(b);
        if (box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom) out.push(`${a}'s and ${b}'s names`);
      }
    }
  }
  return out;
}

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

type Pair = readonly [number, number];
type Segment = readonly [Pair, Pair];

/** The board as drawn at a stretch: its places spread apart, and the regions round them. */
export interface Layout {
  nodes: Readonly<Record<TerritoryId, Pair>>;
  regions: Readonly<Record<ContinentId, string>>;
  /** How far across the board repeats, wrapping. */
  width: number;
}

const cross = (o: Pair, a: Pair, b: Pair) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export function hull(points: readonly Pair[]): Pair[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (from: Pair[]) => {
    const out: Pair[] = [];
    for (const p of from) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** A continent's region: its territories' convex hull grown by `REGION_PAD`, with round corners,
 *  as an SVG path. It is drawn round the places as they sit, so a stretch keeps its corners round. */
function regionPath(points: readonly Pair[]): string {
  const h = hull(points);
  const n = h.length;
  const outward = (a: Pair, b: Pair): Pair => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  const at = (p: Pair, v: Pair) => `${(p[0] + v[0] * REGION_PAD).toFixed(0)} ${(p[1] + v[1] * REGION_PAD).toFixed(0)}`;
  const corners = h.map((p, i) => ({ p, before: outward(h[(i - 1 + n) % n], p), after: outward(p, h[(i + 1) % n]) }));
  let d = `M${at(corners[0].p, corners[0].after)}`;
  for (let i = 1; i <= n; i++) {
    const { p, before, after } = corners[i % n];
    d += `L${at(p, before)}A${REGION_PAD} ${REGION_PAD} 0 0 1 ${at(p, after)}`;
  }
  return `${d}Z`;
}

const layouts = new Map<string, Layout>();

export function layoutAt(stretch: Stretch): Layout {
  const key = `${stretch.x}|${stretch.y}`;
  const known = layouts.get(key);
  if (known) return known;
  const nodes = Object.fromEntries(Object.entries(NODES).map(([id, [x, y]]) => [id, [x * stretch.x, y * stretch.y] as const])) as Record<TerritoryId, Pair>;
  const regions = Object.fromEntries(CONTINENTS.map((c) => [c.id, regionPath(TERRITORIES.filter((t) => t.continent === c.id).map((t) => nodes[t.id]))])) as Record<ContinentId, string>;
  const layout = { nodes, regions, width: GRAPH_WIDTH * stretch.x };
  layouts.set(key, layout);
  return layout;
}

/** The straight lines a border is drawn as: one, or Alaska–Kamchatka's two, each from one end
 *  across the board's edge to where the other end's copy is. */
export function borderLines(a: TerritoryId, b: TerritoryId, { nodes, width }: Layout): readonly Segment[] {
  if (!isWrap(a, b)) return [[nodes[a], nodes[b]]];
  return [
    [nodes.alaska, [nodes.kamchatka[0] - width, nodes.kamchatka[1]]],
    [nodes.kamchatka, [nodes.alaska[0] + width, nodes.alaska[1]]],
  ];
}

/** Every line the board draws unstretched, each with the border it belongs to. */
export const DRAWN = BORDERS.flatMap(([a, b]) => borderLines(a, b, layoutAt({ x: 1, y: 1 })).map((line) => ({ border: [a, b] as const, line })));

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
