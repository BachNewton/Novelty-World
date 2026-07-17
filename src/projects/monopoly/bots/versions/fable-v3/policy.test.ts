import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V2_PARAMS, fableV2Bot } from "../fable-v2";
import { makeParamBot } from "./bot";
import { FABLE_V3_PARAMS, fableV3Bot } from "./index";

// fable-v3 = fable-v2's factory VERBATIM with two rail-pricing dims moved
// (index.ts header). Pinned here: (1) the factory copy is faithful — fable-v2's
// vector bound to THIS factory reproduces fable-v2's decisions; (2) the
// 4q3y6i T89 defect is FIXED — the "$500 for two railroads that lift the
// buyer to a 3-rail network" trade that fable-v2 accepts is now declined;
// (3) the two vectors differ ONLY in the two stated dims; (4) determinism.

const READING = 5;
const PENNSYLVANIA_RR = 15;
const SHORT_LINE = 35;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;

/** The T89 geometry from game 4q3y6i: p1 (Mark's seat) holds two railroads
 *  plus a bare green monopoly (the productive OUTLET Mark had — without one
 *  the deployability discount fires and even fable-v2 declines, which is a
 *  different mechanism than the one under test); p2 (Papa's seat) holds one
 *  railroad and offers cash for both of p1's — lifting p2 from a 1-rail to a
 *  3-rail network. Everyone solvent, no distress in play. */
function railBuyoutBoard(cash: number): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-rails",
    proposerId: "p2",
    propertyTo: { [READING]: "p2", [PENNSYLVANIA_RR]: "p2" },
    gojfTo: {},
    cashDelta: { p1: cash, p2: -cash },
    approvals: { p1: false, p2: true },
  };
  return {
    ...base,
    ownership: {
      [READING]: "p1",
      [PENNSYLVANIA_RR]: "p1",
      [PACIFIC]: "p1",
      [NORTH_CAROLINA]: "p1",
      [PENNSYLVANIA_AVE]: "p1",
      [SHORT_LINE]: "p2",
    },
    players: base.players.map((q) => ({ ...q, cash: 1000 })),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v3 — the factory copy is faithful to fable-v2", () => {
  const v2OnV3Factory = makeParamBot(FABLE_V2_PARAMS);
  it("matches fableV2Bot on the rail-buyout board and a fresh game", () => {
    for (const board of [freshGame(), railBuyoutBoard(500)]) {
      expect(v2OnV3Factory(board, "p1")).toEqual(fableV2Bot(board, "p1"));
      expect(v2OnV3Factory(board, "p2")).toEqual(fableV2Bot(board, "p2"));
    }
  });
});

describe("fable-v3 — the 4q3y6i rail-handover defect is fixed", () => {
  it("fable-v2 ACCEPTS $500 for two rails arming a 3-rail network (the T89 blunder)", () => {
    const decision = fableV2Bot(railBuyoutBoard(500), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v3 DECLINES the same trade — the network is priced honestly", () => {
    const decision = fableV3Bot(railBuyoutBoard(500), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
  });

  it("fable-v3 still sells when the check actually covers the network value", () => {
    // At a rich-enough premium the sale is genuinely good — the fix is a
    // price correction, not a wall (the extraction engine's cash-out must
    // stay reachable). $900 clears book ($400) + own synergy + the 0.65
    // handover charge with margin.
    const decision = fableV3Bot(railBuyoutBoard(900), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v3 — vector provenance", () => {
  it("differs from fable-v2 in exactly the two rail-pricing dims", () => {
    const changed = Object.keys(FABLE_V3_PARAMS).filter(
      (k) =>
        FABLE_V3_PARAMS[k as keyof typeof FABLE_V3_PARAMS] !==
        FABLE_V2_PARAMS[k as keyof typeof FABLE_V2_PARAMS],
    );
    expect(changed.sort()).toEqual(["railSynergy2", "synergyThreatFrac"]);
    expect(FABLE_V3_PARAMS.railSynergy2).toBe(70);
    // Nets 0.65 of the synergy delta: synergyThreatFrac × rivalThreatFactor.
    expect(FABLE_V3_PARAMS.synergyThreatFrac * FABLE_V3_PARAMS.rivalThreatFactor).toBeCloseTo(
      0.65,
      5,
    );
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V3_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V3_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V3_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V3_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v3 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [railBuyoutBoard(500), railBuyoutBoard(900)]) {
      expect(fableV3Bot(board, "p1")).toEqual(fableV3Bot(board, "p1"));
      expect(fableV3Bot(board, "p2")).toEqual(fableV3Bot(board, "p2"));
    }
  });
});
