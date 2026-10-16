import { describe, expect, it } from "vitest";
import type { CardId, GameEvent, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { inside, position } from "../../engine/test-kit";
import type { TerritoryId } from "../../map";
import { gdBot } from "./bot";
import { winChance } from "./odds";
import type { PersonaName } from "./personas";

const PERSONAS: readonly PersonaName[] = ["defensive", "continental", "aggressive", "stacker"];

/** The deal that sets a position's board up, as a game's history opens. */
function dealOf(state: GameState): GameEvent[] {
  const s = inside(state);
  const owners = Object.fromEntries(Object.entries(s.board).map(([t, h]) => [t, h.owner])) as Record<TerritoryId, Seat>;
  const armies = Object.fromEntries(Object.entries(s.board).map(([t, h]) => [t, h.armies])) as Record<TerritoryId, number>;
  return [
    { rule: "", kind: "turn-order", order: s.turnOrder },
    { rule: "", kind: "dealt", owners },
    { rule: "", kind: "starting-armies", armies },
  ];
}

/** The history of a position: its deal, a finished round, and this turn begun, then `extra`. */
function historyOf(state: GameState, extra: readonly GameEvent[] = []): GameEvent[] {
  const s = inside(state);
  const last = s.turnOrder[s.turnOrder.length - 1];
  return [
    ...dealOf(state),
    { rule: "", kind: "turn-started", seat: last, turn: s.turn - 1 },
    { rule: "", kind: "turn-started", seat: s.active, turn: s.turn },
    ...extra,
  ];
}

function decide(persona: PersonaName, state: GameState, extra: readonly GameEvent[] = [], seed = "s"): Move {
  const seat: Seat = inside(state).active;
  const options = engine.options(state, seat);
  if (!options) throw new Error("no decision");
  const move = gdBot(persona)({
    seat,
    view: engine.view(state, seat),
    options,
    events: [],
    history: historyOf(state, extra),
    humans: inside(state).hands.map(() => false),
    seed,
  });
  const applied = engine.apply(state, seat, move);
  if (!applied.ok) throw new Error(`illegal: ${applied.reason}`);
  return move;
}

const captured: GameEvent = { rule: "", kind: "captured", seat: 0, territory: "argentina", from: 2 };

/** Japan's armies against Kamchatka's 10 for a capture chance between `low` and `high`. */
function japanFor(low: number, high: number): number {
  for (let a = 2; a < 60; a++) {
    const p = winChance(a - 1, 10);
    if (p >= low && p <= high) return a;
  }
  throw new Error("no such stack");
}

/** Seat 0 holds the board but Kamchatka (seat 1) and Argentina (seat 2); Japan is its only stack. */
function duel(japan: number): GameState {
  return position({ board: { japan: [0, japan], kamchatka: [1, 10], argentina: [2, 1] }, rest: [0, 1], phase: "attack" });
}

describe("each persona attacks as its success thresholds say", () => {
  it("after a capture: Continental (55) and Aggressive (45) take a 60-75% blitz, Defensive (80) and Stacker (99) stop", () => {
    const state = duel(japanFor(0.6, 0.75));
    const kinds = Object.fromEntries(PERSONAS.map((p) => [p, decide(p, state, [captured]).kind]));
    expect(kinds).toEqual({ defensive: "end-attack", continental: "blitz", aggressive: "blitz", stacker: "end-attack" });
  });

  it("before any capture, the desperate thresholds: Continental (25) and Aggressive (10) take a 30-38% blitz, Defensive (40) and Stacker (45) stop", () => {
    const state = duel(japanFor(0.3, 0.38));
    const kinds = Object.fromEntries(PERSONAS.map((p) => [p, decide(p, state).kind]));
    expect(kinds).toEqual({ defensive: "end-attack", continental: "blitz", aggressive: "blitz", stacker: "end-attack" });
  });

  it("blitz to the end, all but one army attacking", () => {
    expect(decide("aggressive", duel(30))).toEqual({ kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
  });
});

describe("deploying", () => {
  // Seat 0 holds the Americas and nothing else: 13 territories and both continents, 11 armies.
  const americas: TerritoryId[] = [
    "alaska", "northwest-territory", "greenland", "alberta", "ontario", "quebec", "western-united-states",
    "eastern-united-states", "central-america", "venezuela", "peru", "brazil", "argentina",
  ];
  const state = position({ board: Object.fromEntries(americas.map((t) => [t, [0, 3]])), rest: [1, 2] });

  it("places a chunk of a half to two thirds of its armies, on a border, for the base personas", () => {
    expect(engine.view(state, 0).armiesToPlace).toBe(11);
    for (const persona of ["defensive", "continental", "aggressive"] as const) {
      for (const seed of ["a", "b", "c"]) {
        const move = decide(persona, state, [], seed);
        if (move.kind !== "place") throw new Error(`placed nothing: ${move.kind}`);
        expect(move.armies).toBeGreaterThanOrEqual(6);
        expect(move.armies).toBeLessThanOrEqual(8);
        expect(["alaska", "greenland", "central-america", "brazil"]).toContain(move.territory);
      }
    }
  });

  it("places everything at once for Stacker", () => {
    const move = decide("stacker", state);
    expect(move).toMatchObject({ kind: "place", armies: 11 });
  });

  it("trades a set first, at the first chance, with the +2 on an owned territory", () => {
    const hand: CardId[] = ["peru", "japan", "brazil"];
    const withCards = position({ board: Object.fromEntries(americas.map((t) => [t, [0, 3]])), rest: [1, 2], hands: [hand, [], []] });
    for (const persona of PERSONAS) {
      expect(decide(persona, withCards)).toMatchObject({ kind: "trade" });
    }
  });
});

describe("Stacker", () => {
  it("becomes Aggressive for good once a turn of its ends with more armies than every other seat together", () => {
    const state = position({ board: { japan: [0, 200], kamchatka: [1, 3], argentina: [2, 1] }, rest: [0, 1] });
    const setup: GameEvent[] = [
      ...dealOf(state),
      { rule: "", kind: "turn-started", seat: 0, turn: 1 },
      { rule: "", kind: "turn-started", seat: 1, turn: 2 },
      { rule: "", kind: "turn-started", seat: 2, turn: 3 },
      { rule: "", kind: "turn-started", seat: 0, turn: 4 },
    ];
    const seat = 0;
    const options = engine.options(state, seat);
    if (options?.kind !== "reinforce") throw new Error("not reinforcing");
    const input = { seat, view: engine.view(state, seat), options, events: [], humans: [false, false, false], seed: "s" };
    // Stacker places all its armies at once; once it has turned Aggressive it places a chunk.
    const toPlace = options.armiesToPlace;
    expect(gdBot("stacker")({ ...input, history: setup.slice(0, 4) })).toMatchObject({ armies: toPlace });
    const swapped = gdBot("stacker")({ ...input, history: setup });
    expect(swapped.kind === "place" && swapped.armies).toBeLessThan(toPlace);
  });

  it("fortifies every army but one from an interior stack to the front", () => {
    // Siberia is interior; Ukraine (seat 1) and Argentina (seat 2) are the only enemies.
    const state = position({ board: { siberia: [0, 12], ukraine: [1, 4], argentina: [2, 1] }, rest: [0, 1], phase: "fortify" });
    expect(decide("stacker", state)).toMatchObject({ kind: "fortify", from: "siberia", armies: 11 });
  });

  it("moves every army it can into a capture", () => {
    const state = position({ board: { japan: [0, 30], kamchatka: [1, 1], argentina: [2, 1], yakutsk: [1, 3] }, rest: [0, 1], phase: "attack" });
    const blitz = engine.apply(state, 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
    if (!blitz.ok) throw new Error(blitz.reason);
    const o = engine.options(blitz.state, 0);
    if (o?.kind !== "occupy") throw new Error("no move-in");
    expect(decide("stacker", blitz.state, [captured])).toEqual({ kind: "occupy", armies: o.max });
  });
});

describe("a base persona's move-in", () => {
  it("leaves its armies where the threat is: the minimum into a capture with no enemy beside it", () => {
    // Siam takes Indonesia, whose other neighbours are all seat 0's; Siam still faces India.
    const state = position({ board: { siam: [0, 20], indonesia: [1, 1], india: [2, 9], argentina: [1, 1] }, rest: [0, 1], phase: "attack" });
    const blitz = engine.apply(state, 0, { kind: "blitz", from: "siam", to: "indonesia", keepAtLeast: 1 });
    if (!blitz.ok) throw new Error(blitz.reason);
    const o = engine.options(blitz.state, 0);
    if (o?.kind !== "occupy") throw new Error("no move-in");
    for (const persona of ["defensive", "continental", "aggressive"] as const) {
      expect(decide(persona, blitz.state, [captured])).toEqual({ kind: "occupy", armies: o.min });
    }
  });
});
