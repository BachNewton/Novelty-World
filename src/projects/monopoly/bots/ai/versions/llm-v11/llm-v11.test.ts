import { describe, expect, it } from "vitest";
import type { AiDecisionRecord, GameState } from "../../../../types";
import { claimAi, settleAnswer } from "../../decide";
import { liveAuctionNotes } from "../../held";
import { AI, auctioning, table } from "../../eval/board";
import { DECISION_SPECS } from "./answers";

const running: GameState = auctioning(table("ai:claude@llm-v11"), 39);

const RECORD: AiDecisionRecord = {
  decision: "auction",
  version: "llm-v11",
  model: "m",
  ms: 900,
  thinkMs: null,
  answerMs: 900,
  promptTokens: 100,
  completionTokens: 10,
  thinkHitBudget: null,
};

describe("llm-v11 auctions: the note shown live", () => {
  it("tells the seat its note is shown at once", () => {
    const question = DECISION_SPECS.auction?.question(running, AI) ?? "";
    expect(question).toContain("Your publicNote is shown to the table at once, while the auction runs.");
    expect(question).not.toContain("only after the auction closes");
  });

  it("puts the note on the board as soon as it answers", () => {
    const claim = claimAi(running, AI);
    if (!claim) throw new Error("expected the auction to be owed");
    const answer = { privateNote: "x", publicNote: "Boardwalk is worth a fight.", plan: "y", maxBid: 450 };
    const settled = settleAnswer(claim.state, claim.state, AI, claim.decision, answer, RECORD);
    if (settled.kind !== "commit") throw new Error("expected the answer to commit");
    expect(liveAuctionNotes(settled.state).get(AI)?.text).toBe("Boardwalk is worth a fight.");
  });
});
