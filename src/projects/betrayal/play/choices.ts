import type { Action, Edge, FloorId, Json, Rotation } from "../types";
import { doorwaySpot, EDGES, type Doorway, type Layout } from "../engine/board";
import type { TurnChoice } from "../engine/exploration";
import type { Choice } from "../engine/step-loop";
import type { PlaceChoice } from "../engine/tiles";
import type { GameView } from "../engine/view";
import type { Lookahead, Reach } from "./lookahead";
import { routePreview, type RoutePreview } from "./preview";

/*
 * The pending decision, split by where it is answered: choices about a place
 * become targets in the house, a room tile to place becomes a ghost of it in
 * the house, and everything else goes to the panel, with ending the turn as
 * an action of its own. Each carries the action that answers it. A target's
 * id names the choice, never the room: one room can carry several targets.
 */

/** A choice the house offers, with the place it marks: a room a move can
 *  reach, or an empty cell to explore, through an unexplored doorway of the
 *  room the turn stands in or of one it can reach first. `actions` answer the decisions on the way there, in
 *  order: one for a step next door. A room on another floor shows as the way
 *  there where its route takes the stairs. A choice among options offers the
 *  rooms its options name the same way, each one action with no route. */
export type PlaceTarget = {
  id: string;
  label: string;
  actions: Action[];
  /** The route, its cost and the rules it sets off; null where the turn's
   *  lookahead wasn't worked out, and a choice is then one step. */
  preview: RoutePreview | null;
} & (
  /** A move into `room`, on `side` of a barrier room. */
  | { kind: "room"; room: string; side: Edge | null }
  /** Exploring the empty `cell`, through the unexplored doorway of `room`
   *  on a board direction: of the doorways onto it, the one the turn reaches cheapest. */
  | { kind: "explore"; cell: Spot; room: string; direction: Edge }
);

/** A choice the panel offers: the engine's choice and label, and its action. */
export type PanelChoice = Choice & { id: string; action: Action };

/** One way round a tile may be placed on a cell, and the action placing it so. */
export interface GhostOption {
  rotation: Rotation;
  label: string;
  action: Action;
}

/** A cell a tile may go on, with the ways round it may go there. */
export interface GhostCell {
  spot: Spot;
  options: GhostOption[];
}

/** A room tile to place: discovered (one cell, its ways round) or moved by a
 *  rule (any of several cells). The house shows it as a ghost on the cell
 *  chosen, turned the way chosen, until the player places it. */
export interface GhostChoice {
  tile: string;
  cells: GhostCell[];
  /** Leaving a tile already in the house where it is, when the rule allows it. */
  stay: PanelChoice | null;
}

export interface PlayChoices {
  targets: PlaceTarget[];
  panel: PanelChoice[];
  /** Ending the turn, when the decision offers it. */
  end: PanelChoice | null;
  ghost: GhostChoice | null;
}

export const NO_CHOICES: PlayChoices = { targets: [], panel: [], end: null, ghost: null };

/** The answer to the pending decision for the viewing seat, by choice. */
function actor(view: GameView): ((choice: Json) => Action) | null {
  const pending = view.pending;
  const seat = view.viewer;
  if (pending?.type !== "decision" || pending.detail === null || seat === null) return null;
  return (choice) => ({ kind: "choose", decision: pending.id, seat, choice });
}

/** Where the figure acting on this turn stands. */
function actingPlace(view: GameView): { room: string; side: Edge | null } {
  const figure = view.turn?.acting;
  const place = figure ? view.figures[figure].place : null;
  if (!place) throw new Error("The turn offers a place, but no figure acting on it stands in the house");
  return place;
}

/** The turn's own moves and doorways as one-step routes, for a screen
 *  without the lookahead (the debug board). */
function oneStep(view: GameView, listed: readonly Choice[], act: (choice: Json) => Action): Reach[] {
  return listed.flatMap((choice): Reach[] => {
    const turn = choice.choice as TurnChoice;
    if (turn.act !== "move" && turn.act !== "discover") return [];
    const from = actingPlace(view);
    const base = { label: choice.label, actions: [act(choice.choice)], spaces: 1, warnings: [], stops: turn.act === "discover" };
    return turn.act === "move"
      ? [{ ...base, end: { kind: "move", place: { room: turn.to, side: turn.side } }, route: [from, { room: turn.to, side: turn.side }] }]
      : [{ ...base, end: { kind: "discover", room: from.room, direction: turn.direction }, route: [from] }];
  });
}

type Discovery = Reach & { end: { kind: "discover" } };

/** A cell to explore's target id: the choice, exploring that cell, whichever doorway it goes through. */
export const exploreId = (cell: Spot) => `explore:${cell.floor}:${String(cell.x)}:${String(cell.y)}`;

/** A move's target id: the choice, never just the room, so one room can carry several. */
function moveId(place: { room: string; side: Edge | null }): string {
  return place.side === null ? `room:${place.room}` : `room:${place.room}:${place.side}`;
}

/** Which of two routes to explore one cell by: the cheaper, then one from
 *  the room the turn stands in, then by room and board direction. */
function preferred(a: Discovery, b: Discovery): number {
  const here = (reach: Discovery) => (reach.route.length === 1 ? 0 : 1);
  return a.spaces - b.spaces || here(a) - here(b) || (a.end.room < b.end.room ? -1 : a.end.room > b.end.room ? 1 : 0) || EDGES.indexOf(a.end.direction) - EDGES.indexOf(b.end.direction);
}

/** Each empty cell a turn can explore, once, by the doorway onto it the turn
 *  prefers: a player means "go into whatever is over there", whichever way in. */
export function explorations(board: Layout, reaches: readonly Reach[]): { cell: Spot; reach: Discovery }[] {
  const cells = new Map<string, { cell: Spot; reach: Discovery }>();
  for (const reach of reaches) {
    if (reach.end.kind !== "discover") continue;
    const discovery = reach as Discovery;
    const { spot } = doorwaySpot(board, discovery.end);
    const id = exploreId(spot);
    const was = cells.get(id);
    if (!was || preferred(discovery, was.reach) < 0) cells.set(id, { cell: spot, reach: discovery });
  }
  return [...cells.values()];
}

/** The pending decision for the viewing seat, split by where it is
 *  answered. With the turn's lookahead, every place a move can reach is a
 *  target, each with its route; without it, the turn's own steps are. */
export function playChoices(view: GameView, ahead: Lookahead | null = null): PlayChoices {
  const act = actor(view);
  const pending = view.pending;
  if (!act || pending?.type !== "decision" || pending.detail === null) return NO_CHOICES;
  const listed = pending.detail.choices;
  const panelChoice = (choice: Choice, id: string): PanelChoice => ({ ...choice, id, action: act(choice.choice) });
  const panelOf = (list: readonly Choice[]) => list.map((choice) => panelChoice(choice, `panel:${listed.indexOf(choice)}`));
  if (pending.kind === "rotation" || pending.kind === "place-tile") return { ...NO_CHOICES, ghost: ghostOf(view, pending.kind, pending.detail.params, listed, act) };
  if (pending.kind === "choose-one") return chooseOneChoices(view, pending.detail.params, listed, act, panelOf);
  if (pending.kind !== "turn") return { ...NO_CHOICES, panel: panelOf(listed) };

  const lookedAhead = ahead !== null && ahead.decision === pending.id;
  const reaches = lookedAhead ? ahead.reaches : oneStep(view, listed, act);
  const preview = (id: string, reach: Reach) => (lookedAhead ? routePreview(id, ahead, reach) : null);
  const targets: PlaceTarget[] = [];
  for (const reach of reaches) {
    if (reach.end.kind !== "move") continue;
    const id = moveId(reach.end.place);
    targets.push({ id, kind: "room", room: reach.end.place.room, side: reach.end.place.side, label: reach.label, actions: reach.actions, preview: preview(id, reach) });
  }
  for (const { cell, reach } of explorations(view.board, reaches)) {
    const id = exploreId(cell);
    targets.push({ id, kind: "explore", cell, room: reach.end.room, direction: reach.end.direction, label: reach.label, actions: reach.actions, preview: preview(id, reach) });
  }
  const panel: Choice[] = [];
  let end: PanelChoice | null = null;
  for (const choice of listed) {
    const turn = choice.choice as TurnChoice;
    if (turn.act === "end") end = panelChoice(choice, "end");
    else if (turn.act !== "move" && turn.act !== "discover") panel.push(choice);
  }
  return { targets, panel: panelOf(panel), end, ghost: null };
}

/** A choice among options: each option naming a room in the house is that
 *  room, a place (put your explorer there, send the Dog there); the rest go
 *  to the panel. The listed choices are the options' indexes. */
function chooseOneChoices(view: GameView, params: Json, listed: readonly Choice[], act: (choice: Json) => Action, panelOf: (list: readonly Choice[]) => PanelChoice[]): PlayChoices {
  const { options } = params as { options: { room?: string }[] };
  const targets: PlaceTarget[] = [];
  const panel: Choice[] = [];
  for (const choice of listed) {
    const room = options[choice.choice as number].room;
    if (room === undefined) {
      panel.push(choice);
      continue;
    }
    if (!view.board.tiles.some((tile) => tile.tile === room)) throw new Error(`An option names the ${room}, which isn't in the house`);
    targets.push({ id: `option:${String(choice.choice)}`, kind: "room", room, side: null, label: choice.label, actions: [act(choice.choice)], preview: null });
  }
  return { ...NO_CHOICES, targets, panel: panelOf(panel) };
}

const sameSpot = (a: Spot, b: Spot) => a.floor === b.floor && a.x === b.x && a.y === b.y;

/** A tile to place, from a rotation decision (its cell is through the doorway
 *  explored) or a place-tile decision (each choice a cell and a way round, or
 *  null to leave it where it is). */
function ghostOf(view: GameView, kind: "rotation" | "place-tile", params: Json, listed: readonly Choice[], act: (choice: Json) => Action): GhostChoice {
  const p = params as { tile: string; doorway?: Doorway };
  const option = (choice: Choice, rotation: Rotation): GhostOption => ({ rotation, label: choice.label, action: act(choice.choice) });
  if (kind === "rotation") {
    if (!p.doorway) throw new Error("A rotation decision names no doorway");
    return { tile: p.tile, cells: [{ spot: doorwaySpot(view.board, p.doorway).spot, options: listed.map((choice) => option(choice, choice.choice as Rotation)) }], stay: null };
  }
  const cells: GhostCell[] = [];
  let stay: PanelChoice | null = null;
  for (const [i, choice] of listed.entries()) {
    if (choice.choice === null) {
      stay = { ...choice, id: `panel:${i}`, action: act(null) };
      continue;
    }
    const { rotation, ...spot } = choice.choice as PlaceChoice;
    const cell = cells.find((candidate) => sameSpot(candidate.spot, spot));
    if (cell) cell.options.push(option(choice, rotation));
    else cells.push({ spot, options: [option(choice, rotation)] });
  }
  return { tile: p.tile, cells, stay };
}

// ---------------------------------------------------------------------------
// The debug view's flat board: what the decision is about, highlighted.
// ---------------------------------------------------------------------------

export interface Spot {
  floor: FloorId;
  x: number;
  y: number;
}

export interface Focus {
  /** Rooms the decision offers, each with its action when one choice leads there. */
  rooms: Map<string, Action | null>;
  doorways: { room: string; direction: Edge; action: Action }[];
  /** Empty cells a room may go on, named by the room. */
  cells: (Spot & { tile: string; action: Action | null })[];
}

export const NO_FOCUS: Focus = { rooms: new Map(), doorways: [], cells: [] };

const isObject = (value: Json): value is { [key: string]: Json } => typeof value === "object" && value !== null && !Array.isArray(value);

/** What the pending decision is about on the debug view's board: the rooms a
 *  move can reach, the doorways that can be explored, the cells a new room
 *  can go on. A highlight that stands for exactly one choice answers it when clicked. */
export function boardFocus(view: GameView): Focus {
  const act = actor(view);
  const pending = view.pending;
  if (!act || pending?.type !== "decision" || pending.detail === null) return NO_FOCUS;
  const { params, choices } = pending.detail;
  const focus: Focus = { rooms: new Map(), doorways: [], cells: [] };
  const offerRoom = (room: string, choice: Json) => {
    focus.rooms.set(room, focus.rooms.has(room) ? null : act(choice));
  };

  if (pending.kind === "turn") {
    const { targets } = playChoices(view);
    for (const { choice } of choices) {
      const turn = choice as TurnChoice;
      if (turn.act === "move") offerRoom(turn.to, choice);
    }
    for (const target of targets) if (target.kind === "explore") focus.doorways.push({ room: target.room, direction: target.direction, action: target.actions[0] });
    return focus;
  }

  const tileParams = params as { tile?: string; doorway?: Doorway };
  if (pending.kind === "rotation" && tileParams.tile && tileParams.doorway) {
    const { spot } = doorwaySpot(view.board, tileParams.doorway);
    const only = choices.length === 1 ? choices[0].choice : null;
    focus.cells.push({ ...spot, tile: tileParams.tile, action: only === null ? null : act(only) });
    return focus;
  }

  if (pending.kind === "place-tile" && tileParams.tile) {
    const tile = tileParams.tile;
    for (const { choice } of choices) {
      if (choice === null) continue;
      const at = choice as PlaceChoice;
      const same = focus.cells.find((c) => c.floor === at.floor && c.x === at.x && c.y === at.y);
      if (same) same.action = null;
      else focus.cells.push({ floor: at.floor, x: at.x, y: at.y, tile, action: act(choice) });
    }
    return focus;
  }

  if (pending.kind === "choose-one") {
    for (const target of playChoices(view).targets) focus.rooms.set(target.room, focus.rooms.has(target.room) ? null : target.actions[0]);
    return focus;
  }

  // Any other decision: a choice that names a room ("to" or "room") points at it.
  for (const { choice } of choices) {
    if (!isObject(choice)) continue;
    const room = typeof choice.to === "string" ? choice.to : choice.room;
    if (typeof room === "string" && view.board.tiles.some((t) => t.tile === room)) offerRoom(room, choice);
  }
  return focus;
}
