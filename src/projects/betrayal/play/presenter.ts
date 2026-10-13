import type { Engine } from "../engine/step-loop";
import type { EventView, GameView } from "../engine/view";
import type { RoomFloors } from "../art/placement";
import type { FigureId } from "../types";
import { firstSpots, nextSpots, type Spots } from "./spots";
import { nextClusters, roomThings, type Clusters } from "./things";
import { traitTrack } from "./tracks";

/*
 * The presenter: each write's events turned into beats of animation in the
 * house, or a moment in the status box. It is pure: the presentation so far
 * (the view last shown, where figures stand, the rooms seen, the events
 * already played), the events now shown and the next view in, the next
 * presentation and its beats out. The state never waits on a beat: the
 * figures are already where the events put them, and a beat only shows how
 * they got there. Any input fast-forwards whatever is playing. Beats are
 * de-duplicated by event id, so an event shown twice (applied locally, then
 * confirmed) plays once, and every event, with a beat or without, is told
 * in the status box.
 */

/** How a figure crosses the house. */
export type Gait = "walk" | "run";

export type Beat =
  /** A figure walks (or runs) its route of rooms to its place in the last
   *  (`at`, in the room's own frame). A route of one room is a walk inside
   *  it: crossing a barrier room.
   *  The walks of one view play together, the active explorer's first. An
   *  explorer goes at their Speed (`speed`, its value as the walk began);
   *  any other figure (null) at the house's own pace. */
  | { kind: "walk"; figure: FigureId; route: string[]; at: readonly [x: number, z: number]; gait: Gait; speed: number | null }
  /** A room a rule moved is carried to its new cell, with everyone in it, once the walks are over. */
  | { kind: "move"; room: string }
  /** Whose turn it is changed: their light moves to them, and the camera pans there. */
  | { kind: "turn"; figure: FigureId | null }
  /** A room's first visit: the camera shows it close, with its back walls up, once its walk is over. */
  | { kind: "enter"; room: string }
  /** The haunt is revealed: the house's light shifts to the haunt's, for the rest of the game. */
  | { kind: "reveal" }
  /** A line of the status box held as a moment: for a while, or, for a card's text, until a tap. */
  | { kind: "moment"; event: string; waits: boolean };

/** How an event shows: by the beat it leads to, or (null) told in the status box only. */
export type Shown = "walk" | "move" | "turn" | "enter" | "moment" | "card" | null;

/** How every event type the engine emits shows. A new event type must be
 *  added here, and one told in words only must have words (a test holds
 *  both). Cards, rolls, stats and haunt events are moments in the box;
 *  bookkeeping, the decks and the haunt's odds and ends are words only. */
export const EVENT_SHOWS: Readonly<Record<string, Shown>> = {
  // The house: movement, rooms moved and whose turn it is.
  left: "walk",
  "room-moved": "move",
  entered: "walk",
  crossed: "walk",
  "turn-started": "turn",
  acting: "turn",
  discovered: "enter",
  // Moments: forced steps, rolls, stats, cards and the haunt.
  forced: "moment",
  rolled: "moment",
  damaged: "moment",
  "damage-converted": "moment",
  "damage-prevented": "moment",
  "trait-changed": "moment",
  stunned: "moment",
  died: "moment",
  attacked: "moment",
  "attack-outcome": "moment",
  "haunt-held-off": "moment",
  "haunt-revealed": "moment",
  "haunt-started": "moment",
  "haunt-unbuilt": "moment",
  "haunt-chosen": "moment",
  "haunt-setup": "moment",
  "game-over": "moment",
  "card-drawn": "card",
  // Words only.
  "card-gained": null,
  "card-lost": null,
  "card-marked": null,
  "card-used": null,
  "counter-changed": null,
  "deck-empty": null,
  "deck-stacked": null,
  "dog-ran": null,
  escaped: null,
  "explorer-set-up": null,
  "game-started": null,
  "movement-ended": null,
  "not-moved": null,
  "ongoing-ended": null,
  ready: null,
  recovered: null,
  "replacement-declined": null,
  "room-not-found": null,
  "room-placed": null,
  "rooms-short": null,
  "room-stack-seen": null,
  "room-stack-shuffled": null,
  "room-stayed": null,
  "search-found-nothing": null,
  "secret-revealed": null,
  "secret-set": null,
  "side-chosen": null,
  "sides-dealt": null,
  "side-set": null,
  slowed: null,
  spawned: null,
  "stack-reordered": null,
  "status-added": null,
  "status-removed": null,
  stayed: null,
  "task-result": null,
  "text-ignored": null,
  "token-placed": null,
  "token-removed": null,
  traded: null,
  "trade-declined": null,
  "trait-known": null,
  "traitor-tie": null,
  "traits-fixed": null,
  "turn-cut-short": null,
  "turn-ended": null,
  "turn-inserted": null,
  "turn-missed": null,
};

function shows(type: string): Shown {
  if (!(type in EVENT_SHOWS)) throw new Error(`The presenter has no way to show a ${type} event`);
  return EVENT_SHOWS[type];
}

/** What has been presented so far. */
export interface Presentation {
  /** Where each explorer stands. */
  spots: Spots;
  /** Where the objects lying on the floors are, clustered by room. */
  clusters: Clusters;
  /** Rooms an explorer has stood in, whose entering moment is spent. */
  visited: readonly string[];
  /** The figure whose turn it is. */
  active: FigureId | null;
  /** The haunt has been revealed, and its light shown. */
  haunted: boolean;
  /** The ids of the events already presented. */
  seen: readonly string[];
  /** The ids of the events the status box tells: the latest ones that were
   *  new. Ids, so the box words them for whoever holds the device now. */
  told: readonly string[];
}

/** The figure whose turn it is: the one acting, or the turn's seat's explorer. */
export function activeFigure(view: GameView): FigureId | null {
  const turn = view.turn;
  if (!turn) return null;
  if (turn.acting !== null) return turn.acting;
  return Object.values(view.figures).find((figure) => figure.kind === "explorer" && figure.owner === turn.seat)?.id ?? null;
}

/** How a figure crosses the house: before the haunt everyone walks; after it
 *  heroes run and the traitor walks calmly, and while a side is kept secret
 *  everyone runs, so a gait never gives a side away. */
export function gaitOf(view: GameView, figure: FigureId): Gait {
  if (view.status !== "haunt") return "walk";
  if (view.seats.some((seat) => seat.secret)) return "run";
  const owner = view.figures[figure].owner;
  return owner !== null && view.seats[owner].side === "traitor" ? "walk" : "run";
}

/** The Speed value a figure moves at: an explorer's, where the clip stands on
 *  their card's printed track, which every seat sees. The printed value, not
 *  the rules' answer, which a haunt's hidden rule may change. Any other
 *  figure has none (null): a monster's Speed can be its own side's secret. */
export function speedOf(engine: Engine, view: GameView, figure: FigureId): number | null {
  if (view.figures[figure].clips === null) return null;
  const { values, clip } = traitTrack(engine, view, figure, "speed", null);
  return values[clip];
}

const occupied = (spots: Spots) => Object.values(spots).flatMap((spot) => (spot ? [spot.room] : []));

/** The presentation of a game first shown, at its start or on a resume: no
 *  beats, its latest write told, and every room counted as seen but the
 *  starting tiles no one stands in. */
export function startPresentation(engine: Engine, view: GameView, floors: RoomFloors): Presentation {
  // The objects lie where they are first, and the figures stand round them.
  const clusters = nextClusters({}, roomThings(engine, view), {}, floors);
  const spots = firstSpots(view, floors, clusters);
  const discovered = view.board.tiles.map((tile) => tile.tile).filter((room) => engine.catalog.rooms[room].start === null);
  return {
    spots,
    clusters,
    visited: [...new Set([...discovered, ...occupied(spots)])],
    active: activeFigure(view),
    haunted: view.haunt !== null,
    seen: view.events.map((event) => event.id),
    told: view.events.map((event) => event.id),
  };
}

/** The event that puts a figure in a room it arrives at. A room discovered
 *  has the figure in it from `discovered`, while its `entered` waits until
 *  the cards drawn for the room are done (p. 9), which may be writes later,
 *  after a decision a card raised: the figure walks in, and the room shows
 *  close, at `discovered`, before the card. */
function arrival(event: EventView): { figure: FigureId; room: string } | null {
  if (event.type === "discovered") return event.data as { figure: FigureId; room: string };
  if (event.type !== "entered") return null;
  const data = event.data as { figure: FigureId; room: string; discovered?: boolean };
  return data.discovered === true ? null : data;
}

/** The rooms each figure walked through in these events, in order, from the
 *  room it left. A figure put somewhere by a rule rather than its own
 *  movement teleports, so it has no walk. */
function routesOf(events: readonly EventView[]): Map<FigureId, string[] | null> {
  const routes = new Map<FigureId, string[] | null>();
  for (const event of events) {
    if (event.type !== "left" && event.type !== "crossed" && arrival(event) === null) continue;
    const { figure, room, moved } = event.data as { figure: FigureId; room: string; moved?: boolean };
    if (moved === false) {
      routes.set(figure, null);
      continue;
    }
    if (routes.has(figure) && routes.get(figure) === null) continue;
    const route = routes.get(figure) ?? [];
    if (route.at(-1) !== room) route.push(room);
    routes.set(figure, route);
  }
  return routes;
}

/** The next presentation and its beats: `events` is every event the screen
 *  has been fed (the client's feed, as this seat may see it), of which only
 *  those not yet presented play; `next` is the view now shown. Beats come in
 *  the order they play: walks (all at once), rooms moved, whose turn it is, rooms entered
 *  for the first time, the haunt's reveal, then moments. */
export function present(engine: Engine, before: Presentation, events: readonly EventView[], next: GameView, floors: RoomFloors): { presentation: Presentation; beats: Beat[] } {
  const seen = new Set(before.seen);
  const fresh = events.filter((event) => !seen.has(event.id));
  for (const event of fresh) shows(event.type);
  const active = activeFigure(next);
  const turned = active !== before.active;
  const spots = nextSpots(before.spots, next, floors, before.clusters);
  const clusters = nextClusters(before.clusters, roomThings(engine, next), spots, floors);

  const beats: Beat[] = [];
  const routes = routesOf(fresh);
  for (const [figure, spot] of Object.entries(spots)) {
    const was = before.spots[figure];
    if (!spot || !was) continue;
    const route = routes.get(figure);
    if (route === null) continue;
    if (route !== undefined && route.length > 0) {
      if (route[0] === was.room && route.at(-1) === spot.room) beats.push({ kind: "walk", figure, route, at: [spot.x, spot.z], gait: gaitOf(next, figure), speed: speedOf(engine, next, figure) });
      continue;
    }
    if (spot.room === was.room && spot.side !== was.side) beats.push({ kind: "walk", figure, route: [spot.room], at: [spot.x, spot.z], gait: gaitOf(next, figure), speed: speedOf(engine, next, figure) });
  }
  for (const event of fresh) if (event.type === "room-moved") beats.push({ kind: "move", room: (event.data as { tile: string }).tile });
  if (turned) beats.push({ kind: "turn", figure: active });

  const visited = new Set(before.visited);
  for (const event of fresh) {
    const arrived = arrival(event);
    if (arrived === null) continue;
    const { figure, room } = arrived;
    if (visited.has(room) || spots[figure]?.room !== room) continue;
    visited.add(room);
    beats.push({ kind: "enter", room });
  }
  for (const room of occupied(spots)) visited.add(room);
  const haunted = next.haunt !== null;
  if (haunted && !before.haunted) beats.push({ kind: "reveal" });

  for (const event of fresh) {
    const shown = shows(event.type);
    if (shown === "moment" || shown === "card") beats.push({ kind: "moment", event: event.id, waits: shown === "card" });
  }

  return {
    presentation: {
      spots,
      clusters,
      visited: [...visited],
      active,
      haunted,
      seen: events.map((event) => event.id),
      told: fresh.length > 0 ? fresh.map((event) => event.id) : before.told,
    },
    beats,
  };
}
