import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V8_PARAMS, fableV8Bot } from "../fable-v8";
import { makeParamBot } from "./bot";
import { FABLE_V11_PARAMS, fableV11Bot } from "./index";

// fable-v11 = fable-v8's factory + the F12 human-counterparty model
// (`humanAskOff` + `humanProposalMargin`, index.ts header). Pinned here:
// (1) BOT-VS-BOT IDENTITY — with every seat carrying a bot marker, fable-v11
// reproduces fable-v8's decisions exactly (this is the claim that makes an
// SPRT gate vacuous: the sim never seats humans); (2) the F4 premium ask is
// NOT constructed against a HUMAN buyer but is against a bot in the same
// state; (3) a thin human-PROPOSED deal is declined while the identical
// bot-proposed deal is accepted, and a human deal clearing the margin is
// accepted; (4) determinism.

const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const KENTUCKY = 21;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;

/** The F4 extraction geometry (fable-v2's board): p1 holds the orange
 *  completer, p2 is one short and rich. `humanBuyer` marks p2 as a real
 *  human seat (`botStrategy: null`). */
function extractionBoard(humanBuyer: boolean): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [NEW_YORK]: "p1", [MEDITERRANEAN]: "p1", [ST_JAMES]: "p2", [TENNESSEE]: "p2" },
    mortgaged: { [MEDITERRANEAN]: true },
    players: base.players.map((q) =>
      q.id === "p1"
        ? { ...q, cash: 120 }
        : q.id === "p2"
          ? { ...q, cash: 1500, botStrategy: humanBuyer ? null : q.botStrategy }
          : { ...q, cash: 1200 },
    ),
  };
}

/** A thin-delta purchase pending approval: p2 (human or bot) offers `cash`
 *  for p1's bare, non-strategic Kentucky (book $220). At $240 the evaluator
 *  delta is ~+$10 — above the ordinary accept margin, far below the $75
 *  human-proposal margin. At $330 it clears both. */
function kentuckyPending(humanProposer: boolean, cash: number): GameState {
  const base = freshGame();
  const pending: PendingTrade = {
    id: "t-k",
    proposerId: "p2",
    propertyTo: { [KENTUCKY]: "p2" },
    gojfTo: {},
    cashDelta: { p1: cash, p2: -cash },
    approvals: { p1: false, p2: true },
  };
  return {
    ...base,
    ownership: { [KENTUCKY]: "p1", [PACIFIC]: "p1", [NORTH_CAROLINA]: "p1", [PENNSYLVANIA_AVE]: "p1" },
    players: base.players.map((q) =>
      q.id === "p2"
        ? { ...q, cash: 1000, botStrategy: humanProposer ? null : q.botStrategy }
        : { ...q, cash: 1000 },
    ),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v11 — bot-vs-bot play is IDENTICAL to fable-v8 (the vacuous-SPRT claim)", () => {
  const v8OnV11Factory = makeParamBot({ ...FABLE_V8_PARAMS, humanAskOff: 0, humanProposalMargin: 0 });
  it("the factory copy is faithful with the human dims off", () => {
    for (const board of [freshGame(), extractionBoard(false), kentuckyPending(false, 240)]) {
      expect(v8OnV11Factory(board, "p1")).toEqual(fableV8Bot(board, "p1"));
      expect(v8OnV11Factory(board, "p2")).toEqual(fableV8Bot(board, "p2"));
    }
  });

  it("fable-v11 itself matches fable-v8 on every all-bot board", () => {
    for (const board of [freshGame(), extractionBoard(false), kentuckyPending(false, 240), kentuckyPending(false, 330)]) {
      expect(fableV11Bot(board, "p1")).toEqual(fableV8Bot(board, "p1"));
      expect(fableV11Bot(board, "p2")).toEqual(fableV8Bot(board, "p2"));
    }
  });
});

describe("fable-v11 — F12a: no premium asks against humans", () => {
  it("fable-v8 arms the extraction sale against a HUMAN buyer (the corpus's 0%-conversion spam)", () => {
    const decision = fableV8Bot(extractionBoard(true), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue");
  });

  it("fable-v11 does not construct the ask against the human", () => {
    expect(fableV11Bot(extractionBoard(true), "p1")).toBeNull();
  });

  it("fable-v11 still asks a BOT buyer in the same state", () => {
    const decision = fableV11Bot(extractionBoard(false), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue");
  });
});

describe("fable-v11 — F12a: no surplus riders on swaps to humans (the probe-8 leak)", () => {
  // Mutual-completion swap geometry: p1 holds two oranges + the pink
  // completer; p2 holds two pinks + the orange completer; p2 is cash-rich so
  // the F4 chargeSurplus rider fires on p2's surplus. Probe game 8 caught the
  // rider pricing a HUMAN's wallet to the dollar — the ask tell through the
  // swap door.
  const ST_CHARLES = 11;
  const STATES = 13;
  const VIRGINIA = 14;
  function swapDraftBoard(humanOpp: boolean): GameState {
    const base = freshGame();
    return {
      ...base,
      ownership: {
        [ST_JAMES]: "p1",
        [TENNESSEE]: "p1",
        [ST_CHARLES]: "p1",
        [STATES]: "p2",
        [VIRGINIA]: "p2",
        [NEW_YORK]: "p2",
      },
      players: base.players.map((q) =>
        q.id === "p2"
          ? { ...q, cash: 1500, botStrategy: humanOpp ? null : q.botStrategy }
          : { ...q, cash: 800 },
      ),
      turn: {
        ...base.turn,
        phase: "trade-building",
        tradeDraft: { proposerId: "p1", propertyTo: {}, gojfTo: {}, cashDelta: {} },
      },
    };
  }

  function draftCash(decision: ReturnType<typeof fableV11Bot>, pid: string): number {
    if (decision?.intent.kind !== "update-trade-draft") throw new Error("expected a draft update");
    return decision.intent.terms.cashDelta[pid] ?? 0;
  }

  it("against a BOT the surplus rider still charges (identity with fable-v8)", () => {
    const v8 = fableV8Bot(swapDraftBoard(false), "p1");
    const v11 = fableV11Bot(swapDraftBoard(false), "p1");
    expect(v11).toEqual(v8);
    expect(draftCash(v11, "p1")).toBeGreaterThan(0);
  });

  it("against a HUMAN no cash is ever extracted — riders flow toward the human or not at all", () => {
    const decision = fableV11Bot(swapDraftBoard(true), "p1");
    expect(draftCash(decision, "p1")).toBeLessThanOrEqual(0);
  });
});

describe("fable-v11 — F12b: the human-proposal margin", () => {
  it("fable-v8 accepts the thin $240 human offer (the probed boundary)", () => {
    const decision = fableV8Bot(kentuckyPending(true, 240), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v11 declines it — thin deals from humans are priced better for them", () => {
    const decision = fableV11Bot(kentuckyPending(true, 240), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
    expect(decision?.note).toContain("from a human");
  });

  it("the identical BOT-proposed deal is still accepted", () => {
    const decision = fableV11Bot(kentuckyPending(false, 240), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("a human offer clearing the margin is accepted", () => {
    const decision = fableV11Bot(kentuckyPending(true, 330), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v11 — vector provenance", () => {
  it("differs from fable-v8 in exactly the two human dims", () => {
    const changed = Object.keys(FABLE_V11_PARAMS).filter(
      (k) =>
        k in FABLE_V8_PARAMS &&
        FABLE_V11_PARAMS[k as keyof typeof FABLE_V11_PARAMS] !==
          FABLE_V8_PARAMS[k as keyof typeof FABLE_V8_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V11_PARAMS.humanAskOff).toBe(1);
    expect(FABLE_V11_PARAMS.humanProposalMargin).toBe(75);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V11_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V11_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V11_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V11_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v11 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [extractionBoard(true), kentuckyPending(true, 240), kentuckyPending(true, 330)]) {
      expect(fableV11Bot(board, "p1")).toEqual(fableV11Bot(board, "p1"));
      expect(fableV11Bot(board, "p2")).toEqual(fableV11Bot(board, "p2"));
    }
  });
});
