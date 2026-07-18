import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameEvent, GameState, PendingTrade } from "../../../types";
import { fableV12Bot, FABLE_V12_PARAMS } from "../fable-v12";
import { makeParamBot } from "./bot";
import { FABLE_V15_PARAMS, fableV15Bot } from "./index";

// fable-v15 = fable-v12's factory VERBATIM (self-contained snapshot) bound to the
// 2026-07-18 constrained-ES winning vector (index.ts). Pinned here: (1) the factory
// copy is faithful — fable-v12's vector bound to THIS factory reproduces fable-v12's
// decisions; (2) the load-bearing invariants hold on the ES vector (the
// holderDenialFrac=1.0 buyer/holder lockstep — THE pin the claude-v45 lesson exists
// for; bounded survival; extraction); (3) the ES's distinctive jail move is present
// (jailStayThreshold 0 → ~4.9); (4) the extraction engine still fires; (5) determinism.

const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const VENTNOR = 27;

/** The F4 extraction geometry: p1 holds the orange completer, p2 is one short and
 *  rich-but-not-runaway, p1 has a cash outlet. */
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

/** p2 offers p1 a near-free lot p1 completes nothing with — accepted cold, declined
 *  when the lot just changed hands (F3 transfer memory). */
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

describe("fable-v15 — the factory copy is faithful to fable-v12", () => {
  const v12OnV15Factory = makeParamBot(FABLE_V12_PARAMS);
  const boards: [string, GameState][] = [
    ["fresh pre-roll", freshGame()],
    ["extraction geometry", extractionBoard()],
    ["churn offer", churnBoard(true)],
  ];
  it.each(boards)("matches fableV12Bot on %s", (_name, board) => {
    expect(v12OnV15Factory(board, "p1")).toEqual(fableV12Bot(board, "p1"));
    expect(v12OnV15Factory(board, "p2")).toEqual(fableV12Bot(board, "p2"));
  });
});

describe("fable-v15 — invariants hold on the ES vector", () => {
  it("pins the buyer/holder denial LOCKSTEP (holderDenialFrac = 1.0)", () => {
    // The claude-v45 lesson: an unconstrained ES re-opens the held-completer
    // hot-potato unless this is pinned to 1.0. The ES leg pinned it; assert it stuck.
    expect(FABLE_V15_PARAMS.holderDenialFrac).toBe(1);
  });

  it("keeps bounded survival + the extraction engine on", () => {
    expect(FABLE_V15_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V15_PARAMS.extractionOn).toBe(1);
    expect(FABLE_V15_PARAMS.transferMemoryTurns).toBe(10);
  });

  it("carries the ES's distinctive jail move (sit longer on a developed board)", () => {
    // The ES independently pushed jailStayThreshold 0 → ~4.9 (corroborating the
    // probe fleet's jail-as-haven finding); fable-v12's is 0.
    expect(FABLE_V15_PARAMS.jailStayThreshold).toBeGreaterThan(1);
    expect(FABLE_V12_PARAMS.jailStayThreshold).toBe(0);
  });

  it("still declines churning a just-traded lot; accepts it without history", () => {
    expect(fableV15Bot(churnBoard(true), "p1")?.intent.kind).toBe("decline-trade");
    expect(fableV15Bot(churnBoard(false), "p1")?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v15 — the extraction engine still fires", () => {
  it("arms a SELL of the held completer at the rival's solved premium", () => {
    const decision = fableV15Bot(extractionBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("Selling New York Avenue to");
    expect(decision?.note).toContain("premium");
  });
});

describe("fable-v15 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [extractionBoard(), churnBoard(true)]) {
      expect(fableV15Bot(board, "p1")).toEqual(fableV15Bot(board, "p1"));
      expect(fableV15Bot(board, "p2")).toEqual(fableV15Bot(board, "p2"));
    }
  });
});
