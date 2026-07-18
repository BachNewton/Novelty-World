import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V8_PARAMS, fableV8Bot } from "../fable-v8";
import { makeParamBot } from "./bot";
import { FABLE_V10_PARAMS, fableV10Bot } from "./index";

// fable-v10 = fable-v8's factory (branched from the SUBSTRATE, not the
// rejected fable-v9) + the F11 price-aware reserve cap (`spendReserveMult`,
// index.ts header). Pinned here: (1) the factory is faithful —
// spendReserveMult 0 reproduces fable-v8's decisions; (2) the probe-game-5
// price-blind refusal is FIXED — a CHEAP completer clears the reserve at a
// thin wallet; (3) the wallet-drain stays blocked — the cap scales with the
// spend, so big outflows still need real headroom; (4) determinism.

const ORIENTAL = 6;
const VERMONT = 8;
const CONNECTICUT = 9;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** The probe-game-5 geometry: p1 holds two light blues at a THIN wallet under
 *  p3's 3-house oranges; p2 offers the completer Connecticut for `price`.
 *  Cheap case ($60 on $200): fable-v8's flat ~$187 reserve refuses it — the
 *  price-blind freeze; the drain case ($430 on $442) is fable-v8's own fix
 *  and must STAY blocked. */
function completerOfferBoard(cash: number, price: number): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-cheap",
    proposerId: "p2",
    propertyTo: { [CONNECTICUT]: "p1" },
    gojfTo: {},
    cashDelta: { p1: -price, p2: price },
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

describe("fable-v10 — the factory copy is faithful to fable-v8", () => {
  const v8OnV10Factory = makeParamBot({ ...FABLE_V8_PARAMS, spendReserveMult: 0 });
  it("matches fableV8Bot with the cap disabled", () => {
    for (const board of [freshGame(), completerOfferBoard(200, 60), completerOfferBoard(442, 430)]) {
      expect(v8OnV10Factory(board, "p1")).toEqual(fableV8Bot(board, "p1"));
      expect(v8OnV10Factory(board, "p2")).toEqual(fableV8Bot(board, "p2"));
    }
  });
});

describe("fable-v10 — the price-blind reserve refusal is fixed", () => {
  it("fable-v8 REFUSES a $60 completer on a $200 wallet (the probe-game freeze)", () => {
    const decision = fableV8Bot(completerOfferBoard(200, 60), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
  });

  it("fable-v10 ACCEPTS — $60 of spend needs $120 of headroom, and $140 remains", () => {
    const decision = fableV10Bot(completerOfferBoard(200, 60), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v10 still BLOCKS the wallet drain — the cap scales with the spend", () => {
    const decision = fableV10Bot(completerOfferBoard(442, 430), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
  });
});

describe("fable-v10 — vector provenance", () => {
  it("differs from fable-v8 in exactly the reserve-cap dim", () => {
    const changed = Object.keys(FABLE_V10_PARAMS).filter(
      (k) =>
        k in FABLE_V8_PARAMS &&
        FABLE_V10_PARAMS[k as keyof typeof FABLE_V10_PARAMS] !==
          FABLE_V8_PARAMS[k as keyof typeof FABLE_V8_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V10_PARAMS.spendReserveMult).toBe(2);
    expect(FABLE_V10_PARAMS.transformTailFrac).toBe(0.5);
    expect(FABLE_V10_PARAMS.tradeTailFrac).toBe(0.5);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V10_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V10_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V10_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V10_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v10 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [completerOfferBoard(200, 60), completerOfferBoard(442, 430)]) {
      expect(fableV10Bot(board, "p1")).toEqual(fableV10Bot(board, "p1"));
      expect(fableV10Bot(board, "p2")).toEqual(fableV10Bot(board, "p2"));
    }
  });
});
