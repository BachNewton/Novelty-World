import type {
  Catalog,
  Edge,
  Figure,
  FigureId,
  FloorId,
  GameState,
  HauntReveal,
  RuleRef,
  SetId,
  Step,
  TurnRef,
} from "../types";
import {
  COMPASS,
  doorwaySpot,
  freeDoorways,
  placed,
  sideName,
  startingBoard,
  turn,
  type Doorway,
} from "./board";
import {
  allFigures,
  explorerOf,
  figureName,
  figureOf,
  placeOf,
  putFigure,
  startingTraits,
  together,
} from "./figures";
import {
  arrived,
  goOut,
  defineDecision,
  defineStep,
  gainCard,
  handle,
  loseCard,
  isHandled,
  leaveRoom,
  roll,
  step,
  takeFromPile,
} from "./effects";
import { attackTargets, turnAttack } from "./combat";
import {
  activate,
  finishActing,
  monsterTurnStart,
  readyActors,
  recoverStunned,
} from "./monsters";
import { inPlay } from "./sides";
import { revealHaunt } from "./haunt";
import {
  askNumber,
  askPermission,
  askSet,
  askStructured,
  controllerOf,
  moveCost,
  type AttackTarget,
} from "./questions";
import {
  atSource,
  liveSources,
  type Source,
  type SourceAction,
} from "./sources";
import {
  prepareScenario,
  SCENARIO_RULE,
  stackScenario,
  type PreparedScenario,
  type Scenario,
} from "./scenario";
import { emptyState } from "./state";
import { bestPlacements, discoverRoom, drawRoom } from "./tiles";
import { turnAfter } from "./turns";
import {
  start,
  type DecisionKind,
  type Engine,
  type StepHandler,
} from "./step-loop";

// Exploration, before the haunt: setup, turns, moving, discovering rooms,
// cards and items, and the haunt roll. Page numbers are the rulebook's.

const RULEBOOK = (page: number): RuleRef => ({ source: "rulebook", page });

export interface NewGame {
  gameId: string;
  seed: string;
  sets: SetId[];
  /** In table order. */
  seats: { name: string; character: string }[];
  /** The first player is the one whose birthday comes next (p. 4), so setup needs the date. */
  today: { month: number; day: number };
  /** Start somewhere other than the default deal (playtesting and tests). */
  scenario?: Scenario;
}

/** Sets a game up and runs it to the first player's first decision. */
export function newGame(engine: Engine, game: NewGame): GameState {
  validateSeats(engine.catalog, game.seats);
  const state = emptyState(game.gameId, game.seed, game.sets);
  state.seats = game.seats.map((s) => ({
    name: s.name,
    controller: "human",
    side: null,
    roles: [],
    knownBy: null,
  }));
  const characters = game.seats.map((s) => s.character);
  return start(engine, state, [
    step<Setup>("setup", {
      characters,
      today: game.today,
      scenario: game.scenario
        ? prepareScenario(engine.catalog, game.sets, characters, game.scenario)
        : null,
    }),
  ]);
}

/** The explorer whose turn it is: the seat's own, on its explorer or
 *  traitor turn. A monster turn is no explorer's, so rules that act at the
 *  start or end of "your turn" don't fire on it. */
function turnExplorer(state: GameState, turn: TurnRef): FigureId | null {
  return turn.kind === "monster" ? null : explorerOf(state, turn.seat);
}

function validateSeats(catalog: Catalog, seats: NewGame["seats"]): void {
  if (seats.length < 3 || seats.length > 6)
    throw new Error("Betrayal is for 3 to 6 players");
  const cards = new Set<string>();
  for (const { character } of seats) {
    if (!(character in catalog.characters))
      throw new Error(`No character ${character}`);
    const found = catalog.characters[character];
    if (cards.has(found.card))
      throw new Error(`Two explorers chosen from the ${found.card} card`);
    cards.add(found.card);
  }
}

type Setup = {
  characters: string[];
  today: { month: number; day: number };
  scenario: PreparedScenario | null;
};

/** Days from today until a birthday; today's birthday comes next. */
function daysUntil(
  today: { month: number; day: number },
  birthday: { month: number; day: number },
): number {
  const dayOfYear = (d: { month: number; day: number }) =>
    (d.month - 1) * 31 + d.day;
  return (dayOfYear(birthday) - dayOfYear(today) + 12 * 31) % (12 * 31);
}

// ---------------------------------------------------------------------------
// Turn choices
// ---------------------------------------------------------------------------

export type TurnChoice =
  | { act: "move"; to: string; side: Edge | null }
  | { act: "discover"; direction: Edge }
  | { act: "action"; source: Source["kind"]; id: string; action: string }
  | { act: "attack"; target: AttackTarget }
  | { act: "trade"; with: FigureId; give: string | null; take: string | null }
  | { act: "drop"; card: string }
  | { act: "pickup"; card: string }
  /** On a turn where the seat moves several figures one after another (the
   *  monster turn), this one acts next. */
  | { act: "activate"; figure: FigureId }
  /** The figure acting has finished, and another may act. */
  | { act: "done" }
  | { act: "end" };

type TurnParams = { seat: number };

/** A turn about to start: whose, which kind, and for an inserted turn, the
 *  turn in the order it comes after. */
type TurnStart = TurnRef & { follows: TurnRef | null };

function movementLeft(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): number {
  const turn = state.turn;
  if (!turn || turn.movementEnded.includes(figure)) return 0;
  return (
    askNumber(engine, state, "movement", { figure }) - (turn.moved[figure] ?? 0)
  );
}

/** Whether a figure has the movement left to leave its room. However much
 *  opponents slow it, a figure can always move at least 1 space a turn
 *  (p. 17). */
export function canLeave(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): boolean {
  const left = movementLeft(engine, state, figure);
  if (left >= moveCost(engine, state, figure)) return true;
  return (state.turn?.moved[figure] ?? 0) === 0 && left >= 1;
}

/** A tile in the stack or the discard pile that can go on this floor through this doorway without sealing it (p. 9). */
function fits(
  engine: Engine,
  state: GameState,
  tile: string,
  doorway: Doorway,
): boolean {
  return doorwayPlacements(engine, state, tile, doorway).length > 0;
}

function doorwayPlacements(
  engine: Engine,
  state: GameState,
  tile: string,
  doorway: Doorway,
) {
  const { spot, back } = doorwaySpot(state.board, doorway);
  return bestPlacements(engine.catalog, state.board, tile, spot, [back]);
}

/** Whether a source's action is offered to this figure: a card's to its
 *  holder while the card is unused this turn, or to anyone with its holder
 *  when it says so; a room's or token's to a figure there. */
function offeredHere(
  state: GameState,
  figure: FigureId,
  source: Source,
  definition: SourceAction,
): boolean {
  // The haunt's objective actions say for themselves where they can be taken.
  if (source.kind === "haunt") return true;
  if (source.kind !== "card")
    return atSource(source, placeOf(state, figure).room);
  if (source.holder === null) return false;
  if (definition.offeredTo === "room")
    return together(
      figureOf(state, source.holder),
      figureOf(state, figure),
    );
  return source.holder === figure && !isHandled(state, source.id);
}

function cardActions(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): { source: Source; action: string; definition: SourceAction }[] {
  const result: { source: Source; action: string; definition: SourceAction }[] =
    [];
  for (const { source, behaviour } of liveSources(
    engine,
    state,
    "actions",
  )) {
    for (const [action, definition] of Object.entries(
      behaviour.actions ?? {},
    )) {
      if (
        offeredHere(state, figure, source, definition) &&
        definition.available(state, figure, source, engine)
      )
        result.push({ source, action, definition });
    }
  }
  return result;
}

/** Trading is between figures in one room that can both hold cards
 *  (p. 11): monsters carry no items unless a haunt says so (p. 19). */
function canTradeWith(
  engine: Engine,
  state: GameState,
  figure: Figure,
  other: Figure,
): boolean {
  return (
    other.id !== figure.id &&
    together(other, figure) &&
    canCarry(engine, state, figure.id) &&
    canCarry(engine, state, other.id)
  );
}

function canCarry(engine: Engine, state: GameState, figure: FigureId): boolean {
  return askPermission(engine, state, "canCarry", { figure }).allowed;
}

function canDiscover(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): boolean {
  return askPermission(engine, state, "canDiscover", { figure }).allowed;
}

function canMoveItem(
  engine: Engine,
  state: GameState,
  card: string,
  how: "trade" | "drop",
): boolean {
  return engine.catalog.cards[card].transfer[how] && !isHandled(state, card);
}

/** Where a figure can move one space to. */
function moves(engine: Engine, state: GameState, figure: FigureId) {
  return askSet(engine, state, "connections", {
    mover: { kind: "figure", figure },
    from: placeOf(state, figure),
  });
}

/** In a barrier room only the door on your own side is in reach (p. 7). */
function inReach(
  state: GameState,
  figure: FigureId,
  direction: Edge,
): boolean {
  const { room, side } = placeOf(state, figure);
  if (side === null) return true;
  const tile = placed(state.board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  return turn(side, tile.rotation) === direction;
}

function floorOf(state: GameState, room: string): FloorId {
  const tile = placed(state.board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  return tile.floor;
}

function turnCandidates(engine: Engine, state: GameState): TurnChoice[] {
  const end: TurnChoice = { act: "end" };
  const turn = state.turn;
  if (turn === null) return [end];
  // Between monsters, the next to act, or the end of the turn. A turn with
  // no one left to act (a dead explorer's, a monster turn with no monster
  // ready) passes at once.
  const figure = turn.acting;
  if (figure === null)
    return [
      ...readyActors(state).map(
        (f): TurnChoice => ({ act: "activate", figure: f }),
      ),
      end,
    ];
  // Finishing one monster is a choice only while another can still act;
  // otherwise it is the turn's end.
  const finish: TurnChoice[] =
    readyActors(state).length > 0 ? [{ act: "done" }, end] : [end];
  if (!inPlay(figureOf(state, figure))) return finish;
  if (!askPermission(engine, state, "canAct", { figure }).allowed)
    return [
      ...cardActions(engine, state, figure)
        .filter(({ definition }) => definition.whileUnable === true)
        .map(
          ({ source, action }): TurnChoice => ({
            act: "action",
            source: source.kind,
            id: source.id,
            action,
          }),
        ),
      ...finish,
    ];
  const explorer = figureOf(state, figure);
  const room = placeOf(state, figure).room;
  const choices: TurnChoice[] = [];
  for (const to of moves(engine, state, figure))
    choices.push({ act: "move", to: to.room, side: to.side });
  if (canDiscover(engine, state, figure))
    for (const doorway of freeDoorways(
      state.board,
      engine.catalog,
      floorOf(state, room),
    )) {
      if (doorway.room === room && inReach(state, figure, doorway.direction))
        choices.push({ act: "discover", direction: doorway.direction });
    }
  for (const { source, action } of cardActions(engine, state, figure)) {
    choices.push({ act: "action", source: source.kind, id: source.id, action });
  }
  for (const target of attackTargets(engine, state, figure))
    choices.push({ act: "attack", target });
  for (const other of allFigures(state)) {
    if (!canTradeWith(engine, state, explorer, other)) continue;
    const gives = [
      null,
      ...explorer.cards.filter((c) => canMoveItem(engine, state, c, "trade")),
    ];
    const takes = [
      null,
      ...other.cards.filter((c) => canMoveItem(engine, state, c, "trade")),
    ];
    for (const give of gives)
      for (const take of takes)
        if (give !== null || take !== null)
          choices.push({ act: "trade", with: other.id, give, take });
  }
  for (const card of explorer.cards) choices.push({ act: "drop", card });
  if (canCarry(engine, state, figure))
    for (const card of state.piles[room] ?? [])
      choices.push({ act: "pickup", card });
  choices.push(...finish);
  return choices;
}

/** Validates a turn choice and returns its work, or why it can't apply. */
function takeTurnChoice(
  engine: Engine,
  state: GameState,
  seat: number,
  choice: TurnChoice,
): string | Step[] {
  const turn = state.turn;
  if (!turn || turn.seat !== seat) return "It isn't this seat's turn";
  if (choice.act === "end")
    return [
      ...(turn.acting === null ? [] : [finishActing()]),
      step<TurnParams>("end-turn", { seat }),
    ];
  if (choice.act === "activate") {
    if (turn.acting !== null) return "Another figure is acting";
    if (!readyActors(state).includes(choice.figure))
      return "That figure can't act now";
    return [activate(choice.figure)];
  }
  const figure = turn.acting;
  if (figure === null) return "No figure is acting";
  if (choice.act === "done") {
    if (readyActors(state).length === 0) return "No one else is left to act";
    return [finishActing()];
  }
  const explorer = figureOf(state, figure);
  const room = placeOf(state, figure).room;
  switch (choice.act) {
    case "move": {
      if (!canLeave(engine, state, figure)) return "No movement left";
      if (
        !moves(engine, state, figure).some(
          (p) => p.room === choice.to && p.side === choice.side,
        )
      )
        return "That room isn't connected";
      if (
        !askPermission(engine, state, "canMove", {
          figure,
          from: room,
          to: choice.to,
        }).allowed
      )
        return "Something stops that move";
      return [
        leaveRoom(
          figure,
          step<Move>("move", { figure, to: choice.to, side: choice.side }),
        ),
      ];
    }
    case "discover": {
      if (!canDiscover(engine, state, figure))
        return "This figure can't discover rooms";
      if (!canLeave(engine, state, figure)) return "No movement left";
      const doorway = { room, direction: choice.direction };
      if (
        !freeDoorways(state.board, engine.catalog, floorOf(state, room)).some(
          (d) => d.room === doorway.room && d.direction === doorway.direction,
        )
      ) {
        return "That doorway doesn't open onto anything";
      }
      if (!inReach(state, figure, choice.direction))
        return "That door is across the barrier";
      if (
        ![...state.board.stack, ...state.board.discards].some((tile) =>
          fits(engine, state, tile, doorway),
        )
      ) {
        return "No room is left that can go there";
      }
      return [
        leaveRoom(
          figure,
          step<Discover>("discover", { figure, direction: choice.direction }),
        ),
      ];
    }
    case "action": {
      const found = cardActions(engine, state, figure).find(
        (a) =>
          a.source.kind === choice.source &&
          a.source.id === choice.id &&
          a.action === choice.action,
      );
      if (!found) return "That action isn't available";
      const { source, definition } = found;
      if (source.kind === "card" && definition.offeredTo !== "room")
        handle(state, source.id);
      return definition.steps(state, figure, source);
    }
    case "attack": {
      const work = turnAttack(engine, state, figure, choice.target);
      return typeof work === "string" ? work : [work];
    }
    case "trade": {
      if (turn.traded) return "You have already traded this turn";
      const other =
        choice.with in state.figures ? state.figures[choice.with] : null;
      if (other === null || !canTradeWith(engine, state, explorer, other))
        return "You can only trade with someone in your room who can hold cards";
      if (
        choice.give !== null &&
        (!explorer.cards.includes(choice.give) ||
          !canMoveItem(engine, state, choice.give, "trade"))
      )
        return "You can't trade that";
      if (
        choice.take !== null &&
        (!other.cards.includes(choice.take) ||
          !canMoveItem(engine, state, choice.take, "trade"))
      )
        return "They can't trade that";
      return [
        step<Trade>("offer-trade", {
          from: figure,
          to: choice.with,
          give: choice.give,
          take: choice.take,
        }),
      ];
    }
    case "drop": {
      if (
        !explorer.cards.includes(choice.card) ||
        !canMoveItem(engine, state, choice.card, "drop")
      )
        return "You can't drop that";
      if (turn.dropRoom !== null && turn.dropRoom !== room)
        return "You have already dropped items elsewhere this turn";
      return [step<Drop>("drop", { figure, card: choice.card })];
    }
    case "pickup": {
      if (!canCarry(engine, state, figure))
        return "This figure can't hold cards";
      if (
        !(state.piles[room] ?? []).includes(choice.card) ||
        isHandled(state, choice.card)
      )
        return "You can't pick that up";
      if (turn.pickupRoom !== null && turn.pickupRoom !== room)
        return "You have already picked up items elsewhere this turn";
      return [step<Drop>("pickup", { figure, card: choice.card })];
    }
  }
}

/** The figure acting on the turn, for a choice that only it can make. */
function acting(state: GameState): FigureId {
  const figure = state.turn?.acting ?? null;
  if (figure === null) throw new Error("No figure is acting");
  return figure;
}

function describeTurnChoice(
  engine: Engine,
  state: GameState,
  choice: TurnChoice,
): string {
  const room = (id: string) => engine.catalog.rooms[id].name;
  const card = (id: string) => engine.catalog.cards[id].name;
  const name = (figure: FigureId) =>
    figureName(engine.catalog, state, figure);
  switch (choice.act) {
    case "move":
      return choice.side === null
        ? `Move to the ${room(choice.to)}`
        : `Move to the ${room(choice.to)}, on its ${sideName(state.board, choice.to, choice.side)} side`;
    case "discover":
      return `Explore through the ${COMPASS[choice.direction]} door of the ${room(placeOf(state, acting(state)).room)}`;
    case "action": {
      const behaviour = liveSources(engine, state, "actions").find(
        (s) => s.source.kind === choice.source && s.source.id === choice.id,
      )?.behaviour;
      return behaviour?.actions?.[choice.action]?.label ?? choice.action;
    }
    case "attack": {
      if (choice.target.kind !== "figure")
        throw new Error("Only a figure can be attacked");
      const target = choice.target.figure;
      const there = figureOf(state, target).place;
      const here = placeOf(state, acting(state));
      return there !== null &&
        (there.room !== here.room || there.side !== here.side)
        ? `Attack ${name(target)}, in the ${room(there.room)}`
        : `Attack ${name(target)}`;
    }
    case "trade": {
      const give = choice.give === null ? null : `your ${card(choice.give)}`;
      const take = choice.take === null ? null : `their ${card(choice.take)}`;
      if (give && take) return `Offer ${name(choice.with)} ${give} for ${take}`;
      return give
        ? `Give ${name(choice.with)} ${give}`
        : `Ask ${name(choice.with)} for ${take ?? ""}`;
    }
    case "drop":
      return `Drop the ${card(choice.card)}`;
    case "pickup":
      return `Pick up the ${card(choice.card)}`;
    case "activate":
      return `Act with ${name(choice.figure)}, in the ${room(placeOf(state, choice.figure).room)}`;
    case "done":
      return `Finish ${name(acting(state))}'s actions`;
    case "end":
      return state.turn?.kind === "monster"
        ? "End the monster turn"
        : "End your turn";
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Move = { figure: FigureId; to: string; side: Edge | null };
type Discover = { figure: FigureId; direction: Edge };
type Rotation = { figure: FigureId; tile: string; doorway: Doorway };
type Trade = {
  from: FigureId;
  to: FigureId;
  give: string | null;
  take: string | null;
};
type Drop = { figure: FigureId; card: string };
type HauntRoll = { figure: FigureId; omen: string; room: string };

export const EXPLORATION_STEPS: Record<string, StepHandler> = {
  setup: defineStep<Setup>((state, p, ctx) => {
    const random = ctx.random;
    state.board = startingBoard(ctx.catalog, state.sets, random);
    for (const type of ["omen", "item", "event"] as const) {
      const cards = Object.values(ctx.catalog.cards)
        .filter((c) => c.type === type && state.sets.includes(c.set))
        .map((c) => c.id)
        .sort();
      state.decks[type] = { draw: random.shuffle(cards), discard: [] };
    }
    if (p.scenario) stackScenario(state, p.scenario);
    state.figures = Object.fromEntries(
      p.characters.map((character, seat): [FigureId, Figure] => [
        character,
        {
          id: character,
          kind: "explorer",
          definition: character,
          owner: seat,
          place: { room: "entrance-hall", side: null },
          traits: startingTraits(ctx.catalog.figures[character]),
          cards: [],
          statuses: [],
          stunned: false,
          alive: true,
        },
      ]),
    );
    const birthday = (seat: number) =>
      daysUntil(p.today, ctx.catalog.characters[p.characters[seat]].birthday);
    const chosen = p.scenario?.first ?? null;
    const first =
      chosen ??
      p.characters
        .map((_character, seat) => seat)
        .sort((a, b) => birthday(a) - birthday(b))[0];
    ctx.emit("game-started", chosen === null ? RULEBOOK(4) : SCENARIO_RULE, {
      first,
    });
    const haunt = p.scenario?.haunt ?? null;
    ctx.push(
      ...(p.scenario ? [step<PreparedScenario>("scenario", p.scenario)] : []),
      haunt
        ? step<HauntReveal>("start-haunt", haunt)
        : step<TurnStart>("turn-start", {
            seat: first,
            kind: "explorer",
            follows: null,
          }),
    );
  }),

  /** A scenario's haunt, revealed as if by its haunt roll. */
  "start-haunt": defineStep<HauntReveal>((state, p, ctx) => {
    revealHaunt(state, ctx, p);
    ctx.emit("haunt-started", SCENARIO_RULE, p);
  }),

  "turn-start": defineStep<TurnStart>((state, p, ctx) => {
    const explorer = turnExplorer(state, p);
    const actors =
      explorer !== null && inPlay(figureOf(state, explorer)) ? [explorer] : [];
    const previous = state.turn;
    state.turn = {
      seat: p.seat,
      kind: p.kind,
      follows: p.follows,
      // A monster turn's monsters are set as it starts (engine/monsters.ts).
      actors,
      acting: actors.at(0) ?? null,
      done: [],
      rolled: {},
      recovering: [],
      setUses:
        p.kind === "monster" &&
        previous?.seat === p.seat &&
        previous.kind === "traitor"
          ? previous.setUses
          : [],
      moved: {},
      movementEnded: [],
      rolls: {},
      handled: [],
      dropRoom: null,
      pickupRoom: null,
      traded: false,
      attacked: [],
      over: false,
      omens: [],
    };
    ctx.emit("turn-started", p.kind === "explorer" ? RULEBOOK(5) : RULEBOOK(16), {
      seat: p.seat,
      kind: p.kind,
      figure: explorer,
    });
    ctx.push(
      ...(p.kind === "monster" ? [monsterTurnStart()] : []),
      step<TurnParams>("turn-menu", { seat: p.seat }),
    );
  }),

  // A figure that can no longer act (dead, or a monster stunned on its own
  // turn, which stops at once: p. 18's project ruling) finishes acting.
  "turn-menu": defineStep<TurnParams>((state, p, ctx) => {
    const turn = state.turn;
    if (turn?.over) {
      ctx.push(step<TurnParams>("end-turn", p));
      return;
    }
    const figure = turn?.acting ?? null;
    if (
      turn?.kind === "monster" &&
      figure !== null &&
      (!inPlay(figureOf(state, figure)) || figureOf(state, figure).stunned)
    ) {
      ctx.push(finishActing(), step<TurnParams>("turn-menu", p));
      return;
    }
    ctx.decide([p.seat], "turn", p, RULEBOOK(6));
  }),

  move: defineStep<Move>((state, p, ctx) => {
    const from = goOut(state, ctx, p.figure, RULEBOOK(6), true);
    putFigure(state, p.figure, { room: p.to, side: p.side });
    ctx.emit("entered", RULEBOOK(6), {
      figure: p.figure,
      room: p.to,
      moved: true,
      from,
    });
    arrived(state, ctx, p.figure, p.to);
  }),

  discover: defineStep<Discover>((state, p, ctx) => {
    const doorway = { room: placeOf(state, p.figure).room, direction: p.direction };
    const tile = drawRoom(state, ctx.random.shuffle, (t) =>
      fits(ctx.engine, state, t, doorway),
    );
    if (tile === null)
      throw new Error(
        `Nothing can be discovered through ${doorway.room} ${doorway.direction}`,
      );
    ctx.decide(
      [controllerOf(ctx.engine, state, p.figure)],
      "rotation",
      { figure: p.figure, tile, doorway },
      RULEBOOK(6),
    );
  }),

  "offer-trade": defineStep<Trade>((state, p, ctx) => {
    ctx.decide(
      [controllerOf(ctx.engine, state, p.to)],
      "trade-offer",
      p,
      RULEBOOK(11),
    );
  }),

  drop: defineStep<Drop>((state, p, ctx) => {
    const room = placeOf(state, p.figure).room;
    handle(state, p.card);
    if (state.turn) state.turn.dropRoom = room;
    ctx.push(loseCard(p.figure, p.card, { to: "room", room }, RULEBOOK(11)));
  }),

  pickup: defineStep<Drop>((state, p, ctx) => {
    const room = placeOf(state, p.figure).room;
    takeFromPile(state, room, p.card);
    handle(state, p.card);
    if (state.turn) state.turn.pickupRoom = room;
    ctx.push(gainCard(p.figure, p.card, "picked-up", RULEBOOK(11)));
  }),

  "end-turn": defineStep<TurnParams>((state, p, ctx) => {
    const turn = state.turn;
    if (!turn) throw new Error("No turn to end");
    const figure = turnExplorer(state, turn);
    ctx.emit("turn-ended", RULEBOOK(6), {
      seat: p.seat,
      figure,
      room: figure === null ? null : (figureOf(state, figure).place?.room ?? null),
    });
    ctx.push(
      ...turn.omens.map((o) =>
        step<HauntRoll>("haunt-roll", {
          figure: o.figure,
          omen: o.card,
          room: o.room,
        }),
      ),
      ...(turn.recovering.length > 0 ? [recoverStunned()] : []),
      step<null>("next-turn", null),
    );
  }),

  "haunt-roll": defineStep<HauntRoll>((state, p, ctx) => {
    if (state.status !== "exploring") return;
    ctx.push(
      roll(
        p.figure,
        { kind: "haunt" },
        RULEBOOK(15),
        step<HauntRoll>("haunt-check", p),
      ),
    );
  }),

  "haunt-check": defineStep<HauntRoll & { result: number }>((state, p, ctx) => {
    if (p.result >= state.omensDrawn) {
      ctx.emit("haunt-held-off", RULEBOOK(15), {
        figure: p.figure,
        result: p.result,
        omens: state.omensDrawn,
      });
      return;
    }
    const number = ctx.catalog.chart.cells[p.room]?.[p.omen];
    if (number === undefined)
      throw new Error(
        `The haunt chart has no cell for ${p.room} and ${p.omen}`,
      );
    // The revealer is the player who made the roll.
    revealHaunt(state, ctx, {
      number,
      revealer: controllerOf(ctx.engine, state, p.figure),
      omen: p.omen,
      room: p.room,
    });
    ctx.emit("haunt-revealed", RULEBOOK(15), {
      figure: p.figure,
      result: p.result,
      omens: state.omensDrawn,
      haunt: number,
    });
  }),

  // The next turn is worked out afresh at every boundary: a turn a rule
  // inserted comes first, then the order carries on from the last turn taken
  // in order (rules p. 16).
  "next-turn": defineStep<null>((state, _p, ctx) => {
    const turn = state.turn;
    const inserted = state.insertedTurns.shift();
    const current: TurnRef | null =
      turn === null ? null : (turn.follows ?? { seat: turn.seat, kind: turn.kind });
    if (inserted) {
      ctx.push(
        step<TurnStart>("turn-start", {
          seat: inserted.seat,
          kind: inserted.kind,
          follows: current,
        }),
      );
      return;
    }
    const round = askStructured(ctx.engine, state, "turnOrder", {});
    ctx.push(
      step<TurnStart>("turn-start", {
        ...turnAfter(state, round, current),
        follows: null,
      }),
    );
  }),
};

export const EXPLORATION_DECISIONS: Record<string, DecisionKind> = {
  turn: defineDecision<TurnParams, TurnChoice>({
    candidates: (state, _p, _seat, engine) => turnCandidates(engine, state),
    label: (state, _p, choice, engine) =>
      describeTurnChoice(engine, state, choice),
    resolve: (state, p, choice, ctx) => {
      const work = takeTurnChoice(ctx.engine, state, p.seat, choice);
      if (typeof work === "string") return work;
      ctx.push(
        ...work,
        ...(choice.act === "end" ? [] : [step<TurnParams>("turn-menu", p)]),
      );
      return null;
    },
  }),

  rotation: defineDecision<Rotation, number>({
    candidates: (state, p, _seat, engine) =>
      doorwayPlacements(engine, state, p.tile, p.doorway).map(
        (placement) => placement.rotation,
      ),
    label: (_state, p, rotation, engine) =>
      `Place the ${engine.catalog.rooms[p.tile].name} turned ${rotation * 90}°`,
    resolve: (state, p, rotation, ctx) => {
      const placement = doorwayPlacements(
        ctx.engine,
        state,
        p.tile,
        p.doorway,
      ).find((pl) => pl.rotation === rotation);
      if (!placement) return "That placement isn't allowed";
      const { spot } = doorwaySpot(state.board, p.doorway);
      state.board.tiles.push({
        tile: p.tile,
        ...spot,
        rotation: placement.rotation,
      });
      discoverRoom(state, ctx, p.figure, p.tile, RULEBOOK(6), {
        moved: true,
        draws: true,
        after: [],
        side: null,
      });
      return null;
    },
  }),

  "trade-offer": defineDecision<Trade, boolean>({
    candidates: () => [true, false],
    label: (_state, _p, accept) =>
      accept ? "Accept the trade" : "Decline the trade",
    resolve: (state, p, accept, ctx) => {
      if (!accept) {
        ctx.emit("trade-declined", RULEBOOK(11), p);
        return null;
      }
      const moves: [FigureId, FigureId, string | null][] = [
        [p.from, p.to, p.give],
        [p.to, p.from, p.take],
      ];
      if (state.turn) state.turn.traded = true;
      ctx.emit("traded", RULEBOOK(11), p);
      ctx.push(
        ...moves.flatMap(([giver, taker, card]) => {
          if (card === null) return [];
          handle(state, card);
          return [
            loseCard(
              giver,
              card,
              { to: "figure", figure: taker, by: "traded" },

              RULEBOOK(11),
            ),
          ];
        }),
      );
      return null;
    },
  }),
};
