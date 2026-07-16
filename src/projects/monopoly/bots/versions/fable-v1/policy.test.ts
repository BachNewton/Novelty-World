import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameEvent, GameState, PendingTrade } from "../../../types";
import { claudeV45Bot } from "../claude-v45";
import { makeParamBot } from "./bot";
import { FABLE_V1_BASELINE, FABLE_V1_PARAMS } from "./index";

// fable-v1 = the claude-v45 factory + vector with a FLOW layer, a trade-pricing
// overhaul, a ring-proof transfer memory, and the premium-EXTRACTION engine
// (PHILOSOPHY.md). Every fable lever has a NO-OP default, so the factory bound
// to FABLE_V1_BASELINE must reproduce claude-v45 decision-for-decision — that
// fidelity is the first thing pinned here. The remaining tests pin each
// headline lever's behavior against the baseline on crafted boards drawn from
// the six reviewed human-vs-v45 games.

const baselineBot = makeParamBot(FABLE_V1_BASELINE); // must BE claude-v45
const fableBot = makeParamBot(FABLE_V1_PARAMS);

// Board positions used below.
const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const VENTNOR = 27;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;
const PARK_PLACE = 37;
const BOARDWALK = 39;

/** p1's pre-roll: p1 holds the orange completer (New York), p2 is one short
 *  (St. James + Tennessee) and rich — the F4 extraction geometry. p1 is kept
 *  cash-poor so the baseline's buy-side construction can't fire instead, and
 *  holds a mortgaged lot as a cash OUTLET (without one, the v41 deployability
 *  discount rightly suppresses the harvest — idle cash is worth less). */
function extractionBoard(): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [NEW_YORK]: "p1", [MEDITERRANEAN]: "p1", [ST_JAMES]: "p2", [TENNESSEE]: "p2" },
    mortgaged: { [MEDITERRANEAN]: true },
    // p3/p4 hold real cash so p2 is rich-but-not-runaway: the standing
    // multiplier prices the sale, it doesn't embargo it (selling a completer
    // to a clamp-max LEADER is correctly refused — see the standing test
    // below).
    players: base.players.map((q) =>
      q.id === "p1"
        ? { ...q, cash: 120 }
        : q.id === "p2"
          ? { ...q, cash: 1500 }
          : { ...q, cash: 1200 },
    ),
  };
}

/** An executed-trade event that moved `pos` to `to` — the F3 memory source. */
function tradeEvent(pos: number, from: string, to: string): GameEvent {
  return {
    kind: "trade",
    proposerId: to,
    propertyTo: { [pos]: to },
    gojfTo: {},
    cashDelta: { [from]: 50, [to]: -50 },
    propertyFrom: { [pos]: from },
    gojfFrom: {},
  };
}

/** p1 (rich leader with green hotels) offers distressed p2 a small check for
 *  p2's COMPLETE dark-blue pair — the 2o4j54 T120 fire-sale shape. p2's token
 *  sits two-to-six squares upwind of the hotels. */
function fireSaleBoard(): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-1",
    proposerId: "p1",
    propertyTo: { [PARK_PLACE]: "p1", [BOARDWALK]: "p1" },
    gojfTo: {},
    cashDelta: { p1: -240, p2: 240 },
    approvals: { p1: true, p2: false },
  };
  return {
    ...base,
    ownership: {
      [PARK_PLACE]: "p2",
      [BOARDWALK]: "p2",
      [MEDITERRANEAN]: "p2",
      [PACIFIC]: "p1",
      [NORTH_CAROLINA]: "p1",
      [PENNSYLVANIA_AVE]: "p1",
    },
    mortgaged: { [MEDITERRANEAN]: true }, // a redeemable outlet, so the v41 deployability discount stays out of the way
    houses: { [PACIFIC]: 5, [NORTH_CAROLINA]: 5, [PENNSYLVANIA_AVE]: 5 },
    players: base.players.map((q) =>
      q.id === "p1"
        ? { ...q, cash: 3000 }
        : q.id === "p2"
          ? { ...q, cash: 60, position: 29 }
          : q,
    ),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v1 — baseline fidelity (all levers off IS claude-v45)", () => {
  const boards: [string, GameState][] = [
    ["fresh pre-roll", freshGame()],
    ["extraction geometry", extractionBoard()],
    ["fire-sale offer", fireSaleBoard()],
  ];
  it.each(boards)("matches claude-v45 on %s", (_name, board) => {
    expect(baselineBot(board, "p1")).toEqual(claudeV45Bot(board, "p1"));
    expect(baselineBot(board, "p2")).toEqual(claudeV45Bot(board, "p2"));
  });
});

describe("fable-v1 F4 — the extraction engine", () => {
  it("proactively arms a SELL of the held completer at the rival's solved premium", () => {
    const decision = fableBot(extractionBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue to");
    expect(decision?.note).toContain("premium");
  });

  it("claude-v45 (baseline) never constructs the sell — it waits for the rival to propose", () => {
    const decision = baselineBot(extractionBoard(), "p1");
    expect(decision?.note ?? "").not.toContain("Selling");
  });

  it("won't fire-sale to a rival who can't pay a real premium", () => {
    const board = extractionBoard();
    const poor: GameState = {
      ...board,
      players: board.players.map((q) => (q.id === "p2" ? { ...q, cash: 90 } : q)),
    };
    const decision = fableBot(poor, "p1");
    // p2's affordable "premium" ($90) doesn't clear p1's own threat-priced
    // evaluator, so the candidate dies at `mine.accept` — nothing is armed.
    expect(decision?.note ?? "").not.toContain("Selling");
  });
});

describe("fable-v1 F3 — ring-proof transfer memory", () => {
  /** p2 holds Ventnor (just received via trade); p2 offers it to p1 for $1 —
   *  a giveaway p1 would normally take. p1 owns nothing yellow, so receiving
   *  it completes nothing. */
  function churnBoard(withMemory: boolean): GameState {
    const base = freshGame();
    const pending: PendingTrade = {
      id: "t-2",
      proposerId: "p2",
      propertyTo: { [VENTNOR]: "p1" },
      gojfTo: {},
      cashDelta: { p1: -1, p2: 1 },
      approvals: { p1: false, p2: true },
    };
    return {
      ...base,
      ownership: { [VENTNOR]: "p2" },
      players: base.players.map((q) => ({ ...q, cash: 1000 })),
      turns: withMemory
        ? [...base.turns, { turn: 2, playerId: "p2", events: [tradeEvent(VENTNOR, "p1", "p2")] }]
        : base.turns,
      turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
    };
  }

  it("accepts a near-free lot when it has NO recent trade history", () => {
    const decision = fableBot(churnBoard(false), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("declines the same lot when it changed hands within the memory window", () => {
    const decision = fableBot(churnBoard(true), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
    expect(decision?.note).toContain("churning");
  });
});

describe("fable-v1 F2b — leader handovers cost more (the fire-sale price shift)", () => {
  // NOT an embargo: under real distress, survival cash still wins the argument
  // eventually (measured-right vs the field). The standing-scaled threat moves
  // the leader's price UP — here the baseline caves at $240 while fable holds
  // out (its own boundary on this board is ~$260). Probed empirically; the
  // deeper anti-fire-sale story is extraction keeping fable OUT of distress.
  it("claude-v45 (baseline) ACCEPTS $240 for a complete dark-blue set under distress — the 2o4j54 T120 shape", () => {
    const decision = baselineBot(fireSaleBoard(), "p2");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v1 DECLINES the same $240 — the runaway-leader recipient raises the price", () => {
    const decision = fableBot(fireSaleBoard(), "p2");
    expect(decision?.intent.kind).toBe("decline-trade");
  });
});

describe("fable-v1 F2b — standing embargo on clamp-max leaders", () => {
  it("refuses to exercise the extraction option INTO a runaway leader", () => {
    const board = extractionBoard();
    // Impoverish the bystanders: p2 becomes a clamp-max leader, and the
    // standing-scaled threat now exceeds any premium p2 can pay.
    const skewed: GameState = {
      ...board,
      players: board.players.map((q) =>
        q.id === "p3" || q.id === "p4" ? { ...q, cash: 60 } : q,
      ),
    };
    const decision = fableBot(skewed, "p1");
    expect(decision?.note ?? "").not.toContain("Selling");
  });
});

describe("fable-v1 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [extractionBoard(), fireSaleBoard()]) {
      expect(fableBot(board, "p1")).toEqual(fableBot(board, "p1"));
      expect(fableBot(board, "p2")).toEqual(fableBot(board, "p2"));
    }
  });
});
