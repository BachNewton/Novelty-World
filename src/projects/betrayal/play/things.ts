import { placeFigures, type RoomFloors } from "../art/placement";
import { FLOOR_RINGS } from "../art/room";
import { TOKENS } from "../data/tokens";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import type { Edge, Place, RoomTile } from "../types";
import { cardMood, type Mood } from "./cards";
import type { Spot, Spots } from "./spots";

/*
 * Things that live in rooms, as the presentation sees them: every dropped
 * card and every token the game puts in a room, in one of three kinds.
 *
 * - An object lies on the floor: a small model on a plate in its card's
 *   colour, placed by the placement solver as one more size class. A
 *   room's (or a barrier room half's) objects cluster on one spot, which
 *   keeps its place until the last of them goes.
 * - A room effect changes the room's air or light, sized to the tile.
 * - A connection is a mark on the tile's edge, or on its floor, that links
 *   the room somewhere else.
 *
 * Which kind a token is, and the colour it shows in, is data (`PRESENCE`),
 * one entry per token kind: a new token is an entry here and its look in
 * `art/things/looks.ts`, never a change to the system.
 */

export type ThingKind = "object" | "effect" | "connection";

/** Where a token's colour comes from: the card that places it, or a mood of its own. */
export type ThingColour = { card: string } | { mood: Mood };

/** How a token kind shows in the house. A monster token is a figure, never a
 *  thing in a room; a trait roll token kept as a haunt's tally lies in the
 *  room it is put in, as an object. */
export type Presence =
  | { kind: "object"; colour: ThingColour }
  | { kind: "effect"; colour: ThingColour }
  /** A connection's mark: on the tile's edge (a wall stub), or on its floor. */
  | { kind: "connection"; on: "edge" | "floor"; colour: ThingColour }
  | { kind: "figure" };

const card = (id: string): ThingColour => ({ card: id });
const mood = (of: Mood): ThingColour => ({ mood: of });

/** Every token kind of both sets (`data/tokens.ts`), by id, and how it shows. */
export const PRESENCE: Readonly<Record<string, Presence>> = {
  // Square event and room tokens, base.
  blessing: { kind: "effect", colour: card("a-moment-of-hope") },
  drip: { kind: "effect", colour: card("drip-drip-drip") },
  smoke: { kind: "effect", colour: card("smoke") },
  closet: { kind: "object", colour: card("closet-door") },
  safe: { kind: "object", colour: card("locked-safe") },
  skeletons: { kind: "object", colour: card("skeletons") },
  "vault-empty": { kind: "object", colour: mood("human") },
  "secret-passage": { kind: "connection", on: "edge", colour: card("secret-passage") },
  "secret-stairs": { kind: "connection", on: "edge", colour: card("secret-stairs") },
  "wall-switch": { kind: "connection", on: "edge", colour: card("revolving-wall") },
  slide: { kind: "connection", on: "floor", colour: card("mystic-slide") },
  "below-collapsed-room": { kind: "connection", on: "floor", colour: mood("moon") },
  // Square tokens, Widow's Walk. A Lock sits on a door, a Plant on the Tree House's door or in a room.
  "burial-mound": { kind: "object", colour: card("burial-mound") },
  plant: { kind: "object", colour: card("flytrap") },
  lock: { kind: "connection", on: "edge", colour: mood("human") },
  obstacle: { kind: "object", colour: mood("danger") },
  fountain: { kind: "object", colour: mood("moon") },
  // Pentagonal item tokens: a haunt's numbered objects, and a pile of dropped cards.
  item: { kind: "object", colour: mood("human") },
  "item-pile": { kind: "object", colour: mood("human") },
  // Triangular trait roll tokens, where a haunt leaves them in a room.
  "knowledge-roll": { kind: "object", colour: mood("magic") },
  "might-roll": { kind: "object", colour: mood("magic") },
  "sanity-roll": { kind: "object", colour: mood("magic") },
  "speed-roll": { kind: "object", colour: mood("magic") },
  // Widow's Walk explorer tokens: a room power used, left in the room.
  ...Object.fromEntries(TOKENS.filter((token) => token.id.startsWith("explorer-")).map((token) => [token.id, { kind: "object", colour: mood("human") } satisfies Presence])),
  // Monster tokens stand for figures.
  ...Object.fromEntries(TOKENS.filter((token) => token.id.startsWith("monster-")).map((token) => [token.id, { kind: "figure" } satisfies Presence])),
};

export function presenceOf(token: string): Presence {
  if (!(token in PRESENCE)) throw new Error(`No presence for the ${token} token: add it to PRESENCE`);
  return PRESENCE[token];
}

/** The mood a token shows in: its placing card's, or its own. */
export function tokenMood(engine: Engine, token: string): Mood {
  const presence = presenceOf(token);
  if (presence.kind === "figure") throw new Error(`The ${token} token is a figure, not a thing in a room`);
  return "card" in presence.colour ? cardMood(engine, presence.colour.card) : presence.colour.mood;
}

/** One thing living in a room. Its id is stable while it stays where it is. */
export interface RoomThing {
  id: string;
  kind: ThingKind;
  room: string;
  /** In a barrier room, the half it lies in; null for the whole room. */
  side: Edge | null;
  name: string;
  /** The card behind it: the card itself, lying on the floor, or the card that placed the token. */
  card: string | null;
  /** The token kind, for a token. */
  token: string | null;
  mood: Mood;
  /** A connection's edges, when the game puts it on a wall: one edge, or the two of a corner. */
  wall: readonly Edge[] | null;
  /** Where a linked connection's other end is. */
  link: Place | null;
  /** It lies on the floor, placed in its room's cluster: an object, or a connection marked on the floor. */
  lies: boolean;
}

const TOKEN_NAMES = new Map(TOKENS.map((token) => [token.id, token.name]));

const tokenName = (token: string) => {
  const name = TOKEN_NAMES.get(token);
  if (name === undefined) throw new Error(`No token kind ${token}`);
  return name;
};

/** The id of a card lying on a floor: the object in the room and the sheet's Pick up name it alike. */
export const cardThingId = (card: string) => `card:${card}`;

/** Everything living in the house's rooms, in the view's order: dropped cards, then tokens. */
export function roomThings(engine: Engine, view: Pick<GameView, "piles" | "tokens">): RoomThing[] {
  const cards = Object.entries(view.piles).flatMap(([room, pile]) =>
    pile.map((id): RoomThing => ({ id: cardThingId(id), kind: "object", room, side: null, name: engine.catalog.cards[id].name, card: id, token: null, mood: cardMood(engine, id), wall: null, link: null, lies: true })),
  );
  const counts = new Map<string, number>();
  const tokens = view.tokens.flatMap((token): RoomThing[] => {
    // A token that goes wherever a figure goes (the Dog) is the figure's, not the room's.
    if (token.holder !== undefined) return [];
    const presence = presenceOf(token.token);
    if (presence.kind === "figure") return [];
    const key = `${token.token}:${token.room}`;
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const placer = "card" in presence.colour ? presence.colour.card : null;
    return [
      {
        id: `token:${key}:${n}`,
        kind: presence.kind,
        room: token.room,
        side: token.side ?? null,
        name: tokenName(token.token),
        card: placer,
        token: token.token,
        mood: tokenMood(engine, token.token),
        wall: token.wall ?? null,
        link: token.link ?? null,
        lies: presence.kind === "object" || (presence.kind === "connection" && presence.on === "floor"),
      },
    ];
  });
  return [...cards, ...tokens];
}

// ---- Objects: clustered on one spot per room (or half) ----

/** How many objects a cluster shows one by one; past it, the last place shows the rest as a pile, with a count. */
export const CLUSTER_SHOWN = 4;

/** Plates in a cluster lie side by side, rims just apart. */
const PLATE_STEP = FLOOR_RINGS.plate.radius + 0.01;
const TRIANGLE = (2 * PLATE_STEP) / Math.sqrt(3);

/** Where each object stands in its cluster, from the cluster's spot, in metres: one in the middle, then round it. */
const SLOTS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [
    [-PLATE_STEP, 0],
    [PLATE_STEP, 0],
  ],
  3: [
    [0, -TRIANGLE],
    [-PLATE_STEP, TRIANGLE / 2],
    [PLATE_STEP, TRIANGLE / 2],
  ],
  4: [
    [-PLATE_STEP, -PLATE_STEP],
    [PLATE_STEP, -PLATE_STEP],
    [-PLATE_STEP, PLATE_STEP],
    [PLATE_STEP, PLATE_STEP],
  ],
};

/** How far a cluster of `count` objects reaches from its middle to its outermost plate's edge. */
export function clusterReach(count: number): number {
  const slots = SLOTS[Math.min(count, CLUSTER_SHOWN)];
  return Math.max(...slots.map(([x, z]) => Math.hypot(x, z))) + FLOOR_RINGS.plate.radius;
}

/** A cluster of objects on the floor: its spot, and its objects, longest there first. */
export interface Cluster extends Spot {
  things: readonly string[];
  /** How far its plates reach from its spot. */
  reach: number;
}

export type Clusters = Readonly<Record<string, Cluster>>;

export const clusterId = (room: string, side: Edge | null) => `objects:${room}${side === null ? "" : `:${side}`}`;

/** One object as a cluster shows it: an object of its own, or the pile of the rest. */
export interface ShownObject {
  /** The object's id, or the cluster's for the pile of the rest. */
  id: string;
  /** The objects it stands for: one, or the rest. */
  things: readonly string[];
  /** Where it lies, in the room's own frame. */
  at: readonly [x: number, z: number];
}

/** What a cluster shows: each object in its place, or, past `CLUSTER_SHOWN`, the first few and the pile of the rest. */
export function shownObjects(cluster: Cluster): ShownObject[] {
  const all = cluster.things;
  const singles = all.length <= CLUSTER_SHOWN ? all : all.slice(0, CLUSTER_SHOWN - 1);
  const rest = all.slice(singles.length);
  const shown = [...singles.map((id) => ({ id, things: [id] })), ...(rest.length > 0 ? [{ id: clusterIdOf(cluster), things: rest }] : [])];
  const slots = SLOTS[shown.length];
  return shown.map((object, i) => ({ ...object, at: [cluster.x + slots[i][0], cluster.z + slots[i][1]] as const }));
}

const clusterIdOf = (cluster: Cluster) => clusterId(cluster.room, cluster.side);

/**
 * The clusters after a view, from those before it. A cluster keeps its spot
 * and the order of its objects; new objects join the end; a cluster whose
 * objects have all gone goes. A new cluster is placed by the solver round
 * the figures standing there, as an object: off the doorways, the lanes and
 * the prime place.
 */
export function nextClusters(before: Clusters, things: readonly RoomThing[], spots: Spots, floors: RoomFloors): Clusters {
  const wanted = new Map<string, { room: string; side: Edge | null; things: string[] }>();
  for (const thing of things) {
    if (!thing.lies) continue;
    const id = clusterId(thing.room, thing.side);
    const cluster = wanted.get(id);
    if (cluster) cluster.things.push(thing.id);
    else wanted.set(id, { room: thing.room, side: thing.side, things: [thing.id] });
  }
  const next: Record<string, Cluster> = {};
  for (const [id, { room, side, things: now }] of wanted) {
    const was = Object.hasOwn(before, id) ? before[id] : null;
    if (was) {
      const kept = was.things.filter((thing) => now.includes(thing));
      const things = [...kept, ...now.filter((thing) => !kept.includes(thing))];
      next[id] = { ...was, things, reach: clusterReach(things.length) };
      continue;
    }
    const standing = Object.entries(spots).flatMap(([figure, spot]) => (spot && spot.room === room ? [[figure, spot] as const] : []));
    const { floor, hints } = floors(room, side);
    const reach = clusterReach(now.length);
    const placement = placeFigures(floor, hints, [...standing.map(([figure]) => ({ id: figure, size: "person" as const })), { id, size: "object", reach }], Object.fromEntries(standing));
    next[id] = { ...placement.figures[id], room, side, things: now, reach };
  }
  return next;
}

/** The rooms things lie in: their floors must be read before the things are placed on them. */
export function lyingRooms(things: readonly RoomThing[]): string[] {
  return [...new Set(things.filter((thing) => thing.lies).map((thing) => thing.room))];
}

// ---- Where each thing shows ----

/** Where a mark on a tile's edge goes, in the room's own frame: the edge (as printed) and how far along it from its middle, positive to the right facing the wall. */
export interface EdgeSpot {
  edge: Edge;
  along: number;
}

/** How far a mark on a wall keeps from the middle of a doorway or a window on it, in metres. */
const BESIDE_OPENING = 1.8;
/** How far into a corner a mark on two walls goes, from the middle of its first wall. */
const INTO_CORNER = 2.2;
const ALONG_AXIS: Record<Edge, readonly [x: number, z: number]> = { top: [1, 0], right: [0, 1], bottom: [-1, 0], left: [0, -1] };
const TOWARD_EDGE: Record<Edge, readonly [x: number, z: number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const PRINTED: readonly Edge[] = ["top", "right", "bottom", "left"];

/** Where a connection's mark goes on its room's walls: on the edge the game
 *  puts it (in a corner, along the first edge towards the second), or else
 *  on the first plain wall, beside a window, or beside a doorway when every
 *  wall has one. */
export function edgeSpot(tile: Pick<RoomTile, "doors" | "passages" | "windows">, wall: readonly Edge[] | null): EdgeSpot {
  if (wall !== null && wall.length > 0) return wallSpot(wall);
  const open = (edge: Edge) => tile.doors.includes(edge) || tile.passages.includes(edge);
  const plain = PRINTED.find((edge) => !open(edge));
  if (plain !== undefined) return { edge: plain, along: tile.windows.includes(plain) ? -BESIDE_OPENING : 0 };
  return { edge: "top", along: -BESIDE_OPENING };
}

/** Where a mark the game puts on a wall goes: in the middle of a wall, or in
 *  a corner, along its first edge towards the second. */
export function wallSpot(wall: readonly Edge[]): EdgeSpot {
  const [edge, corner] = wall;
  if (wall.length === 1) return { edge, along: 0 };
  const [ax, az] = ALONG_AXIS[edge];
  const [tx, tz] = TOWARD_EDGE[corner];
  return { edge, along: Math.sign(ax * tx + az * tz) * INTO_CORNER };
}

export type ThingPlace =
  /** On the floor, in the room's own frame: an object, a pile of the rest, or a connection marked on the floor. */
  | { kind: "floor"; at: readonly [x: number, z: number] }
  /** Over the whole tile. */
  | { kind: "tile" }
  /** On a wall. */
  | { kind: "edge"; spot: EdgeSpot };

/** A thing as the house draws it. A pile of the rest stands for several objects. */
export interface ShownThing {
  id: string;
  /** The thing's own kind; a pile is an object. */
  kind: ThingKind;
  room: string;
  name: string;
  mood: Mood;
  card: string | null;
  token: string | null;
  /** The things it stands for: itself, or the objects of a pile. */
  things: readonly string[];
  place: ThingPlace;
}

/** Every thing in the house as it shows: objects and floor marks in their clusters, room effects over their tiles, connections on their walls. */
export function shownThings(engine: Engine, things: readonly RoomThing[], clusters: Clusters): ShownThing[] {
  const byId = new Map(things.map((thing) => [thing.id, thing]));
  const lying = Object.values(clusters).flatMap((cluster) =>
    shownObjects(cluster).map((object): ShownThing => {
      const thing = byId.get(object.things[0]);
      if (!thing) throw new Error(`The cluster in ${cluster.room} holds ${object.things[0]}, which isn't in the house`);
      if (object.things.length === 1) return { ...shown(thing), things: object.things, place: { kind: "floor", at: object.at } };
      return { id: object.id, kind: "object", room: cluster.room, name: `${object.things.length} more`, mood: thing.mood, card: null, token: null, things: object.things, place: { kind: "floor", at: object.at } };
    }),
  );
  const standing = things.flatMap((thing): ShownThing[] => {
    if (thing.lies) return [];
    if (thing.kind === "effect") return [{ ...shown(thing), things: [thing.id], place: { kind: "tile" } }];
    return [{ ...shown(thing), things: [thing.id], place: { kind: "edge", spot: edgeSpot(engine.catalog.rooms[thing.room], thing.wall) } }];
  });
  return [...lying, ...standing];
}

function shown(thing: RoomThing): Omit<ShownThing, "things" | "place"> {
  return { id: thing.id, kind: thing.kind, room: thing.room, name: thing.name, mood: thing.mood, card: thing.card, token: thing.token };
}
