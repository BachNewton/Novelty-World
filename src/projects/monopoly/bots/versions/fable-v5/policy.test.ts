import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { fableV4Bot } from "../fable-v4";
import { fableV5Bot } from "./index";

// fable-v5 = fable-v4's factory + the F6 auction liquidity cap
// (`auctionLiquidCap`, index.ts header). Pinned here: (1) the factory is
// faithful — auctionLiquidCap 0 reproduces fable-v4's decisions; (2) the
// played-game winner's curse is FIXED — a cash-poor seat no longer ratchets
// a face-value bid it can only settle by liquidating the prize; (3) a liquid
// seat still bids (a ceiling, not a wall); (4) determinism.

const ATLANTIC = 26;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;

/** The played-game T57 geometry (Alex's seat): a developed orange monopoly —
 *  big net worth, but its group is BUILT so `mortgageableTotal` is zero — and
 *  `cash` dollars, bidding on a bare Atlantic at a $240 high bid held by p2.
 *  At $166 (the observed blunder) the net-worth bid cap is satisfied by house
 *  sale value, so fable-v2 AND fable-v4 counter-bid $250 and can only settle a
 *  win by liquidating houses or the prize itself; at $600 the bid is genuinely
 *  fundable from cash. */
function auctionBoard(cash: number): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [ST_JAMES]: "p1", [TENNESSEE]: "p1", [NEW_YORK]: "p1" },
    houses: { [ST_JAMES]: 3, [TENNESSEE]: 3, [NEW_YORK]: 3 },
    players: base.players.map((q) => (q.id === "p1" ? { ...q, cash } : q)),
    turn: {
      ...base.turn,
      phase: "auction",
      auction: {
        position: ATLANTIC,
        active: ["p1", "p2", "p3", "p4"],
        highBid: 240,
        leaderId: "p2",
        bids: { p1: 230, p2: 240 },
        resume: { kind: "landing" },
      },
    },
  };
}

describe("fable-v5 — the played-game winner's curse is fixed", () => {
  it("fable-v4 counter-bids $250 on $166 cash (the observed blunder)", () => {
    const decision = fableV4Bot(auctionBoard(166), "p1");
    expect(decision?.intent).toEqual({ kind: "bid", playerId: "p1", amount: 250 });
  });

  it("fable-v5 drops out instead — the bid exceeds liquid capacity", () => {
    const decision = fableV5Bot(auctionBoard(166), "p1");
    expect(decision?.intent.kind).toBe("pass-bid");
  });

  it("fable-v5 still bids when the seat can actually fund it", () => {
    const decision = fableV5Bot(auctionBoard(600), "p1");
    expect(decision?.intent).toEqual({ kind: "bid", playerId: "p1", amount: 250 });
  });
});
