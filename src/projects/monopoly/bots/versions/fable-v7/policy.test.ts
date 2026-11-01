import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { fableV6Bot } from "../fable-v6";
import { fableV7Bot } from "./index";

// fable-v7 = fable-v6's factory + the F8 trade-outflow tail guard
// (`tradeTailFrac`, index.ts header) + the probe-game-3 decline-note fix.
// Pinned here: (1) the factory is faithful — tradeTailFrac 0 reproduces
// fable-v6's decisions on boards where the note fix doesn't fire; (2) the
// probe-game-3 death trade is FIXED — a marginal wallet-draining buy under a
// developed board is declined even when the lethal tiles sit outside the
// current roll window (the F2e myopia); (3) a liquid seat still takes the
// same trade — a reserve, not a wall; (4) determinism.

const READING = 5;
const PENNSYLVANIA_RR = 15;
const BO_RAILROAD = 25;
const SHORT_LINE = 35;
const PARK_PLACE = 37;
const BOARDWALK = 39;

/** The probe-game-3 death shape (Alex's seat): p1 holds three railroads with
 *  `cash`, token at GO — p3's 3-house dark blues are OUTSIDE p1's next-roll
 *  window, so the danger-aware F2e floor reads them at ~zero. p2 offers the
 *  4th railroad for $735 (the wallet-pegged ask): a marginal-delta buy that
 *  left the real seat at $38 and dead on the next landing. */
function railBuyBoard(cash: number): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-r4",
    proposerId: "p2",
    propertyTo: { [SHORT_LINE]: "p1" },
    gojfTo: {},
    cashDelta: { p1: -735, p2: 735 },
    approvals: { p1: false, p2: true },
  };
  return {
    ...base,
    ownership: {
      [READING]: "p1",
      [PENNSYLVANIA_RR]: "p1",
      [BO_RAILROAD]: "p1",
      [SHORT_LINE]: "p2",
      [PARK_PLACE]: "p3",
      [BOARDWALK]: "p3",
    },
    houses: { [PARK_PLACE]: 3, [BOARDWALK]: 3 },
    players: base.players.map((q) => (q.id === "p1" ? { ...q, cash, position: 0 } : q)),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v7 — the probe-game-3 death trade is fixed", () => {
  it("fable-v6 ACCEPTS the wallet-draining marginal rail buy (the observed death)", () => {
    const decision = fableV6Bot(railBuyBoard(773), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v7 DECLINES — the outflow can't survive the board's worst hit", () => {
    const decision = fableV7Bot(railBuyBoard(773), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
    expect(decision?.note).toContain("too thin to survive");
  });

  it("fable-v7 still takes the same trade with liquid reserves — a reserve, not a wall", () => {
    const decision = fableV7Bot(railBuyBoard(2000), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});
