import { describeEvent } from "../engine/describe";
import type { Engine } from "../engine/step-loop";
import type { EventView, GameView } from "../engine/view";
import type { RoomFloors } from "../art/placement";
import type { FigureId } from "../types";
import { statChanges } from "./cards";
import { firstSpots, nextSpots, type Spots } from "./spots";
import { nextClusters, roomThings, type Clusters } from "./things";
import { traitTrack } from "./tracks";

/*
 * The presenter: each write's events cut into beats, in the order the events
 * happened, each beat naming the events it shows. It is pure: the
 * presentation so far (where figures stand, the events already played), the
 * events now shown and the next view in, the next presentation and its beats
 * out. The state never waits on a beat: the figures are already where the
 * events put them, and a beat only shows how they got there. Every event
 * belongs to one beat at most; one with nothing to show is silent. A beat
 * shows in the house, with at most one line of the status box: the box never
 * tells an event before its beat plays, nor after. Beats are de-duplicated by
 * event id, so an event shown twice (applied locally, then confirmed) plays
 * once.
 */

/** How a figure crosses the house. */
export type Gait = "walk" | "run";

/** A figure walking (or running) its route of rooms to its place in the
 *  last (`at`, in the room's own frame). A route of one room is a walk
 *  inside it: crossing a barrier room. An explorer goes at their Speed
 *  (`speed`, its value as the walk began); any other figure (null) at the
 *  house's own pace. */
export interface Walk {
  figure: FigureId;
  route: string[];
  at: readonly [x: number, z: number];
  gait: Gait;
  speed: number | null;
}

/** How a line of the status box shows: its dice turning up, a gain or loss
 *  floating over the figure, a card's text waiting for a tap, or its words
 *  alone, which hold nothing up. */
export type LineShow = "dice" | "float" | "card" | "words";

export type Beat = { events: readonly string[] } & (
  /** Figures walk their routes, together, the active explorer's first. */
  | { kind: "walk"; walks: Walk[] }
  /** Figures a rule put somewhere, with no walk, stand there. */
  | { kind: "place"; figures: FigureId[] }
  /** A room a rule moved is carried to its new cell, with everyone in it. */
  | { kind: "move"; room: string }
  /** Whose turn it is changed: their light moves to them, and the camera pans there. */
  | { kind: "turn"; figure: FigureId | null }
  /** The haunt is revealed: the house's light shifts to the haunt's, told by its line when it has one. */
  | { kind: "reveal"; line: string | null }
  /** An event told by a line of the status box. */
  | { kind: "line"; line: string; show: LineShow }
);

/** How an event type shows: in the house (a walk, a room moved, the turn,
 *  the reveal), as a line, or (null) silent: bookkeeping the house or the
 *  screen already shows, or with nothing to show. */
export type Shown = "walk" | "move" | "turn" | "reveal" | "line" | null;

/** How every event type the engine emits shows. A new event type must be
 *  added here, and one shown as a line must have words (a test holds both). */
export const EVENT_SHOWS: Readonly<Record<string, Shown>> = {
  // The house.
  left: "walk",
  entered: "walk",
  crossed: "walk",
  discovered: "walk",
  "room-moved": "move",
  "turn-started": "turn",
  acting: "turn",
  "haunt-revealed": "reveal",
  // Lines: rolls, stats, cards, forced steps and the haunt.
  forced: "line",
  rolled: "line",
  damaged: "line",
  "damage-converted": "line",
  "damage-prevented": "line",
  "trait-changed": "line",
  stunned: "line",
  died: "line",
  attacked: "line",
  "attack-outcome": "line",
  "haunt-held-off": "line",
  "haunt-started": "line",
  "haunt-unbuilt": "line",
  "haunt-chosen": "line",
  "haunt-setup": "line",
  "game-over": "line",
  "card-drawn": "line",
  "card-marked": "line",
  "card-used": "line",
  "counter-changed": "line",
  "deck-empty": "line",
  "dog-ran": "line",
  escaped: "line",
  "not-moved": "line",
  "ongoing-ended": "line",
  recovered: "line",
  "replacement-declined": "line",
  "room-not-found": "line",
  "rooms-short": "line",
  "room-stack-seen": "line",
  "room-stack-shuffled": "line",
  "search-found-nothing": "line",
  "secret-revealed": "line",
  "secret-set": "line",
  slowed: "line",
  spawned: "line",
  "stack-reordered": "line",
  "task-result": "line",
  "text-ignored": "line",
  traded: "line",
  "trade-declined": "line",
  "trait-known": "line",
  "traitor-tie": "line",
  "traits-fixed": "line",
  "turn-cut-short": "line",
  "turn-inserted": "line",
  "turn-missed": "line",
  // Silent: the house, a card's title, the marks or the reveal show these, or there is nothing to show.
  "card-gained": null,
  "card-lost": null,
  "deck-stacked": null,
  "explorer-set-up": null,
  "game-started": null,
  "movement-ended": null,
  ready: null,
  "room-placed": null,
  "room-stayed": null,
  "side-chosen": null,
  "sides-dealt": null,
  "side-set": null,
  "status-added": null,
  "status-removed": null,
  stayed: null,
  "token-placed": null,
  "token-removed": null,
  "turn-ended": null,
};

function shows(type: string): Shown {
  if (!(type in EVENT_SHOWS)) throw new Error(`The presenter has no way to show a ${type} event`);
  return EVENT_SHOWS[type];
}

/** How a line shows, or null for one with nothing to say: a room placed the
 *  only way it fits, which its appearing already showed, or an event with no
 *  words for this seat. */
function lineShow(engine: Engine, view: GameView, event: EventView): LineShow | null {
  if (event.type === "forced" && (event.data as { kind?: string }).kind === "rotation") return null;
  if (describeEvent(engine, view, event) === null) return null;
  if (event.type === "card-drawn") return "card";
  if (event.type === "rolled") {
    const { dice, named } = event.data as { dice: number[]; named: number | null };
    return named === null && dice.length > 0 ? "dice" : "words";
  }
  return statChanges([event]).length > 0 ? "float" : "words";
}

/** What has been presented so far. */
export interface Presentation {
  /** Where each explorer stands. */
  spots: Spots;
  /** Where the objects lying on the floors are, clustered by room. */
  clusters: Clusters;
  /** The figure whose turn it is. */
  active: FigureId | null;
  /** The haunt has been revealed, and its light shown. */
  haunted: boolean;
  /** The ids of the events already presented. */
  seen: readonly string[];
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

/** The presentation of a game first shown, at its start or on a resume: no beats, and its events counted as played. */
export function startPresentation(engine: Engine, view: GameView, floors: RoomFloors): Presentation {
  // The objects lie where they are first, and the figures stand round them.
  const clusters = nextClusters({}, roomThings(engine, view), {}, floors);
  return {
    spots: firstSpots(view, floors, clusters),
    clusters,
    active: activeFigure(view),
    haunted: view.haunt !== null,
    seen: view.events.map((event) => event.id),
  };
}

/** The event that puts a figure in a room it arrives at. A room discovered
 *  has the figure in it from `discovered`, while its `entered`, the room's
 *  own rule applying, waits until the cards drawn for the room are done
 *  (p. 9), which may be writes later, after a decision a card raised: the
 *  figure walks in at `discovered`, before the card. */
function arrival(event: EventView): { figure: FigureId; room: string } | null {
  if (event.type === "discovered") return event.data as { figure: FigureId; room: string };
  if (event.type !== "entered") return null;
  const data = event.data as { figure: FigureId; room: string; discovered?: boolean };
  return data.discovered === true ? null : data;
}

/** The rooms each figure walked through in these events, in order, from the
 *  room it left, with the events of its movement. A figure put somewhere by
 *  a rule rather than its own movement has no route (null): it stands there. */
function routesOf(events: readonly EventView[]): Map<FigureId, { route: string[] | null; events: string[] }> {
  const routes = new Map<FigureId, { route: string[] | null; events: string[] }>();
  for (const event of events) {
    if (event.type !== "left" && event.type !== "crossed" && arrival(event) === null) continue;
    const { figure, room, moved } = event.data as { figure: FigureId; room: string; moved?: boolean };
    const entry = routes.get(figure) ?? { route: [], events: [] };
    entry.events.push(event.id);
    if (moved === false) entry.route = null;
    else if (entry.route !== null && entry.route.at(-1) !== room) entry.route.push(room);
    routes.set(figure, entry);
  }
  return routes;
}

/** The next presentation and its beats: `events` is every event the screen
 *  has been fed (the client's feed, as this seat may see it), of which only
 *  those not yet presented play; `next` is the view now shown. Each beat
 *  stands where its first event happened, so the beats play in the order
 *  the events did. */
export function present(engine: Engine, before: Presentation, events: readonly EventView[], next: GameView, floors: RoomFloors): { presentation: Presentation; beats: Beat[] } {
  const seen = new Set(before.seen);
  const fresh = events.filter((event) => !seen.has(event.id));
  for (const event of fresh) shows(event.type);
  const at = new Map(fresh.map((event, i) => [event.id, i]));
  const active = activeFigure(next);
  const spots = nextSpots(before.spots, next, floors, before.clusters);
  const clusters = nextClusters(before.clusters, roomThings(engine, next), spots, floors);

  /** Beats, each with where it stands in the events. */
  const placed: { order: number; beat: Beat }[] = [];
  const add = (beat: Beat, order = beat.events.length > 0 ? Math.min(...beat.events.map((id) => at.get(id) ?? Infinity)) : Infinity) => {
    placed.push({ order, beat });
  };

  const routes = routesOf(fresh);
  const walks: Walk[] = [];
  const walked: string[] = [];
  const stood: FigureId[] = [];
  const stoodEvents: string[] = [];
  for (const [figure, spot] of Object.entries(spots)) {
    const was = before.spots[figure];
    if (!spot || !was) continue;
    const moved = routes.get(figure);
    const walk = (route: string[]) => ({ figure, route, at: [spot.x, spot.z] as const, gait: gaitOf(next, figure), speed: speedOf(engine, next, figure) });
    if (moved?.route === null) {
      stood.push(figure);
      stoodEvents.push(...moved.events);
    } else if (moved !== undefined && moved.route.length > 0) {
      if (moved.route[0] === was.room && moved.route.at(-1) === spot.room) {
        walks.push(walk(moved.route));
        walked.push(...moved.events);
      }
    } else if (spot.room === was.room && spot.side !== was.side) walks.push(walk([spot.room]));
  }
  // The active explorer walks first.
  walks.sort((a, b) => Number(b.figure === active) - Number(a.figure === active));
  if (walks.length > 0) add({ kind: "walk", walks, events: walked }, walked.length > 0 ? undefined : -1);
  if (stood.length > 0) add({ kind: "place", figures: stood, events: stoodEvents });

  for (const event of fresh) if (event.type === "room-moved") add({ kind: "move", room: (event.data as { tile: string }).tile, events: [event.id] });

  const turns = fresh.filter((event) => shows(event.type) === "turn").map((event) => event.id);
  if (active !== before.active) add({ kind: "turn", figure: active, events: turns });

  const haunted = next.haunt !== null;
  const revealed = fresh.find((event) => event.type === "haunt-revealed");
  if (haunted && !before.haunted) add({ kind: "reveal", line: revealed?.id ?? null, events: revealed ? [revealed.id] : [] });
  else if (revealed) add({ kind: "line", line: revealed.id, show: "words", events: [revealed.id] });

  for (const event of fresh) {
    if (shows(event.type) !== "line") continue;
    const show = lineShow(engine, next, event);
    if (show !== null) add({ kind: "line", line: event.id, show, events: [event.id] });
  }

  return {
    presentation: { spots, clusters, active, haunted, seen: events.map((event) => event.id) },
    beats: placed.sort((a, b) => a.order - b.order).map(({ beat }) => beat),
  };
}

/** The event a beat's line tells, or null for a beat with none. */
export function beatLine(beat: Beat): string | null {
  return beat.kind === "line" || beat.kind === "reveal" ? beat.line : null;
}
