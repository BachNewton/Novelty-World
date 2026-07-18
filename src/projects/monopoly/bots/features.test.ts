import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import type { GameState } from "../types";
import { applyCandidate } from "./candidates";
import { driveOp } from "../pacing";
import { DEFAULT_BOT_VERSION } from "./roles";
import { encode, FEATURE_COUNT, FEATURE_NAMES } from "./features";

/** A fresh 4-bot game at its opening pre-roll — every seat a bot so the headless
 *  driver can advance it. */
function botGame(seed: string): GameState {
  const base = freshGame(seed, undefined, 4);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: DEFAULT_BOT_VERSION })),
  };
}

/** Walk a real bot-vs-bot game, yielding every visited state, so tests can assert
 *  invariants across the full breadth of phases the engine reaches. */
function visitStates(seed: string, maxOps: number): GameState[] {
  const seen: GameState[] = [];
  let state = botGame(seed);
  for (let i = 0; i < maxOps && state.status === "active"; i++) {
    seen.push(state);
    const op = driveOp(state, true, null);
    if (op === null) break;
    state =
      op.kind === "step"
        ? applyCandidate(state, { kind: "step" })
        : applyCandidate(state, { kind: "intent", intent: op.intent });
  }
  return seen;
}

describe("feature encoder", () => {
  it("the layout and its names stay in lockstep", () => {
    expect(FEATURE_NAMES.length).toBe(FEATURE_COUNT);
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_COUNT); // names unique
  });

  it("encodes to a fixed-width vector of finite numbers", () => {
    const state = botGame("feat-1");
    const vec = encode(state, state.players[0].id);
    expect(vec.length).toBe(FEATURE_COUNT);
    expect(vec.every((x) => Number.isFinite(x))).toBe(true);
  });

  it("is deterministic", () => {
    const state = botGame("feat-2");
    const a = encode(state, state.players[1].id);
    const b = encode(state, state.players[1].id);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("is seat-relative: slot 0 is always the encoded player", () => {
    const base = botGame("feat-3");
    // Give two players distinct, identifiable cash so we can read slot 0 back.
    const players = base.players.map((p, i) => ({ ...p, cash: 1000 + i * 500 }));
    const state = { ...base, players };
    const cashIdx = FEATURE_NAMES.indexOf("seat0:cash");
    expect(cashIdx).toBeGreaterThanOrEqual(0);

    // Each player, encoded from their own seat, reports their own cash in slot 0.
    for (const p of players) {
      const vec = encode(state, p.id);
      expect(vec[cashIdx]).toBeCloseTo(p.cash / 1000, 5);
    }
  });

  it("reflects ownership and monopoly structure from the encoded seat", () => {
    const base = botGame("feat-4");
    const me = base.players[0].id;
    // Hand player 0 the full brown set (positions 1 and 3).
    const state: GameState = {
      ...base,
      ownership: { ...base.ownership, 1: me, 3: me },
    };
    // The seat-relative owner one-hot for a square: 8 slots, exactly one set when
    // owned (slot 0 = the encoded seat), all-zero when unowned.
    const ownerHot = (vec: Float32Array, pos: number): number[] =>
      Array.from({ length: 8 }, (_, s) => vec[FEATURE_NAMES.indexOf(`sq${pos}:owner${s}`)]);
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    const monoIdx = FEATURE_NAMES.indexOf("grp:brown:myMono");

    const vecMe = encode(state, me);
    expect(vecMe[monoIdx]).toBe(1);
    // I own sq1, so my own slot (0) is set and it's the only one.
    expect(vecMe[FEATURE_NAMES.indexOf("sq1:owner0")]).toBe(1);
    expect(sum(ownerHot(vecMe, 1))).toBe(1);

    // From an opponent's seat the same set is theirs (some opponent slot > 0),
    // not mine (slot 0 clear), and still exactly one owner slot set.
    const vecOpp = encode(state, base.players[1].id);
    expect(vecOpp[monoIdx]).toBe(0);
    expect(vecOpp[FEATURE_NAMES.indexOf("sq1:owner0")]).toBe(0);
    expect(sum(ownerHot(vecOpp, 1))).toBe(1);
  });

  it("stays finite across every state of a real game", () => {
    for (const state of visitStates("feat-game", 4000)) {
      for (const p of state.players) {
        const vec = encode(state, p.id);
        expect(vec.length).toBe(FEATURE_COUNT);
        expect(vec.every((x) => Number.isFinite(x))).toBe(true);
      }
    }
  });
});
