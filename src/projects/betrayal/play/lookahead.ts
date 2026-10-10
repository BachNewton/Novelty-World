import type { TurnChoice } from "../engine/exploration";
import { placeOf } from "../engine/figures";
import { askNumber, barrierSides, moveCost } from "../engine/questions";
import { choices, outcomes, type Engine } from "../engine/step-loop";
import { viewFor, type RuleView } from "../engine/view";
import type { Action, Edge, FigureId, GameState, Place } from "../types";
import { isRuleDriven } from "./status";

/*
 * Every place a turn can reach from where it stands, found by trying the
 * engine's own moves on copies of the state: a search over the turn's `move`
 * choices, carried on only through writes that do nothing but move, each
 * place by its cheapest route, with the actions that walk it. A write that
 * rolls, draws, asks something, ends the move or puts the figure anywhere
 * else ends a route there: what follows is the dice's to say, and the search
 * never looks past it, so a preview never gives a roll away. Every rule a
 * route would set off is read from what the engine did on the way, never
 * from a list of rooms. Worked out once per decision.
 */

/** A rule a route sets off, where it acts: a room's roll to leave, a barrier
 *  to cross, a room that asks something on entering, opponents slowing the
 *  way out, a discovery that draws a card and ends the move. `event` is the
 *  kind of event it shows as, for wording a rulebook rule; only its type, so
 *  nothing an outcome decided is carried. */
export interface RouteWarning {
  room: string;
  rule: RuleView;
  event: string | null;
}

/** Where a route ends: moving into a place, or exploring through one of a room's unexplored doorways. */
export type RouteEnd = { kind: "move"; place: Place } | { kind: "discover"; room: string; direction: Edge };

export interface Reach {
  end: RouteEnd;
  /** The engine's label for the route's last step. */
  label: string;
  /** Every place stood in on the way, from where the turn stands to the last. */
  route: Place[];
  /** The actions that walk it, in order, each answering the decision its predecessor leads to. */
  actions: Action[];
  /** Spaces of movement it spends. */
  spaces: number;
  warnings: RouteWarning[];
  /** Its last step does more than move: it rolls, draws, asks, ends the move
   *  or carries the figure elsewhere, so what follows is the engine's to say. */
  stops: boolean;
}

export interface Lookahead {
  /** The decision it was worked out for. */
  decision: string;
  figure: FigureId;
  /** Spaces of movement the figure has left. */
  left: number;
  /** Cheapest first, then fewest steps. Where the turn stands is never one. */
  reaches: Reach[];
}

/** Events whose outcome is the dice's or the deck's: a route stops at them, and nothing after them is read. */
const CHANCE = new Set(["rolled", "card-drawn"]);

/** Discovering a room with a card symbol draws its card (p. 10), and drawing a card ends the move (p. 6). */
const DISCOVERY_WARNINGS: Omit<RouteWarning, "room">[] = [
  { rule: { source: "rulebook", page: 10 }, event: "card-drawn" },
  { rule: { source: "rulebook", page: 6 }, event: "movement-ended" },
];

/** A route is made of moves, and may end in a discovery: no other answer is worth trying. */
const isMove = (candidate: unknown) => (candidate as TurnChoice).act === "move";
const isDiscovery = (candidate: unknown) => (candidate as TurnChoice).act === "discover";

const placeKey = (place: Place) => `${place.room}|${place.side ?? ""}`;

function movementLeft(engine: Engine, state: GameState, figure: FigureId): number {
  const turn = state.turn;
  if (!turn || turn.movementEnded.includes(figure)) return 0;
  return askNumber(engine, state, "movement", { figure }) - (turn.moved[figure] ?? 0);
}

/** Whether a state is the same turn still waiting on the same figure to act. */
function stillMoving(state: GameState, seat: number, figure: FigureId): boolean {
  const pending = state.pending;
  return pending?.type === "decision" && pending.kind === "turn" && pending.seats.includes(seat) && pending.about === figure;
}

function addWarning(list: RouteWarning[], warning: RouteWarning): void {
  if (!list.some((w) => w.room === warning.room && w.event === warning.event && JSON.stringify(w.rule) === JSON.stringify(warning.rule))) list.push(warning);
}

/** What a move's write set off, as the seat may see it: each rule-driven
 *  event up to the first one chance decided, and the rule behind a question
 *  it ended on. `at` is where it happened when the rule isn't a room's. */
function writeWarnings(engine: Engine, after: GameState, seat: number, at: string, asked: boolean): RouteWarning[] {
  // Most moves set nothing off: the seat's view is worked out only for those that do.
  if (!asked && !after.lastEvents.some((event) => isRuleDriven(event))) return [];
  const view = viewFor(engine, after, seat);
  const warnings: RouteWarning[] = [];
  const room = (rule: RuleView, data: unknown = null) => {
    if (rule.source === "room") return rule.room;
    const named = (data as { room?: unknown } | null)?.room;
    return typeof named === "string" ? named : at;
  };
  for (const event of view.events) {
    if (isRuleDriven(event)) addWarning(warnings, { room: room(event.rule, event.data), rule: event.rule, event: event.type });
    if (CHANCE.has(event.type)) return warnings;
  }
  const pending = view.pending;
  if (asked && pending && pending.rule.source !== "rulebook" && pending.rule.source !== "scenario") addWarning(warnings, { room: room(pending.rule), rule: pending.rule, event: null });
  return warnings;
}

interface Node {
  place: Place;
  /** The state standing here, or null where the route ends: the search goes no further. */
  state: GameState | null;
  route: Place[];
  actions: Action[];
  spaces: number;
  label: string;
  warnings: RouteWarning[];
  /** Rules met only from here on: a barrier to cross, a roll to leave. */
  ahead: RouteWarning[];
}

/** Worked out once per state: a screen re-rendering on one decision asks again and again. */
const memo = new WeakMap<GameState, Map<number, Lookahead | null>>();

/** The turn's reachable places for `seat`, or null when the pending decision
 *  isn't that seat's turn with a figure acting on it. */
export function lookahead(engine: Engine, state: GameState, seat: number): Lookahead | null {
  const bySeat = memo.get(state) ?? new Map<number, Lookahead | null>();
  memo.set(state, bySeat);
  const known = bySeat.get(seat);
  if (known !== undefined) return known;
  const pending = state.pending;
  const figure = state.turn?.acting ?? null;
  const found = pending?.type === "decision" && figure !== null && stillMoving(state, seat, figure) ? search(engine, state, seat, figure) : null;
  bySeat.set(seat, found);
  return found;
}

function search(engine: Engine, start: GameState, seat: number, figure: FigureId): Lookahead {
  const decision = (start.pending as { id: string }).id;
  const from = placeOf(start, figure);
  const nodes = new Map<string, Node>([[placeKey(from), { place: from, state: start, route: [from], actions: [], spaces: 0, label: "", warnings: [], ahead: [] }]]);
  const doorways: Reach[] = [];
  const better = (a: Pick<Node, "spaces" | "route">, b: Pick<Node, "spaces" | "route">) => a.spaces < b.spaces || (a.spaces === b.spaces && a.route.length < b.route.length);
  // Costs are small whole numbers, so the frontier is kept sorted by them.
  const frontier: Node[] = [nodes.get(placeKey(from)) as Node];
  const expanded = new Set<string>();
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.spaces - b.spaces || a.route.length - b.route.length);
    const node = frontier.shift() as Node;
    const key = placeKey(node.place);
    if (expanded.has(key) || nodes.get(key) !== node || node.state === null) continue;
    expanded.add(key);
    const here = node.state;
    const id = (here.pending as { id: string }).id;
    if (barrierSides(engine, node.place.room).length > 0) addWarning(node.ahead, { room: node.place.room, rule: { source: "room", room: node.place.room }, event: null });
    const cost = moveCost(engine, here, figure);
    // A doorway is only offered, never explored: what it finds is the deck's to say.
    for (const { choice, label } of choices(engine, here, seat, isDiscovery)) {
      const turn = choice as TurnChoice;
      const action: Action = { kind: "choose", decision: id, seat, choice };
      if (turn.act === "discover") {
        doorways.push({
          end: { kind: "discover", room: node.place.room, direction: turn.direction },
          label,
          route: node.route,
          actions: [...node.actions, action],
          spaces: node.spaces + cost,
          warnings: [...node.warnings, ...DISCOVERY_WARNINGS.map((w) => ({ ...w, room: node.place.room }))],
          stops: true,
        });
      }
    }
    for (const { choice, label, state: after } of outcomes(engine, here, seat, isMove)) {
      const turn = choice as TurnChoice;
      if (turn.act !== "move") continue;
      const action: Action = { kind: "choose", decision: id, seat, choice };
      const place: Place = { room: turn.to, side: turn.side };
      const chance = after.lastEvents.some((event) => CHANCE.has(event.type));
      const moving = stillMoving(after, seat, figure);
      const arrived = placeKey(placeOf(after, figure)) === placeKey(place);
      const plain = moving && arrived && !chance;
      const goesOn = plain && movementLeft(engine, after, figure) > 0;
      const warnings = writeWarnings(engine, after, seat, place.room, !moving);
      // A rule of the room being left, met on the way out of it, is ahead of anyone stopping there.
      for (const warning of warnings) if (warning.room === node.place.room) addWarning(node.ahead, warning);
      const routeWarnings = [...node.warnings];
      for (const warning of warnings) addWarning(routeWarnings, warning);
      const next: Node = {
        place,
        state: plain ? after : null,
        route: [...node.route, place],
        actions: [...node.actions, action],
        spaces: node.spaces + cost,
        label,
        warnings: routeWarnings,
        ahead: [],
      };
      const was = nodes.get(placeKey(place));
      if (placeKey(place) === placeKey(from) || (was && !better(next, was))) continue;
      nodes.set(placeKey(place), next);
      if (goesOn) frontier.push(next);
    }
  }
  // A place stood in with no movement left still has its rules ahead read: its barrier.
  for (const node of nodes.values()) if (node.state !== null && !expanded.has(placeKey(node.place)) && barrierSides(engine, node.place.room).length > 0) addWarning(node.ahead, { room: node.place.room, rule: { source: "room", room: node.place.room }, event: null });

  const moves: Reach[] = [...nodes.values()]
    .filter((node) => node.actions.length > 0)
    .map((node) => {
      const warnings = [...node.warnings];
      for (const warning of node.ahead) addWarning(warnings, warning);
      return { end: { kind: "move", place: node.place }, label: node.label, route: node.route, actions: node.actions, spaces: node.spaces, warnings, stops: node.state === null };
    });
  const reaches = [...moves, ...doorways].sort((a, b) => a.spaces - b.spaces || a.route.length - b.route.length);
  return { decision, figure, left: movementLeft(engine, start, figure), reaches };
}
