import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V5_PARAMS, fableV5Bot } from "../fable-v5";
import { makeParamBot } from "./bot";
import { FABLE_V6_PARAMS, fableV6Bot } from "./index";

// fable-v6 = fable-v5's factory + the F7 comeback-equity survival scaling
// (`survivalEquityGain`, index.ts header). Pinned here: (1) the factory is
// faithful — survivalEquityGain 0 reproduces fable-v5's decisions; (2) the
// distress fire-sale is FIXED — a beaten seat no longer sells its railroad to
// the board's strongest position for survival cash; (3) the credit SURVIVES
// at position parity — distress-shedding between peers stays protective (the
// v35 lesson), so this is an equity condition, not a survival nerf; (4)
// determinism.

const BALTIC = 3;
const READING = 5;
const PENNSYLVANIA_RR = 15;
const BO_RAILROAD = 25;
const ATLANTIC = 26;
const VENTNOR = 27;
const MARVIN = 29;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** The probe-game-2 distress-sale geometry: p2 (yellow hotels + two rails,
 *  $400) offers p1 $250 for Reading — p1's only railroad — while p1 sits at
 *  $40 cash under p2's hotel board (fully distressed; the mortgaged Baltic
 *  keeps a redeemable outlet so the deployability discount stays out of the
 *  way). `peer` adds orange hotels to p1: same distress, position parity. */
function distressSaleBoard(peer: boolean): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-rail",
    proposerId: "p2",
    propertyTo: { [READING]: "p2" },
    gojfTo: {},
    cashDelta: { p1: 250, p2: -250 },
    approvals: { p1: false, p2: true },
  };
  const ownership: Record<number, string> = {
    [READING]: "p1",
    [BALTIC]: "p1",
    [PENNSYLVANIA_RR]: "p2",
    [BO_RAILROAD]: "p2",
    [ATLANTIC]: "p2",
    [VENTNOR]: "p2",
    [MARVIN]: "p2",
  };
  const houses: Record<number, number> = { [ATLANTIC]: 5, [VENTNOR]: 5, [MARVIN]: 5 };
  if (peer) {
    for (const pos of [ST_JAMES, TENNESSEE, NEW_YORK]) {
      ownership[pos] = "p1";
      houses[pos] = 5;
    }
  }
  return {
    ...base,
    ownership,
    mortgaged: { [BALTIC]: true },
    houses,
    players: base.players.map((q) =>
      q.id === "p1" ? { ...q, cash: 40 } : q.id === "p2" ? { ...q, cash: 400 } : q,
    ),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v6 — the factory copy is faithful to fable-v5", () => {
  const v6OnV7Factory = makeParamBot({ ...FABLE_V5_PARAMS, survivalEquityGain: 0 });
  it("matches fableV5Bot with the gain disabled", () => {
    for (const board of [freshGame(), distressSaleBoard(false), distressSaleBoard(true)]) {
      expect(v6OnV7Factory(board, "p1")).toEqual(fableV5Bot(board, "p1"));
      expect(v6OnV7Factory(board, "p2")).toEqual(fableV5Bot(board, "p2"));
    }
  });
});

describe("fable-v6 — the distress fire-sale is fixed", () => {
  it("fable-v5 ACCEPTS $250 for its last railroad while beaten (the probe-game blunder)", () => {
    const decision = fableV5Bot(distressSaleBoard(false), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v6 DECLINES — survival cash carries no comeback equity here", () => {
    const decision = fableV6Bot(distressSaleBoard(false), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
  });

  it("fable-v6 still accepts at position PARITY — protective shedding survives", () => {
    const decision = fableV6Bot(distressSaleBoard(true), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v6 — vector provenance", () => {
  it("differs from fable-v5 in exactly the equity-gain dim", () => {
    const changed = Object.keys(FABLE_V6_PARAMS).filter(
      (k) =>
        k in FABLE_V5_PARAMS &&
        FABLE_V6_PARAMS[k as keyof typeof FABLE_V6_PARAMS] !==
          FABLE_V5_PARAMS[k as keyof typeof FABLE_V5_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V6_PARAMS.survivalEquityGain).toBe(1);
    expect(FABLE_V6_PARAMS.auctionLiquidCap).toBe(1);
    expect(FABLE_V6_PARAMS.voluntaryTailFrac).toBe(1);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V6_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V6_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V6_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V6_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v6 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [distressSaleBoard(false), distressSaleBoard(true)]) {
      expect(fableV6Bot(board, "p1")).toEqual(fableV6Bot(board, "p1"));
      expect(fableV6Bot(board, "p2")).toEqual(fableV6Bot(board, "p2"));
    }
  });
});
