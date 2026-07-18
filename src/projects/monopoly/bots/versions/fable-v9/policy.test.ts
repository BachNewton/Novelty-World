import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameEvent, GameState } from "../../../types";
import { FABLE_V8_PARAMS, fableV8Bot } from "../fable-v8";
import { makeParamBot } from "./bot";
import { FABLE_V9_PARAMS, fableV9Bot } from "./index";

// fable-v9 = fable-v8's factory + the F10 re-pitch minimum step
// (`repitchMinStep`, index.ts header). Pinned here: (1) the factory is
// faithful — repitchMinStep 1 reproduces fable-v8's decisions (1, not 0: the
// old rule was "any improvement ≥ $1 unblocks"); (2) the proposal spam is
// FIXED — a cosmetic $10 sweetening no longer re-pitches identical asset
// terms; (3) a MEANINGFUL concession still re-pitches — the memory paces
// negotiation, it doesn't end it; (4) determinism.

const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** The F4 extraction geometry (fable-v2's test board): p1 holds the orange
 *  completer New York Avenue, p2 is one short and rich — the ask constructor
 *  deterministically solves a $1383 premium. `oldAsk` seeds the decline
 *  memory: a prior identical-asset ask at that price, declined by p2. */
function repitchBoard(oldAsk: number): GameState {
  const base = freshGame();
  const declined: GameEvent = {
    kind: "trade-declined",
    declinedBy: "p2",
    proposerId: "p1",
    propertyTo: { [NEW_YORK]: "p2" },
    gojfTo: {},
    cashDelta: { p1: oldAsk, p2: -oldAsk },
    propertyFrom: { [NEW_YORK]: "p1" },
    gojfFrom: {},
  };
  return {
    ...base,
    ownership: { [NEW_YORK]: "p1", [MEDITERRANEAN]: "p1", [ST_JAMES]: "p2", [TENNESSEE]: "p2" },
    mortgaged: { [MEDITERRANEAN]: true },
    players: base.players.map((q) =>
      q.id === "p1" ? { ...q, cash: 120 } : q.id === "p2" ? { ...q, cash: 1500 } : { ...q, cash: 1200 },
    ),
    // The decline sits in a PRIOR turn group; a fresh empty group follows so
    // `proposedThisTurn` doesn't (correctly) suppress the re-pitch.
    turns: [
      ...base.turns,
      { turn: 1, playerId: "p1", events: [declined] },
      { turn: 2, playerId: "p1", events: [] },
    ],
  };
}

describe("fable-v9 — the factory copy is faithful to fable-v8", () => {
  const v8OnV9Factory = makeParamBot({ ...FABLE_V8_PARAMS, repitchMinStep: 1 });
  it("matches fableV8Bot with the old any-improvement rule", () => {
    for (const board of [freshGame(), repitchBoard(1393), repitchBoard(1450)]) {
      expect(v8OnV9Factory(board, "p1")).toEqual(fableV8Bot(board, "p1"));
      expect(v8OnV9Factory(board, "p2")).toEqual(fableV8Bot(board, "p2"));
    }
  });
});

describe("fable-v9 — the proposal spam is fixed", () => {
  it("fable-v8 re-pitches after a cosmetic $10 improvement (the probe-game spam)", () => {
    // Prior ask $1393 declined; the constructor now solves $1383 — $10 cheaper
    // for the decliner, which the old rule counts as sweetened.
    const decision = fableV8Bot(repitchBoard(1393), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue");
  });

  it("fable-v9 holds — $10 is not a meaningful concession", () => {
    const decision = fableV9Bot(repitchBoard(1393), "p1");
    expect(decision?.note ?? "").not.toContain("Selling New York Avenue");
  });

  it("fable-v9 still re-pitches after a real concession ($67 cheaper)", () => {
    const decision = fableV9Bot(repitchBoard(1450), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue");
  });
});

describe("fable-v9 — vector provenance", () => {
  it("differs from fable-v8 in exactly the re-pitch-step dim", () => {
    const changed = Object.keys(FABLE_V9_PARAMS).filter(
      (k) =>
        k in FABLE_V8_PARAMS &&
        FABLE_V9_PARAMS[k as keyof typeof FABLE_V9_PARAMS] !==
          FABLE_V8_PARAMS[k as keyof typeof FABLE_V8_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V9_PARAMS.repitchMinStep).toBe(50);
    expect(FABLE_V9_PARAMS.transformTailFrac).toBe(0.5);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V9_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V9_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V9_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V9_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v9 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [repitchBoard(1393), repitchBoard(1450)]) {
      expect(fableV9Bot(board, "p1")).toEqual(fableV9Bot(board, "p1"));
      expect(fableV9Bot(board, "p2")).toEqual(fableV9Bot(board, "p2"));
    }
  });
});
