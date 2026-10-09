import type { Action, Edge, FloorId, Json, Rotation } from "../types";
import { doorwaySpot, placed, type Doorway } from "../engine/board";
import type { TurnChoice } from "../engine/exploration";
import type { Choice } from "../engine/step-loop";
import type { PlaceChoice } from "../engine/tiles";
import type { GameView } from "../engine/view";

/*
 * The pending decision, split by where it is answered: choices about a place
 * become targets in the house, a room tile to place becomes a ghost of it in
 * the house, and everything else goes to the panel, with ending the turn as
 * an action of its own. Each carries the action that answers it. A target's
 * id names the choice, never the room: one room can carry several targets.
 */

/** A choice the house offers, with the place it marks. */
export type PlaceTarget = { id: string; label: string; action: Action } & (
  /** A move to a room on the same floor. */
  | { kind: "room"; room: string }
  /** A move to `toward`, on another floor, shown as the way there out of `room`. */
  | { kind: "stair"; room: string; toward: string }
  /** Exploring through an unexplored doorway of `room`, on a board direction. */
  | { kind: "doorway"; room: string; direction: Edge }
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

/** The room the figure acting on this turn stands in. */
function actingRoom(view: GameView): string {
  const figure = view.turn?.acting;
  const room = figure ? view.figures[figure].place?.room : undefined;
  if (room === undefined) throw new Error("The turn offers a place, but no figure acting on it stands in the house");
  return room;
}

function floorOf(view: GameView, room: string): FloorId {
  const tile = placed(view.board, room);
  if (!tile) throw new Error(`${room} is not in the house`);
  return tile.floor;
}

export function playChoices(view: GameView): PlayChoices {
  const act = actor(view);
  const pending = view.pending;
  if (!act || pending?.type !== "decision" || pending.detail === null) return NO_CHOICES;
  const listed = pending.detail.choices;
  const panelChoice = (choice: Choice, id: string): PanelChoice => ({ ...choice, id, action: act(choice.choice) });
  const panelOf = (list: readonly Choice[]) => list.map((choice) => panelChoice(choice, `panel:${listed.indexOf(choice)}`));
  if (pending.kind === "rotation" || pending.kind === "place-tile") return { ...NO_CHOICES, ghost: ghostOf(view, pending.kind, pending.detail.params, listed, act) };
  if (pending.kind !== "turn") return { ...NO_CHOICES, panel: panelOf(listed) };

  const turnOf = (choice: Choice) => choice.choice as TurnChoice;
  const moves = listed.filter((choice) => turnOf(choice).act === "move");
  /** Rooms more than one move leads to (the sides of a barrier room) can't be told apart in the house yet. */
  const destinations = moves.map((choice) => (turnOf(choice) as Extract<TurnChoice, { act: "move" }>).to);
  const twice = new Set(destinations.filter((room, i) => destinations.indexOf(room) !== i));

  const targets: PlaceTarget[] = [];
  const panel: Choice[] = [];
  let end: PanelChoice | null = null;
  for (const choice of listed) {
    const turn = turnOf(choice);
    const base = { label: choice.label, action: act(choice.choice) };
    if (turn.act === "end") end = panelChoice(choice, "end");
    else if (turn.act === "discover") {
      targets.push({ ...base, id: `doorway:${turn.direction}`, kind: "doorway", room: actingRoom(view), direction: turn.direction });
    } else if (turn.act === "move") {
      const from = actingRoom(view);
      if (turn.to === from || twice.has(turn.to)) panel.push(choice);
      else if (floorOf(view, turn.to) !== floorOf(view, from)) targets.push({ ...base, id: `stair:${from}:${turn.to}`, kind: "stair", room: from, toward: turn.to });
      else targets.push({ ...base, id: `room:${turn.to}`, kind: "room", room: turn.to });
    } else panel.push(choice);
  }
  return { targets, panel: panelOf(panel), end, ghost: null };
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
    for (const target of targets) if (target.kind === "doorway") focus.doorways.push({ room: target.room, direction: target.direction, action: target.action });
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

  // Any other decision: a choice that names a room ("to" or "room") points at it.
  for (const { choice } of choices) {
    if (!isObject(choice)) continue;
    const room = typeof choice.to === "string" ? choice.to : choice.room;
    if (typeof room === "string" && view.board.tiles.some((t) => t.tile === room)) offerRoom(room, choice);
  }
  return focus;
}
