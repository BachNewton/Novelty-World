import { describe, expect, it } from "vitest";
import type { AiDecisionRecord, GameState } from "../../../../types";
import { claimAi, settleAnswer } from "../../decide";
import { aiDecisionFor } from "../../decisions";
import { liveAuctionNotes } from "../../held";
import { AI, auctioning, owning, table, turnStart } from "../../eval/board";

const RECORD: AiDecisionRecord = {
  decision: "auction",
  version: "llm-v12",
  model: "m",
  ms: 900,
  thinkMs: null,
  answerMs: 900,
  promptTokens: 100,
  completionTokens: 10,
  thinkHitBudget: null,
};

describe("llm-v12: llm-v9's turn start with llm-v11's live auction notes", () => {
  it("is asked at a turn start where llm-v8 rolls without a call", () => {
    const at = (version: string): GameState => {
      const game = owning(table(`ai:claude@${version}`), { [AI]: [6, 39] });
      return turnStart({ ...game, turns: Array.from({ length: 5 }, (_, i) => ({ turn: i + 1, playerId: AI, events: [] })) });
    };
    expect(aiDecisionFor(at("llm-v8"), AI)).toBeNull();
    expect(aiDecisionFor(at("llm-v12"), AI)).toBe("turn-start");
  });

  it("puts its auction note on the board as soon as it answers", () => {
    const claim = claimAi(auctioning(table("ai:claude@llm-v12"), 39), AI);
    if (!claim) throw new Error("expected the auction to be owed");
    const answer = { privateNote: "x", publicNote: "Boardwalk is worth a fight.", plan: "y", maxBid: 450 };
    const settled = settleAnswer(claim.state, claim.state, AI, claim.decision, answer, RECORD);
    if (settled.kind !== "commit") throw new Error("expected the answer to commit");
    expect(liveAuctionNotes(settled.state).get(AI)?.text).toBe("Boardwalk is worth a fight.");
  });
});
