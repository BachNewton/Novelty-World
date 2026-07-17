import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameEvent, GameState, PendingTrade } from "../../../types";
import { fableV1Bot, FABLE_V1_PARAMS } from "../fable-v1";
import { makeParamBot } from "./bot";
import { FABLE_V2_PARAMS, fableV2Bot } from "./index";

// fable-v2 = fable-v1's factory VERBATIM bound to the alpha=0.5 blend of
// fable-v1's vector and the 2026-07-17 combined-space ES winner (index.ts).
// Pinned here: (1) the factory copy is faithful — fable-v1's vector bound to
// THIS factory reproduces fable-v1's decisions; (2) the degenerate-behavior
// guards hold on the new vector (ring-proof transfer memory); (3) the
// extraction engine still fires; (4) determinism.

const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const VENTNOR = 27;

/** The F4 extraction geometry from fable-v1's tests: p1 holds the orange
 *  completer, p2 is one short and rich-but-not-runaway, p1 has a cash outlet. */
function extractionBoard(): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [NEW_YORK]: "p1", [MEDITERRANEAN]: "p1", [ST_JAMES]: "p2", [TENNESSEE]: "p2" },
    mortgaged: { [MEDITERRANEAN]: true },
    players: base.players.map((q) =>
      q.id === "p1"
        ? { ...q, cash: 120 }
        : q.id === "p2"
          ? { ...q, cash: 1500 }
          : { ...q, cash: 1200 },
    ),
  };
}

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

/** p2 offers p1 a near-free lot that p1 does not complete anything with —
 *  accepted cold, declined when the lot just changed hands (F3). */
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

describe("fable-v2 — the factory copy is faithful to fable-v1", () => {
  const v1OnV2Factory = makeParamBot(FABLE_V1_PARAMS);
  const boards: [string, GameState][] = [
    ["fresh pre-roll", freshGame()],
    ["extraction geometry", extractionBoard()],
    ["churn offer", churnBoard(true)],
  ];
  it.each(boards)("matches fableV1Bot on %s", (_name, board) => {
    expect(v1OnV2Factory(board, "p1")).toEqual(fableV1Bot(board, "p1"));
    expect(v1OnV2Factory(board, "p2")).toEqual(fableV1Bot(board, "p2"));
  });
});

describe("fable-v2 — guards hold on the blend vector", () => {
  it("still declines churning a just-traded lot (F3, transferMemoryTurns pinned)", () => {
    expect(FABLE_V2_PARAMS.transferMemoryTurns).toBe(10);
    const decision = fableV2Bot(churnBoard(true), "p1");
    expect(decision?.intent.kind).toBe("decline-trade");
    expect(decision?.note).toContain("churning");
  });

  it("still accepts the same lot without trade history", () => {
    const decision = fableV2Bot(churnBoard(false), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("keeps the invariant pins (lockstep, bounded survival, extraction)", () => {
    expect(FABLE_V2_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V2_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V2_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v2 — the extraction engine still fires", () => {
  it("arms a SELL of the held completer at the rival's solved premium", () => {
    const decision = fableV2Bot(extractionBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue to");
    expect(decision?.note).toContain("premium");
  });
});

describe("fable-v2 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [extractionBoard(), churnBoard(true)]) {
      expect(fableV2Bot(board, "p1")).toEqual(fableV2Bot(board, "p1"));
      expect(fableV2Bot(board, "p2")).toEqual(fableV2Bot(board, "p2"));
    }
  });
});
