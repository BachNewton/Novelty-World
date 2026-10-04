import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { distances, doorwaySpot, freeDoorways } from "./engine/board";
import { describeDecision, describeEvent } from "./engine/describe";
import { newGame, type TurnChoice } from "./engine/exploration";
import { allFigures, roomOf } from "./engine/figures";
import { migrate } from "./engine/format";
import { activeHaunt } from "./engine/haunt";
import { apply, choices, type Choice, type Engine } from "./engine/step-loop";
import { bestPlacements } from "./engine/tiles";
import { ENGINE } from "./game";
import type { Action, CardType, FloorId, GameState, Json } from "./types";

// Plays whole games headlessly with a random but legal policy on every seat,
// checking the engine's invariants after every write. Seeded, so a failing
// seed replays exactly.

export interface SimulationResult {
  seed: string;
  /** "haunt": a haunt that isn't built yet was revealed, which stops the
   *  game. "finished": a built haunt was played to its end. */
  ending: "haunt" | "house-full" | "finished";
  turns: number;
  decisions: number;
  /** Decision kinds answered, with how many times; a turn choice also counts
   *  as `turn:<act>`, and a decision put to a seat whose turn it isn't also
   *  as `off-turn:<kind>`. */
  kinds: Record<string, number>;
}

/** Turns a game may take before the policy is judged to have stalled. */
const TURN_LIMIT = 600;
/** Rounds still played once no explorer can reach a room left to discover. */
const ROUNDS_AFTER_FULL = 2;
/** Writes remembered for a failure's report. */
const HISTORY = 12;

/** The engine with every haunt roll held off, so a game plays on until the
 *  house is full and every deck gets drawn deep. */
export const NO_HAUNT_ENGINE: Engine = holdOffHaunt(ENGINE);

function holdOffHaunt(engine: Engine): Engine {
  const check = engine.rules.steps["haunt-check"];
  if (!check) throw new Error("No haunt-check step to hold off");
  return {
    ...engine,
    rules: {
      ...engine.rules,
      steps: {
        ...engine.rules.steps,
        "haunt-check": (state, params, ctx) => {
          check(
            state,
            { ...(params as { [key: string]: Json }), result: 99 },
            ctx,
          );
        },
      },
    },
  };
}

export function simulate(
  seed: string,
  engine: Engine = ENGINE,
): SimulationResult {
  const rng = createRng(`simulation/${seed}`);
  const history: string[] = [];
  let state: GameState | null = null;
  try {
    state = newGame(engine, {
      gameId: `sim-${seed}`,
      seed,
      sets: ["base"],
      seats: pickCharacters(engine, rng).map((character, i) => ({
        name: `Player ${i + 1}`,
        character,
      })),
      today: { month: 1 + below(rng, 12), day: 1 + below(rng, 28) },
    });
    record(engine, state, history, "setup");
    checkState(engine, state);
    const kinds: Record<string, number> = {};
    let decisions = 0;
    let turns = 0;
    let turnSeat = state.turn?.seat ?? -1;
    let actionsThisTurn = 0;
    let fullAt: number | null = null;
    for (;;) {
      if (state.status === "finished")
        return { seed, ending: "finished", turns, decisions, kinds };
      if (state.status === "haunt" && state.pending === null)
        return { seed, ending: "haunt", turns, decisions, kinds };
      if (
        state.status === "exploring" &&
        fullAt === null &&
        houseFull(engine, state)
      )
        fullAt = turns;
      if (
        state.status === "exploring" &&
        fullAt !== null &&
        turns - fullAt >= ROUNDS_AFTER_FULL * state.seats.length
      )
        return { seed, ending: "house-full", turns, decisions, kinds };
      if (turns > TURN_LIMIT)
        throw new Error(
          `The game hasn't ended after ${TURN_LIMIT} turns (${state.status}, ${state.board.stack.length} rooms left in the stack)`,
        );

      const pending = state.pending;
      if (!pending) throw new Error("The game stopped with nothing pending");
      let action: Action;
      if (pending.type === "ready") {
        const seat = pending.seats[below(rng, pending.seats.length)];
        action = { kind: "ready", wait: pending.id, seat };
      } else {
        const seat = pending.seats.find((s) => !(s in pending.answers));
        if (seat === undefined) throw new Error("Every addressee has answered");
        const listed = choices(engine, state, seat);
        if (listed.length === 0)
          throw new Error(`Decision ${pending.kind} offers no choice`);
        checkListedAreLegal(engine, state, seat, listed);
        const pick = pickChoice(
          rng,
          engine,
          state,
          pending.kind,
          listed,
          actionsThisTurn,
        );
        history.push(
          `  chose "${pick.label}" for ${pending.kind} (seat ${seat})`,
        );
        action = {
          kind: "choose",
          decision: pending.id,
          seat,
          choice: pick.choice,
        };
        for (const name of decisionNames(
          state,
          pending.kind,
          seat,
          pick.choice,
        ))
          kinds[name] = (kinds[name] ?? 0) + 1;
        decisions++;
        if (pending.kind === "turn") actionsThisTurn++;
      }
      const result = apply(engine, state, action);
      if (!result.ok)
        throw new Error(`The policy's action was rejected: ${result.reason}`);
      state = result.state;
      record(
        engine,
        state,
        history,
        action.kind === "ready" ? "ready" : "answer",
      );
      checkState(engine, state);
      if (state.turn && state.turn.seat !== turnSeat) {
        turnSeat = state.turn.seat;
        turns++;
        actionsThisTurn = 0;
      }
    }
  } catch (error) {
    const pending = state?.pending;
    const where =
      state && pending?.type === "decision"
        ? safely(() => describeDecision(engine, state as GameState, pending))
        : JSON.stringify(pending ?? null);
    throw new Error(
      [
        `Simulation seed "${seed}" failed: ${error instanceof Error ? error.message : String(error)}`,
        `Pending: ${where}`,
        "Last writes:",
        ...history.slice(-HISTORY * 4),
      ].join("\n"),
      { cause: error },
    );
  }
}

function decisionNames(
  state: GameState,
  kind: string,
  seat: number,
  choice: Json,
): string[] {
  const names = [kind];
  if (kind === "turn") names.push(`turn:${(choice as TurnChoice).act}`);
  if (state.turn && state.turn.seat !== seat) names.push(`off-turn:${kind}`);
  return names;
}

/** 3 to 6 explorers, at most one from each character card. */
function pickCharacters(engine: Engine, rng: Rng): string[] {
  const byCard = new Map<string, string[]>();
  for (const character of Object.values(engine.catalog.characters))
    byCard.set(character.card, [
      ...(byCard.get(character.card) ?? []),
      character.id,
    ]);
  const cards = shuffle(rng, [...byCard.keys()].sort());
  const count = 3 + below(rng, 4);
  return cards.slice(0, count).map((card) => {
    const sides = (byCard.get(card) ?? []).sort();
    return sides[below(rng, sides.length)];
  });
}

// The weights favour filling the house: exploring first, then moving towards
// a room with a door a remaining room can be discovered through, with every
// other kind of turn choice still tried. The longer a turn goes on, the
// likelier it ends, so a turn whose actions can repeat still ends.
function weight(
  engine: Engine,
  state: GameState,
  open: Set<string>,
  choice: TurnChoice,
  actionsThisTurn: number,
): number {
  const turn = choice;
  switch (turn.act) {
    case "discover":
      return 12;
    case "move": {
      const acting = state.turn?.acting ?? null;
      if (acting === null) throw new Error("A move with no one acting");
      const from = roomOf(state, acting);
      return distanceTo(engine, state, turn.to, open) <
        distanceTo(engine, state, from, open)
        ? 8
        : 1;
    }
    case "action":
      return 3;
    case "attack":
      return 2;
    case "pickup":
      return 2;
    case "trade":
      return 0.5;
    case "drop":
      return 0.3;
    case "activate":
      return 4;
    case "done":
      return 0.2 + actionsThisTurn * 0.5;
    case "end":
      return 0.2 + actionsThisTurn * 0.5;
  }
}

function pickChoice(
  rng: Rng,
  engine: Engine,
  state: GameState,
  kind: string,
  listed: Choice[],
  actionsThisTurn: number,
): Choice {
  const open = kind === "turn" ? openRooms(engine, state) : new Set<string>();
  const weights = listed.map((c) =>
    kind === "turn"
      ? weight(engine, state, open, c.choice as TurnChoice, actionsThisTurn)
      : 1,
  );
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (const [i, w] of weights.entries()) {
    roll -= w;
    if (roll < 0) return listed[i];
  }
  return listed[listed.length - 1];
}

/** Every listed choice applies; every candidate left out doesn't. */
export function checkListedAreLegal(
  engine: Engine,
  state: GameState,
  seat: number,
  listed: Choice[],
): void {
  const pending = state.pending;
  if (pending?.type !== "decision") throw new Error("No decision is pending");
  const keys = new Set(listed.map((c) => JSON.stringify(c.choice)));
  if (keys.size !== listed.length)
    throw new Error(`Decision ${pending.kind} lists a choice twice`);
  const kind = engine.rules.decisions[pending.kind];
  if (!kind) throw new Error(`No decision kind named ${pending.kind}`);
  for (const choice of kind.candidates(state, pending, seat, engine)) {
    const action: Action = {
      kind: "choose",
      decision: pending.id,
      seat,
      choice,
    };
    const result = apply(engine, state, action);
    const isListed = keys.has(JSON.stringify(choice));
    if (isListed && !result.ok)
      throw new Error(
        `Listed choice ${JSON.stringify(choice)} of ${pending.kind} was rejected: ${result.reason}`,
      );
    if (!isListed && result.ok)
      throw new Error(
        `Unlisted choice ${JSON.stringify(choice)} of ${pending.kind} applied`,
      );
  }
}

/** Rooms with a free doorway that a tile left in the stack or the discards
 *  can go through. */
function openRooms(engine: Engine, state: GameState): Set<string> {
  const tiles = [...state.board.stack, ...state.board.discards];
  const floors = [
    ...new Set(state.board.tiles.map((t) => t.floor)),
  ] as FloorId[];
  const result = new Set<string>();
  for (const floor of floors)
    for (const doorway of freeDoorways(state.board, engine.catalog, floor)) {
      const { spot, back } = doorwaySpot(state.board, doorway);
      if (
        tiles.some(
          (tile) =>
            bestPlacements(engine.catalog, state.board, tile, spot, [back])
              .length > 0,
        )
      )
        result.add(doorway.room);
    }
  return result;
}

function distanceTo(
  engine: Engine,
  state: GameState,
  from: string,
  rooms: Set<string>,
): number {
  const reach = distances(state.board, engine.catalog, from);
  return Math.min(
    ...[...rooms].map((room) => reach[room] ?? Infinity),
    Infinity,
  );
}

/** No explorer can reach a room that a room left can be discovered from. */
function houseFull(engine: Engine, state: GameState): boolean {
  const open = openRooms(engine, state);
  return allFigures(state).every(
    (f) =>
      f.place === null ||
      distanceTo(engine, state, f.place.room, open) === Infinity,
  );
}

/** What must hold after every write. */
function checkState(engine: Engine, state: GameState): void {
  const saved = JSON.parse(JSON.stringify(state)) as { [key: string]: Json };
  if (JSON.stringify(migrate(saved)) !== JSON.stringify(state))
    throw new Error("The state doesn't survive saving and loading");

  if (state.status === "exploring") {
    if (state.haunt !== null)
      throw new Error("A haunt is recorded before the haunt");
    if (state.pending === null)
      throw new Error("Exploration stopped with nothing pending");
  } else if (state.status === "haunt") {
    // Only a haunt that isn't built yet stops the game at its reveal.
    if (state.pending === null && activeHaunt(engine, state) !== null)
      throw new Error("The haunt stopped with nothing pending");
  } else if (state.status === "finished") {
    if (state.result === null) throw new Error("A finished game has no result");
    if (state.pending !== null || state.work.length > 0)
      throw new Error("A finished game still has something to do");
  } else {
    throw new Error(`Unexpected status ${state.status}`);
  }
  if (state.status !== "finished" && state.result !== null)
    throw new Error("A game still being played has a result");
  // Before the haunt only a card or room may make an attack (p. 13).
  if (
    state.status === "exploring" &&
    state.lastEvents.some(
      (e) => e.type === "attacked" && e.rule.source === "rulebook",
    )
  )
    throw new Error("An explorer took the attack action before the haunt");

  // A game that has ended drops its unfinished work, cards and tiles in
  // transit included, so only a game still being played is counted.
  if (state.status === "finished") return;

  // Every card is in exactly one place.
  const places: string[] = [
    ...(["omen", "item", "event"] as CardType[]).flatMap((type) => [
      ...state.decks[type].draw,
      ...state.decks[type].discard,
    ]),
    ...allFigures(state).flatMap((f) => f.cards),
    ...Object.values(state.piles).flat(),
    ...state.ongoing,
    ...state.aside.map((a) => a.card),
  ];
  const cards = Object.values(engine.catalog.cards)
    .filter((c) => state.sets.includes(c.set))
    .map((c) => c.id);
  // A card or tile drawn but not yet placed lives in the unfinished work.
  const inTransit = JSON.stringify([state.pending, state.work]);
  const held = (id: string) => inTransit.includes(`"${id}"`);
  const missing = cards.filter((c) => !places.includes(c) && !held(c));
  const doubled = places.filter((c, i) => places.indexOf(c) !== i);
  if (missing.length > 0 || doubled.length > 0)
    throw new Error(
      `Cards out of place: missing ${missing.join(", ") || "none"}; doubled ${doubled.join(", ") || "none"}`,
    );

  // Every room tile is in exactly one place.
  const tiles = [
    ...state.board.tiles.map((t) => t.tile),
    ...state.board.stack,
    ...state.board.discards,
  ];
  const tileDoubled = tiles.filter((t, i) => tiles.indexOf(t) !== i);
  if (tileDoubled.length > 0)
    throw new Error(`Room tiles doubled: ${tileDoubled.join(", ")}`);
  const rooms = Object.values(engine.catalog.rooms).filter((r) =>
    state.sets.includes(r.set),
  );
  const tileMissing = rooms
    .map((r) => r.id)
    .filter((r) => !tiles.includes(r) && !held(r));
  if (tileMissing.length > 0)
    throw new Error(`Room tiles missing: ${tileMissing.join(", ")}`);

  for (const figure of allFigures(state)) {
    if (
      figure.place !== null &&
      !state.board.tiles.some((t) => t.tile === figure.place?.room)
    )
      throw new Error(
        `${figure.id} is in ${figure.place.room}, which isn't in the house`,
      );
  }
}

function record(
  engine: Engine,
  state: GameState,
  history: string[],
  what: string,
): void {
  history.push(`${what}:`);
  for (const event of state.lastEvents) {
    const text = describeEvent(engine, state, event);
    if (text !== null) history.push(`  ${text}`);
  }
  const pending = state.pending;
  if (pending?.type === "decision")
    history.push(`  -> ${describeDecision(engine, state, pending)}`);
  if (history.length > HISTORY * 8)
    history.splice(0, history.length - HISTORY * 8);
}

function safely(describe: () => string): string {
  try {
    return describe();
  } catch (error) {
    return `(not describable: ${String(error)})`;
  }
}

function below(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
