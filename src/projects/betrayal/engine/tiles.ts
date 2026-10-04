import type {
  Board,
  Catalog,
  Edge,
  FloorId,
  GameState,
  Rotation,
  RuleRef,
  Step,
} from "../types";
import {
  COMPASS,
  doorToward,
  doorwaySpot,
  EDGES,
  FLOOR_NAMES,
  freeDoorways,
  liftTile,
  neighbourCell,
  openings,
  opposite,
  placed,
  placementsAt,
  roomAt,
  turn,
  type Placement,
  type Spot,
} from "./board";
import {
  chooseSide,
  continueWith,
  defineDecision,
  defineStep,
  drawCard,
  leaveRoom,
  step,
} from "./effects";
import { explorerAt, putExplorer } from "./explorers";
import { barrierSides } from "./questions";
import type { DecisionKind, StepContext, StepHandler } from "./step-loop";

// Putting room tiles in the house and moving them: discovering through a
// doorway, a card that puts a drawn tile in the house, a room that moves.
// One placement rule covers them all (p. 6, p. 9).

const RULEBOOK = (page: number): RuleRef => ({ source: "rulebook", page });

/** Where a tile may go. */
export type Where =
  /** Against a free doorway on one of these floors, as when exploring: one of
   *  the tile's doors faces it. `except` is the cell a moving tile leaves. */
  | { kind: "doorways"; floors: FloorId[]; except: Spot | null }
  /** On this empty cell, any way round (beyond a Wall Switch). */
  | { kind: "cell"; spot: Spot };

export type PlaceChoice = Spot & { rotation: Rotation };

/** The ways a tile may go on a cell: on a floor its back allows, never
 *  sealing a floor (p. 9), lining up as many doors as possible (p. 6).
 *  Rotations that leave the same doorways are one choice. */
export function bestPlacements(
  catalog: Catalog,
  board: Board,
  tile: string,
  spot: Spot,
  facing: Edge[] | null,
): Placement[] {
  if (!catalog.rooms[tile].floors.includes(spot.floor)) return [];
  const open = placementsAt(board, catalog, tile, spot, facing).filter(
    (p) => !p.seals,
  );
  const most = Math.max(...open.map((p) => p.matched));
  const seen = new Set<string>();
  return open.filter((p) => {
    if (p.matched !== most) return false;
    const key = EDGES.filter((edge) =>
      catalog.rooms[tile].doors.some((door) => turn(door, p.rotation) === edge),
    ).join();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sameCell = (a: Spot, b: Spot) =>
  a.floor === b.floor && a.x === b.x && a.y === b.y;

/** Every legal way to put a tile somewhere it may go. A tile already in the
 *  house is moved, so it is picked up first. */
export function placeOptions(
  catalog: Catalog,
  board: Board,
  tile: string,
  where: Where,
): PlaceChoice[] {
  const withRotations = (spot: Spot, facing: Edge[] | null) =>
    bestPlacements(catalog, board, tile, spot, facing).map((p) => ({
      ...spot,
      rotation: p.rotation,
    }));
  if (where.kind === "cell") return withRotations(where.spot, null);
  const lifted = liftTile(board, tile);
  const result: PlaceChoice[] = [];
  for (const floor of where.floors) {
    // Several doorways can open onto one cell; the tile may face any of them.
    const cells: { spot: Spot; facing: Edge[] }[] = [];
    for (const doorway of freeDoorways(lifted, catalog, floor)) {
      const { spot, back } = doorwaySpot(lifted, doorway);
      if (where.except && sameCell(spot, where.except)) continue;
      const found = cells.find((c) => sameCell(c.spot, spot));
      if (found) found.facing.push(back);
      else cells.push({ spot, facing: [back] });
    }
    for (const { spot, facing } of cells)
      result.push(...withRotations(spot, facing));
  }
  return result;
}

/** Draws room tiles from the top of the stack until one passes, putting the
 *  rest on the discard pile (p. 8). An empty stack is refilled from the
 *  shuffled discards (p. 9), unless the rule makes one pass through the stack.
 *  Null when no tile passes. */
export function drawRoom(
  state: GameState,
  shuffle: <T>(items: readonly T[]) => T[],
  passes: (tile: string) => boolean,
  reshuffle = true,
): string | null {
  if (!reshuffle) {
    for (;;) {
      const tile = state.board.stack.shift();
      if (tile === undefined) return null;
      if (passes(tile)) return tile;
      state.board.discards.push(tile);
    }
  }
  if (![...state.board.stack, ...state.board.discards].some(passes))
    return null;
  for (;;) {
    if (state.board.stack.length === 0) {
      state.board.stack = shuffle(state.board.discards);
      state.board.discards = [];
    }
    const tile = state.board.stack.shift();
    if (tile === undefined)
      throw new Error(
        "Room stack ran dry with a passing tile still unaccounted for",
      );
    if (passes(tile)) return tile;
    state.board.discards.push(tile);
  }
}

type Arrive = { seat: number; room: string; moved: boolean; rule: RuleRef };

/** An explorer goes into a room just put in the house, which discovers it.
 *  They draw the cards for its symbols before its own text applies (p. 9),
 *  then enter it; `after` runs once they are in. Moving in through a door of
 *  a barrier room puts them on that door's side; being put in one, they are
 *  on `side`, which they chose (p. 7). */
export function discoverRoom(
  state: GameState,
  ctx: StepContext,
  seat: number,
  room: string,
  rule: RuleRef,
  how: { moved: boolean; draws: boolean; after: Step[]; side: Edge | null },
): void {
  const from = explorerAt(state, seat).room;
  const barrier = barrierSides(ctx.engine, room).length > 0;
  const side = !barrier
    ? null
    : how.moved
      ? doorToward(state.board, ctx.catalog, room, from)
      : how.side;
  if (barrier && side === null)
    throw new Error(`No side to enter the barrier room ${room} on`);
  ctx.emit("left", rule, { seat, room: from, moved: how.moved });
  putExplorer(state, seat, { room, side });
  if (how.moved && state.turn) state.turn.moved += 1;
  ctx.emit("discovered", rule, { seat, room });
  const symbols = how.draws
    ? (ctx.engine.behaviours.rooms[room]?.discoveryDraws ??
      ctx.catalog.rooms[room].symbols)
    : [];
  ctx.push(
    ...symbols.map((type) => drawCard(seat, type, RULEBOOK(10))),
    step<Arrive>("arrive", { seat, room, moved: how.moved, rule }),
    ...how.after,
  );
}

type EnterNewRoom = {
  seat: number;
  /** Null until the room is drawn: `drawRoomTile` fills it in. */
  room: string | null;
  rule: RuleRef;
  draws: boolean;
  after: Step[];
  /** The side of a barrier room they land on, once chosen. */
  side: Edge | null;
};

/** Puts an explorer in a room a card has just put in the house, without
 *  moving there. It counts as discovering the room, so they draw for its
 *  symbols (1st-edition FAQ) unless the card says otherwise. Leaving their room
 *  first runs its rules for leaving; `after` runs only once they are in. */
export function enterNewRoom(
  seat: number,
  room: string | null,
  rule: RuleRef,
  how: { draws: boolean; after?: Step[] },
): Step {
  return step<EnterNewRoom>("enter-new-room", {
    seat,
    room,
    rule,
    draws: how.draws,
    after: how.after ?? [],
    side: null,
  });
}

type DrawRoomTile = {
  seat: number;
  where: Where;
  reshuffle: boolean;
  rule: RuleRef;
  then: Step;
  otherwise: Step[] | null;
};

/** Draws room tiles until one can go `where`, and has `seat` choose where it
 *  goes. `then` continues with the tile as `room`. When no tile can go there,
 *  `otherwise` runs; null means the rule never asks when none can. */
export function drawRoomTile(
  seat: number,
  where: Where,
  rule: RuleRef,
  next: { then: Step; otherwise: Step[] | null; reshuffle?: boolean },
): Step {
  return step<DrawRoomTile>("draw-room-tile", {
    seat,
    where,
    reshuffle: next.reshuffle ?? true,
    rule,
    then: next.then,
    otherwise: next.otherwise,
  });
}

type PlaceRoom = {
  seat: number;
  tile: string;
  where: Where;
  /** A moving tile may also stay where it is. */
  stay: boolean;
  rule: RuleRef;
  then: Step[];
  otherwise: Step[];
};

/** Has `seat` put a tile in the house, or move one already there, somewhere
 *  it may go. When it can go nowhere, a tile in the house stays put and
 *  `otherwise` runs. */
export function placeRoom(
  seat: number,
  tile: string,
  where: Where,
  rule: RuleRef,
  next: { then?: Step[]; otherwise?: Step[]; stay?: boolean } = {},
): Step {
  return step<PlaceRoom>("place-room", {
    seat,
    tile,
    where,
    stay: next.stay ?? false,
    rule,
    then: next.then ?? [],
    otherwise: next.otherwise ?? [],
  });
}

export const TILE_STEPS: Record<string, StepHandler> = {
  arrive: defineStep<Arrive>((state, p, ctx) => {
    // A card drawn for the room may have sent the explorer on (Mystic
    // Slide): they are no longer there, so its text doesn't apply to them.
    if (explorerAt(state, p.seat).room !== p.room) return;
    ctx.emit("entered", p.rule, {
      seat: p.seat,
      room: p.room,
      moved: p.moved,
      discovered: true,
    });
  }),

  "enter-new-room": defineStep<EnterNewRoom>((_state, p, ctx) => {
    if (p.room === null) throw new Error("No room to enter");
    ctx.push(leaveRoom(p.seat, step<EnterNewRoom>("into-new-room", p)));
  }),

  "into-new-room": defineStep<EnterNewRoom>((state, p, ctx) => {
    if (p.room === null) throw new Error("No room to enter");
    const sides = barrierSides(ctx.engine, p.room);
    if (sides.length > 0 && p.side === null) {
      ctx.push(
        chooseSide(
          state,
          p.seat,
          p.room,
          sides,
          p.rule,
          step<EnterNewRoom>("into-new-room", p),
          ctx.catalog.rooms[p.room].name,
        ),
      );
      return;
    }
    discoverRoom(state, ctx, p.seat, p.room, p.rule, {
      moved: false,
      draws: p.draws,
      after: p.after,
      side: p.side,
    });
  }),

  "draw-room-tile": defineStep<DrawRoomTile>((state, p, ctx) => {
    const tile = drawRoom(
      state,
      ctx.random.shuffle,
      (t) => placeOptions(ctx.catalog, state.board, t, p.where).length > 0,
      p.reshuffle,
    );
    if (tile === null) {
      if (p.otherwise === null)
        throw new Error("No room tile can go where the rule needs one");
      ctx.emit("room-not-found", p.rule, { seat: p.seat });
      ctx.push(...p.otherwise);
      return;
    }
    ctx.push(
      placeRoom(p.seat, tile, p.where, p.rule, {
        then: [continueWith(p.then, { room: tile })],
      }),
    );
  }),

  "place-room": defineStep<PlaceRoom>((state, p, ctx) => {
    if (placeOptions(ctx.catalog, state.board, p.tile, p.where).length > 0) {
      ctx.decide([p.seat], "place-tile", p, p.rule);
      return;
    }
    if (placed(state.board, p.tile))
      ctx.emit("room-stayed", p.rule, { tile: p.tile });
    ctx.push(...p.otherwise);
  }),
};

/** Where a cell is, by a room next to it: one with a door toward it if any. */
function spotLabel(
  catalog: Catalog,
  board: Board,
  tile: string,
  choice: PlaceChoice,
): string {
  const lifted = liftTile(board, tile);
  const next = EDGES.flatMap((direction) => {
    const cell = neighbourCell(choice, direction);
    const room = roomAt(lifted, choice.floor, cell.x, cell.y);
    return room ? [{ direction, room }] : [];
  });
  const by =
    next.find(({ direction, room }) =>
      openings(catalog, room).includes(opposite(direction)),
    ) ?? next.at(0);
  const where = by
    ? `${COMPASS[opposite(by.direction)]} of the ${catalog.rooms[by.room.tile].name}`
    : `at (${choice.x}, ${choice.y})`;
  return `on the ${FLOOR_NAMES[choice.floor]}, ${where}, turned ${choice.rotation * 90}°`;
}

export const TILE_DECISIONS: Record<string, DecisionKind> = {
  "place-tile": defineDecision<PlaceRoom, PlaceChoice | null>({
    candidates: (state, p, _seat, engine) => [
      ...(p.stay ? [null] : []),
      ...placeOptions(engine.catalog, state.board, p.tile, p.where),
    ],
    label: (state, p, choice, engine) => {
      const name = engine.catalog.rooms[p.tile].name;
      return choice === null
        ? `Leave the ${name} where it is`
        : `Put the ${name} ${spotLabel(engine.catalog, state.board, p.tile, choice)}`;
    },
    resolve: (state, p, choice, ctx) => {
      if (choice === null) {
        if (!p.stay) return "The room has to go somewhere";
        ctx.emit("room-stayed", p.rule, { tile: p.tile });
        ctx.push(...p.then);
        return null;
      }
      const legal = placeOptions(ctx.catalog, state.board, p.tile, p.where);
      if (
        !legal.some(
          (o) => sameCell(o, choice) && o.rotation === choice.rotation,
        )
      )
        return "That placement isn't allowed";
      const tile = placed(state.board, p.tile);
      const at = {
        floor: choice.floor,
        x: choice.x,
        y: choice.y,
        rotation: choice.rotation,
      };
      if (tile) {
        const from = tile.floor;
        Object.assign(tile, at);
        ctx.emit("room-moved", p.rule, { tile: p.tile, from, floor: at.floor });
      } else {
        state.board.tiles.push({ tile: p.tile, ...at });
        ctx.emit("room-placed", p.rule, { tile: p.tile, floor: at.floor });
      }
      ctx.push(...p.then);
      return null;
    },
  }),
};

/** Json-safe spot of a placed room. */
export function spotOf(board: Board, room: string): Spot {
  const tile = placed(board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  return { floor: tile.floor, x: tile.x, y: tile.y };
}
