import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V7_PARAMS, fableV7Bot } from "../fable-v7";
import { makeParamBot } from "./bot";
import { FABLE_V8_PARAMS, fableV8Bot } from "./index";

// fable-v8 = fable-v7's factory + the F9 transformative-trade reserve
// (`transformTailFrac`, index.ts header). Pinned here: (1) the factory is
// faithful — transformTailFrac 0 reproduces fable-v7's decisions; (2) the
// probe-game-4 completer wallet-drain is FIXED — a set-completing buy that
// leaves the buyer unable to develop the set is declined; (3) a liquid seat
// still completes the same set — the boldness doctrine survives, only the
// price floor moved; (4) determinism.

const ORIENTAL = 6;
const VERMONT = 8;
const CONNECTICUT = 9;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** The probe-game-4 death shape (Sam's seat): p1 holds two light blues and
 *  `cash`; p2 asks $430 for the completer Connecticut — at $442 cash the
 *  real seat accepted, kept $7, never built a house, and died. p3's 3-house
 *  oranges provide the position-independent worst hit the reserve reads. */
function completerDrainBoard(cash: number): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-lb",
    proposerId: "p2",
    propertyTo: { [CONNECTICUT]: "p1" },
    gojfTo: {},
    cashDelta: { p1: -430, p2: 430 },
    approvals: { p1: false, p2: true },
  };
  return {
    ...base,
    ownership: {
      [ORIENTAL]: "p1",
      [VERMONT]: "p1",
      [CONNECTICUT]: "p2",
      [ST_JAMES]: "p3",
      [TENNESSEE]: "p3",
      [NEW_YORK]: "p3",
    },
    houses: { [ST_JAMES]: 3, [TENNESSEE]: 3, [NEW_YORK]: 3 },
    players: base.players.map((q) => (q.id === "p1" ? { ...q, cash, position: 0 } : q)),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v8 — the factory copy is faithful to fable-v7", () => {
  const v7OnV8Factory = makeParamBot({ ...FABLE_V7_PARAMS, transformTailFrac: 0 });
  it("matches fableV7Bot with the reserve disabled", () => {
    for (const board of [freshGame(), completerDrainBoard(442), completerDrainBoard(1000)]) {
      expect(v7OnV8Factory(board, "p1")).toEqual(fableV7Bot(board, "p1"));
      expect(v7OnV8Factory(board, "p2")).toEqual(fableV7Bot(board, "p2"));
    }
  });
});

describe("fable-v8 — the probe-game-4 completer drain is fixed", () => {
  it("fable-v7 ACCEPTS the $430-of-$442 completer buy (the observed death)", () => {
    const decision = fableV7Bot(completerDrainBoard(442), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v8 DECLINES — completing a set you cannot develop strands the bonus", () => {
    const decision = fableV8Bot(completerDrainBoard(442), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
    expect(decision?.note).toContain("too thin to survive");
  });

  it("fable-v8 still completes the set when liquid — boldness intact", () => {
    const decision = fableV8Bot(completerDrainBoard(1000), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v8 — vector provenance", () => {
  it("differs from fable-v7 in exactly the transformative-reserve dim", () => {
    const changed = Object.keys(FABLE_V8_PARAMS).filter(
      (k) =>
        k in FABLE_V7_PARAMS &&
        FABLE_V8_PARAMS[k as keyof typeof FABLE_V8_PARAMS] !==
          FABLE_V7_PARAMS[k as keyof typeof FABLE_V7_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V8_PARAMS.transformTailFrac).toBe(0.5);
    expect(FABLE_V8_PARAMS.tradeTailFrac).toBe(0.5);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V8_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V8_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V8_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V8_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v8 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [completerDrainBoard(442), completerDrainBoard(1000)]) {
      expect(fableV8Bot(board, "p1")).toEqual(fableV8Bot(board, "p1"));
      expect(fableV8Bot(board, "p2")).toEqual(fableV8Bot(board, "p2"));
    }
  });
});
