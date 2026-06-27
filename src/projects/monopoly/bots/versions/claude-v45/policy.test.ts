import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { type ParamVector, makeParamBot } from "./bot";
import { CLAUDE_V45_PARAMS } from "./index";

// claude-v45 pins `holderDenialFrac` to the LOCKSTEP value 1.0, killing the
// held-completer hot-potato that claude-v44 (holderDenialFrac=0.461) exhibits.
// Reproduces the live geometry from `npm run game:review 2b6y55`: the browns are
// split — a one-short RIVAL holds Baltic, a NON-rival holds Mediterranean — so
// Mediterranean is a pure denial asset that neither non-rival can ever complete.
// claude-v44 lets a second non-rival buy it "to deny", and the two non-rivals
// then swap it back and forth forever at a fair price (T60-T72). claude-v45
// refuses: at lockstep the holder's reservation price equals the most a non-rival
// denier will pay, so no bot->bot hop clears.
//
// Browns = {1: Mediterranean, 3: Baltic}. freshGame seats p1..p4 and opens at
// p1's pre-roll. Map the live seats onto: p1 = John (the would-be second denier /
// proposer), p2 = Mary (current holder), p3 = Santiago (the one-short rival who
// holds Baltic).

const MEDITERRANEAN = 1;
const BALTIC = 3;

/** claude-v44's vector: identical to v45 except the broken holder lever. */
const V44_PARAMS: ParamVector = { ...CLAUDE_V45_PARAMS, holderDenialFrac: 0.46116817823802936 };

const v44Bot = makeParamBot(V44_PARAMS); // the hot-potato vector
const v45Bot = makeParamBot(CLAUDE_V45_PARAMS); // the lockstep fix

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

describe("claude-v45 — holderDenialFrac=1 lockstep kills the held-completer ring", () => {
  it("claude-v44 (0.461) ARMS the deny-buy — the hot-potato hop that loops in 2b6y55", () => {
    const decision = v44Bot(splitBrownsBoard(), "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note?.toLowerCase()).toContain("deny");
  });

  it("claude-v45 (1.0) REFUSES the deny-buy — the holder's price clears no non-rival hop", () => {
    const decision = v45Bot(splitBrownsBoard(), "p1");
    // No proposable trade and nothing to build → the bot arms nothing. The ring
    // never starts because no price clears the holder's full option value.
    expect(decision).toBeNull();
  });

  it("the fix is deterministic — same refusal on a repeat call", () => {
    const board = splitBrownsBoard();
    expect(v45Bot(board, "p1")).toEqual(v45Bot(board, "p1"));
  });
});
