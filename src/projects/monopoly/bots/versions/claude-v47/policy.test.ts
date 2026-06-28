import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { type ParamVector, makeParamBot } from "./bot";
import { CLAUDE_V47_PARAMS } from "./index";

// claude-v47 is a combined-space maximin ES run on the 33-param factory (v45's 31
// dims + two risk-aware standing levers), with `holderDenialFrac` PINNED at the 1.0
// lockstep. Two things to pin: (1) the held-completer hot-potato ring stays dead
// (the pin), using the same 2b6y55 split-browns geometry as v45/v46; (2) the two
// standing levers are actually ENGAGED (non-zero), since "the ES turned them on" is
// the whole point of the experiment.
//
// Browns = {1: Mediterranean, 3: Baltic}. freshGame opens at p1's pre-roll. p1 is the
// would-be second denier; p2 holds Mediterranean (non-rival holder); p3 is the
// one-short rival holding Baltic.

const MEDITERRANEAN = 1;
const BALTIC = 3;

/** The same vector with the BROKEN holder lever (claude-v44's 0.461) — re-opens the
 *  ring, proving the pin is load-bearing on this base too. */
const RING_PARAMS: ParamVector = { ...CLAUDE_V47_PARAMS, holderDenialFrac: 0.46116817823802936 };

const ringBot = makeParamBot(RING_PARAMS);
const v47Bot = makeParamBot(CLAUDE_V47_PARAMS);

function splitBrownsBoard(): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [MEDITERRANEAN]: "p2", [BALTIC]: "p3" },
    players: base.players.map((p) => ({ ...p, cash: 3000 })),
  };
}

describe("claude-v47 — risk-aware standing levers, holderDenialFrac pinned at 1.0", () => {
  it("the broken 0.461 lever ARMS the deny-buy — the hop the pin prevents", () => {
    const decision = ringBot(splitBrownsBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note?.toLowerCase()).toContain("deny");
  });

  it("claude-v47 (1.0) REFUSES the deny-buy — no non-rival hop clears", () => {
    expect(v47Bot(splitBrownsBoard(), "p1")).toBeNull();
  });

  it("the ES ENGAGED both standing levers (non-zero) and pinned the lockstep", () => {
    expect(CLAUDE_V47_PARAMS.holderDenialFrac).toBe(1);
    expect(CLAUDE_V47_PARAMS.standingFloorGain).not.toBe(0);
    expect(CLAUDE_V47_PARAMS.standingAuctionGain).not.toBe(0);
  });

  it("is deterministic — same refusal on a repeat call", () => {
    const board = splitBrownsBoard();
    expect(v47Bot(board, "p1")).toEqual(v47Bot(board, "p1"));
  });
});
