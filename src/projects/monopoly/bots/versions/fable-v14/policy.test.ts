import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { makeParamBot } from "./bot";
import { FABLE_V14_PARAMS, fableV14Bot } from "./index";
import { FABLE_V12_PARAMS, fableV12Bot } from "../fable-v12";

// fable-v14 = fable-v12's factory + the F14 AUCTION transform-tail reserve
// (`auctionTailFrac`, index.ts header). Pinned here: (1) identity with fable-v12
// when the reserve is off (auctionTailFrac 0) — the change is purely additive and
// gated; (2) THE FIX — on a completer auction that fable-v12 bids up into
// complete-into-illiquidity (winning would force mortgaging the prize's own
// set-mates), fable-v14 caps the bid LOWER, leaving a cash reserve; (3) it is a
// RESERVE, not a wall — below the reserve line fable-v14 still bids the completer;
// (4) it is NARROW — a non-completer auction is untouched (identical to v12);
// (5) determinism.

// Light-blue set: Oriental(6) + Vermont(8) + Connecticut(9). p1 holds 6 & 8; the
// auctioned lot is Connecticut, so winning it COMPLETES p1's light-blue set — the
// transformative case. p2 holds the orange set with a HOTEL on New York(19), so
// the worst single board hit p1 faces is New York's $1000 hotel rent — a big
// board-wide `worstHit`, hence a meaningful reserve.
const ORIENTAL = 6;
const VERMONT = 8;
const CONNECTICUT = 9;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** p1 is up against a completer auction: it holds all-but-one of light-blue and
 *  Connecticut is on the block. `cash` is p1's wallet; `highBid` is the standing
 *  bid it may top by one increment. When `completer` is false, p1 holds only ONE
 *  light-blue lot, so Connecticut is NOT a completer — the F14 guard must not
 *  bind. */
function completerAuction(cash: number, highBid: number, completer = true): GameState {
  const base = freshGame("auction-1", undefined, 4);
  const ownership: Record<number, string> = {
    [ORIENTAL]: "p1",
    [ST_JAMES]: "p2",
    [TENNESSEE]: "p2",
    [NEW_YORK]: "p2",
  };
  if (completer) ownership[VERMONT] = "p1";
  return {
    ...base,
    ownership,
    houses: { [NEW_YORK]: 5 },
    players: base.players.map((q) => (q.id === "p1" ? { ...q, cash } : q)),
    turn: {
      ...base.turn,
      phase: "auction",
      auction: {
        position: CONNECTICUT,
        active: ["p1", "p2"],
        highBid,
        leaderId: "p2",
        bids: { p2: highBid },
        resume: { kind: "landing" },
      },
    },
  };
}

describe("fable-v14 — identity with fable-v12 when the reserve is off", () => {
  const v12OnV14Factory = makeParamBot({ ...FABLE_V12_PARAMS, auctionTailFrac: 0 });
  it("the factory copy is faithful with auctionTailFrac at 0", () => {
    for (const board of [
      freshGame("auction-1", undefined, 4),
      completerAuction(300, 100),
      completerAuction(300, 30),
      completerAuction(300, 100, false),
    ]) {
      expect(v12OnV14Factory(board, "p1")).toEqual(fableV12Bot(board, "p1"));
      expect(v12OnV14Factory(board, "p2")).toEqual(fableV12Bot(board, "p2"));
    }
  });
});

describe("fable-v14 — the auction transform-tail reserve (RED against v12 / GREEN after)", () => {
  // p1 cash $300, worstHit $1000 (New York hotel) → reserve 0.25 × 1000 = $250,
  // so the reserve line is cash − reserve = $50. fable-v12 bids the completer up
  // to its F6 liquid cap (cash $300 + light-blue mortgage equity $100 − ~$12 flow
  // floor ≈ $388) — ABOVE its $300 cash, i.e. only settleable by mortgaging the
  // very set-mates it is completing. A $110 bid sits in that gap.
  it("fable-v12 bids the completer up past the reserve (the defect)", () => {
    expect(fableV12Bot(completerAuction(300, 100), "p1")?.intent).toEqual({
      kind: "bid",
      playerId: "p1",
      amount: 110,
    });
  });

  it("fable-v14 caps the bid at the reserve line — drops instead of completing into illiquidity", () => {
    expect(fableV14Bot(completerAuction(300, 100), "p1")?.intent.kind).toBe("pass-bid");
  });

  it("it is a RESERVE, not a wall — below the reserve line fable-v14 still bids the completer", () => {
    // highBid $30 → next $40 ≤ the $50 reserve line, so the completer is still
    // worth taking; fable-v14 bids exactly as v12 does here.
    expect(fableV14Bot(completerAuction(300, 30), "p1")?.intent).toEqual({
      kind: "bid",
      playerId: "p1",
      amount: 40,
    });
  });
});

describe("fable-v14 — NARROW: non-completer auctions are untouched", () => {
  it("a non-completer auction is identical to fable-v12 (guard doesn't bind)", () => {
    // p1 holds only ONE light-blue lot, so Connecticut is not a completer. Both
    // versions bid it up the same way.
    const board = completerAuction(300, 100, false);
    expect(fableV14Bot(board, "p1")).toEqual(fableV12Bot(board, "p1"));
    expect(fableV14Bot(board, "p1")?.intent.kind).toBe("bid");
  });
});

describe("fable-v14 — vector provenance", () => {
  it("differs from fable-v12 in exactly the auction-tail dim", () => {
    const changed = Object.keys(FABLE_V14_PARAMS).filter(
      (k) =>
        k in FABLE_V12_PARAMS &&
        FABLE_V14_PARAMS[k as keyof typeof FABLE_V14_PARAMS] !==
          FABLE_V12_PARAMS[k as keyof typeof FABLE_V12_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V14_PARAMS.auctionTailFrac).toBe(0.25);
    expect(FABLE_V14_PARAMS.auctionLiquidCap).toBe(1);
    expect(FABLE_V14_PARAMS.humanThreatMult).toBe(2);
  });
});

describe("fable-v14 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [
      completerAuction(300, 100),
      completerAuction(300, 30),
      completerAuction(300, 100, false),
    ]) {
      expect(fableV14Bot(board, "p1")).toEqual(fableV14Bot(board, "p1"));
      expect(fableV14Bot(board, "p2")).toEqual(fableV14Bot(board, "p2"));
    }
  });
});
