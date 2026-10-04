import type {
  Catalog,
  Edge,
  FloorId,
  GameState,
  RuleRef,
  SetId,
  Step,
  Trait,
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
  explorerAt,
  placeOf,
  putExplorer,
  together,
  TRAITS,
} from "./explorers";
import {
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
import { askNumber, askPermission, askSet } from "./questions";
import {
  atSource,
  liveSources,
  type Source,
  type SourceAction,
} from "./sources";
import { emptyState } from "./state";
import { bestPlacements, discoverRoom, drawRoom } from "./tiles";
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
}

/** Sets a game up and runs it to the first player's first decision. */
export function newGame(engine: Engine, game: NewGame): GameState {
  validateSeats(engine.catalog, game.seats);
  const state = emptyState(game.gameId, game.seed, game.sets);
  state.seats = game.seats.map((s) => ({ name: s.name, controller: "human" }));
  return start(engine, state, [
    step<Setup>("setup", {
      characters: game.seats.map((s) => s.character),
      today: game.today,
    }),
  ]);
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

type Setup = { characters: string[]; today: { month: number; day: number } };

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
  | { act: "trade"; with: number; give: string | null; take: string | null }
  | { act: "drop"; card: string }
  | { act: "pickup"; card: string }
  | { act: "end" };

type TurnParams = { seat: number };

function movementLeft(engine: Engine, state: GameState, seat: number): number {
  if (!state.turn || state.turn.movementEnded) return 0;
  return askNumber(engine, state, "movement", { seat }) - state.turn.moved;
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

/** Whether a source's action is offered to this explorer: a card's to its
 *  holder while the card is unused this turn, or to anyone with its holder
 *  when it says so; a room's or token's to an explorer there. */
function offeredHere(
  state: GameState,
  seat: number,
  source: Source,
  definition: SourceAction,
): boolean {
  const explorer = explorerAt(state, seat);
  if (source.kind !== "card") return atSource(source, explorer.room);
  if (source.holder === null) return false;
  if (definition.offeredTo === "room")
    return together(explorerAt(state, source.holder), explorer);
  return source.holder === seat && !isHandled(state, source.id);
}

function cardActions(
  engine: Engine,
  state: GameState,
  seat: number,
): { source: Source; action: string; definition: SourceAction }[] {
  const result: { source: Source; action: string; definition: SourceAction }[] =
    [];
  for (const { source, behaviour } of liveSources(engine.behaviours, state)) {
    for (const [action, definition] of Object.entries(
      behaviour.actions ?? {},
    )) {
      if (
        offeredHere(state, seat, source, definition) &&
        definition.available(state, seat, source, engine)
      )
        result.push({ source, action, definition });
    }
  }
  return result;
}

function canMoveItem(
  engine: Engine,
  state: GameState,
  card: string,
  how: "trade" | "drop",
): boolean {
  return engine.catalog.cards[card].transfer[how] && !isHandled(state, card);
}

/** Where an explorer can move one space to. */
function moves(engine: Engine, state: GameState, seat: number) {
  return askSet(engine, state, "connections", {
    mover: { kind: "explorer", seat },
    from: placeOf(state, seat),
  });
}

/** In a barrier room only the door on your own side is in reach (p. 7). */
function inReach(state: GameState, seat: number, direction: Edge): boolean {
  const { room, side } = placeOf(state, seat);
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

function turnCandidates(
  engine: Engine,
  state: GameState,
  seat: number,
): TurnChoice[] {
  const end: TurnChoice = { act: "end" };
  if (!askPermission(engine, state, "canAct", { seat }).allowed)
    return [
      ...cardActions(engine, state, seat)
        .filter(({ definition }) => definition.escape === true)
        .map(
          ({ source, action }): TurnChoice => ({
            act: "action",
            source: source.kind,
            id: source.id,
            action,
          }),
        ),
      end,
    ];
  const explorer = explorerAt(state, seat);
  const choices: TurnChoice[] = [];
  for (const to of moves(engine, state, seat))
    choices.push({ act: "move", to: to.room, side: to.side });
  for (const doorway of freeDoorways(
    state.board,
    engine.catalog,
    floorOf(state, explorer.room),
  )) {
    if (doorway.room === explorer.room && inReach(state, seat, doorway.direction))
      choices.push({ act: "discover", direction: doorway.direction });
  }
  for (const { source, action } of cardActions(engine, state, seat)) {
    choices.push({ act: "action", source: source.kind, id: source.id, action });
  }
  for (const other of state.explorers) {
    if (other.seat === seat || !together(other, explorer)) continue;
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
          choices.push({ act: "trade", with: other.seat, give, take });
  }
  for (const card of explorer.cards) choices.push({ act: "drop", card });
  for (const card of state.piles[explorer.room] ?? [])
    choices.push({ act: "pickup", card });
  choices.push(end);
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
  const explorer = explorerAt(state, seat);
  switch (choice.act) {
    case "move": {
      if (movementLeft(engine, state, seat) <= 0) return "No movement left";
      if (
        !moves(engine, state, seat).some(
          (p) => p.room === choice.to && p.side === choice.side,
        )
      )
        return "That room isn't connected";
      if (
        !askPermission(engine, state, "canMove", {
          seat,
          from: explorer.room,
          to: choice.to,
        }).allowed
      )
        return "Something stops that move";
      return [
        leaveRoom(
          seat,
          step<Move>("move", { seat, to: choice.to, side: choice.side }),
        ),
      ];
    }
    case "discover": {
      if (movementLeft(engine, state, seat) <= 0) return "No movement left";
      const doorway = { room: explorer.room, direction: choice.direction };
      if (
        !freeDoorways(
          state.board,
          engine.catalog,
          floorOf(state, explorer.room),
        ).some(
          (d) => d.room === doorway.room && d.direction === doorway.direction,
        )
      ) {
        return "That doorway doesn't open onto anything";
      }
      if (!inReach(state, seat, choice.direction))
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
          seat,
          step<Discover>("discover", { seat, direction: choice.direction }),
        ),
      ];
    }
    case "action": {
      const found = cardActions(engine, state, seat).find(
        (a) =>
          a.source.kind === choice.source &&
          a.source.id === choice.id &&
          a.action === choice.action,
      );
      if (!found) return "That action isn't available";
      const { source, definition } = found;
      if (source.kind === "card" && definition.offeredTo !== "room")
        handle(state, source.id);
      return definition.steps(state, seat, source);
    }
    case "trade": {
      if (turn.traded) return "You have already traded this turn";
      const other = state.explorers.find((e) => e.seat === choice.with);
      if (!other || !together(other, explorer))
        return "You can only trade with an explorer in your room";
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
          from: seat,
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
      if (turn.dropRoom !== null && turn.dropRoom !== explorer.room)
        return "You have already dropped items elsewhere this turn";
      return [step<Drop>("drop", { seat, card: choice.card })];
    }
    case "pickup": {
      if (
        !(state.piles[explorer.room] ?? []).includes(choice.card) ||
        isHandled(state, choice.card)
      )
        return "You can't pick that up";
      if (turn.pickupRoom !== null && turn.pickupRoom !== explorer.room)
        return "You have already picked up items elsewhere this turn";
      return [step<Drop>("pickup", { seat, card: choice.card })];
    }
    case "end":
      return [step<TurnParams>("end-turn", { seat })];
  }
}

function describeTurnChoice(
  engine: Engine,
  state: GameState,
  seat: number,
  choice: TurnChoice,
): string {
  const room = (id: string) => engine.catalog.rooms[id].name;
  const card = (id: string) => engine.catalog.cards[id].name;
  const name = (s: number) =>
    engine.catalog.characters[explorerAt(state, s).character].name;
  switch (choice.act) {
    case "move":
      return choice.side === null
        ? `Move to the ${room(choice.to)}`
        : `Move to the ${room(choice.to)}, on its ${sideName(state.board, choice.to, choice.side)} side`;
    case "discover":
      return `Explore through the ${COMPASS[choice.direction]} door of the ${room(explorerAt(state, seat).room)}`;
    case "action": {
      const behaviour = liveSources(engine.behaviours, state).find(
        (s) => s.source.kind === choice.source && s.source.id === choice.id,
      )?.behaviour;
      return behaviour?.actions?.[choice.action]?.label ?? choice.action;
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
    case "end":
      return "End your turn";
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Move = { seat: number; to: string; side: Edge | null };
type Discover = { seat: number; direction: Edge };
type Rotation = { seat: number; tile: string; doorway: Doorway };
type Trade = {
  from: number;
  to: number;
  give: string | null;
  take: string | null;
};
type Drop = { seat: number; card: string };
type HauntRoll = { seat: number; omen: string; room: string };

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
    state.explorers = p.characters.map((character, seat) => ({
      seat,
      character,
      room: "entrance-hall",
      clips: Object.fromEntries(
        TRAITS.map((t) => [t, ctx.catalog.characters[character].start[t]]),
      ) as Record<Trait, number>,
      overTop: [],
      cards: [],
    }));
    const first = [...state.explorers].sort(
      (a, b) =>
        daysUntil(p.today, ctx.catalog.characters[a.character].birthday) -
        daysUntil(p.today, ctx.catalog.characters[b.character].birthday),
    )[0];
    ctx.emit("game-started", RULEBOOK(4), { first: first.seat });
    ctx.push(step<TurnParams>("turn-start", { seat: first.seat }));
  }),

  "turn-start": defineStep<TurnParams>((state, p, ctx) => {
    state.turn = {
      seat: p.seat,
      moved: 0,
      movementEnded: false,
      rolls: [],
      handled: [],
      dropRoom: null,
      pickupRoom: null,
      traded: false,
      attacked: false,
      over: false,
      omens: [],
    };
    ctx.emit("turn-started", RULEBOOK(5), { seat: p.seat });
    ctx.push(step<TurnParams>("turn-menu", p));
  }),

  "turn-menu": defineStep<TurnParams>((state, p, ctx) => {
    if (state.turn?.over) ctx.push(step<TurnParams>("end-turn", p));
    else ctx.decide([p.seat], "turn", p, RULEBOOK(6));
  }),

  move: defineStep<Move>((state, p, ctx) => {
    const explorer = explorerAt(state, p.seat);
    ctx.emit("left", RULEBOOK(6), {
      seat: p.seat,
      room: explorer.room,
      moved: true,
    });
    putExplorer(state, p.seat, { room: p.to, side: p.side });
    if (state.turn) state.turn.moved += 1;
    ctx.emit("entered", RULEBOOK(6), { seat: p.seat, room: p.to, moved: true });
  }),

  discover: defineStep<Discover>((state, p, ctx) => {
    const explorer = explorerAt(state, p.seat);
    const doorway = { room: explorer.room, direction: p.direction };
    const tile = drawRoom(state, ctx.random.shuffle, (t) =>
      fits(ctx.engine, state, t, doorway),
    );
    if (tile === null)
      throw new Error(
        `Nothing can be discovered through ${doorway.room} ${doorway.direction}`,
      );
    ctx.decide(
      [p.seat],
      "rotation",
      { seat: p.seat, tile, doorway },
      RULEBOOK(6),
    );
  }),

  "offer-trade": defineStep<Trade>((_state, p, ctx) => {
    ctx.decide([p.to], "trade-offer", p, RULEBOOK(11));
  }),

  drop: defineStep<Drop>((state, p, ctx) => {
    const room = explorerAt(state, p.seat).room;
    handle(state, p.card);
    if (state.turn) state.turn.dropRoom = room;
    ctx.push(loseCard(p.seat, p.card, { to: "room", room }, RULEBOOK(11)));
  }),

  pickup: defineStep<Drop>((state, p, ctx) => {
    const explorer = explorerAt(state, p.seat);
    takeFromPile(state, explorer.room, p.card);
    handle(state, p.card);
    if (state.turn) state.turn.pickupRoom = explorer.room;
    ctx.push(gainCard(p.seat, p.card, "picked-up", RULEBOOK(11)));
  }),

  "end-turn": defineStep<TurnParams>((state, p, ctx) => {
    const turn = state.turn;
    if (!turn) throw new Error("No turn to end");
    ctx.emit("turn-ended", RULEBOOK(6), {
      seat: p.seat,
      room: explorerAt(state, p.seat).room,
    });
    ctx.push(
      ...turn.omens.map((o) =>
        step<HauntRoll>("haunt-roll", {
          seat: p.seat,
          omen: o.card,
          room: o.room,
        }),
      ),
      step<TurnParams>("next-turn", p),
    );
  }),

  "haunt-roll": defineStep<HauntRoll>((state, p, ctx) => {
    if (state.status !== "exploring") return;
    ctx.push(
      roll(
        p.seat,
        { kind: "haunt" },
        RULEBOOK(15),
        step<HauntRoll>("haunt-check", p),
      ),
    );
  }),

  "haunt-check": defineStep<HauntRoll & { result: number }>((state, p, ctx) => {
    if (p.result >= state.omensDrawn) {
      ctx.emit("haunt-held-off", RULEBOOK(15), {
        seat: p.seat,
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
    state.haunt = { number, revealer: p.seat, omen: p.omen, room: p.room };
    state.status = "haunt";
    state.work = [];
    ctx.emit("haunt-revealed", RULEBOOK(15), {
      seat: p.seat,
      result: p.result,
      omens: state.omensDrawn,
      haunt: number,
    });
  }),

  "next-turn": defineStep<TurnParams>((state, p, ctx) => {
    if (state.status !== "exploring") return;
    ctx.push(
      step<TurnParams>("turn-start", {
        seat: (p.seat + 1) % state.seats.length,
      }),
    );
  }),
};

export const EXPLORATION_DECISIONS: Record<string, DecisionKind> = {
  turn: defineDecision<TurnParams, TurnChoice>({
    candidates: (state, p, _seat, engine) =>
      turnCandidates(engine, state, p.seat),
    label: (state, p, choice, engine) =>
      describeTurnChoice(engine, state, p.seat, choice),
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
      discoverRoom(state, ctx, p.seat, p.tile, RULEBOOK(6), {
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
      const moves: [number, number, string | null][] = [
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
              { to: "explorer", seat: taker, by: "traded" },
              RULEBOOK(11),
            ),
          ];
        }),
      );
      return null;
    },
  }),
};
