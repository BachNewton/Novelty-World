import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { type ParamVector, makeParamBot } from "./bot";
import { CLAUDE_V46_PARAMS } from "./index";

// claude-v46 is a warm-start maximin ES re-optimization of claude-v45 with
// `holderDenialFrac` PINNED at the lockstep value 1.0. The pin is the whole point:
// it keeps the win-share ES from re-opening the held-completer hot-potato ring
// (claude-v44's holderDenialFrac=0.461 regression — game:review 2b6y55). This test
// pins that the ring stays dead in the new vector, using the same live geometry:
// the browns are split — a one-short RIVAL holds Baltic, a NON-rival holds
// Mediterranean — so Mediterranean is a pure denial asset that neither non-rival can
// complete. At lockstep the holder's reservation price equals the most a non-rival
// denier will pay, so no bot->bot hop clears and the second denier never arms a buy.
//
// Browns = {1: Mediterranean, 3: Baltic}. freshGame seats p1..p4 and opens at p1's
// pre-roll. p1 is the would-be second denier/proposer; p2 holds Mediterranean (the
// non-rival holder); p3 is the one-short rival holding Baltic.

const MEDITERRANEAN = 1;
const BALTIC = 3;

/** The same vector with the BROKEN holder lever (claude-v44's 0.461) — the
 *  counterfactual that re-opens the ring, to prove the pin is load-bearing. */
const RING_PARAMS: ParamVector = { ...CLAUDE_V46_PARAMS, holderDenialFrac: 0.46116817823802936 };

const ringBot = makeParamBot(RING_PARAMS); // hot-potato if the lever is unpinned
const v46Bot = makeParamBot(CLAUDE_V46_PARAMS); // lockstep — ring dead

/** p1's pre-roll, browns split: Mediterranean at non-rival p2, Baltic at the
 *  one-short rival p3. Everyone flush so cash never blocks the trade. */
function splitBrownsBoard(): GameState {
  const base = freshGame();
  return {
    ...base,
    ownership: { [MEDITERRANEAN]: "p2", [BALTIC]: "p3" },
    players: base.players.map((p) => ({ ...p, cash: 3000 })),
  };
}

describe("claude-v46 — holderDenialFrac stays pinned at 1.0 (ring dead)", () => {
  it("the broken 0.461 lever ARMS the deny-buy — the hop the pin prevents", () => {
    const decision = ringBot(splitBrownsBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note?.toLowerCase()).toContain("deny");
  });

  it("claude-v46 (1.0) REFUSES the deny-buy — the holder's price clears no non-rival hop", () => {
    const decision = v46Bot(splitBrownsBoard(), "p1");
    // No proposable trade and nothing to build → the bot arms nothing. The ring
    // never starts because no price clears the holder's full option value.
    expect(decision).toBeNull();
  });

  it("the vector pins holderDenialFrac to the lockstep value", () => {
    expect(CLAUDE_V46_PARAMS.holderDenialFrac).toBe(1);
  });

  it("is deterministic — same refusal on a repeat call", () => {
    const board = splitBrownsBoard();
    expect(v46Bot(board, "p1")).toEqual(v46Bot(board, "p1"));
  });
});
