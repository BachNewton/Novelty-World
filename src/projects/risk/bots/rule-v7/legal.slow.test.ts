import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import { greedyBot } from "../greedy";
import { ruleBot } from ".";
import { V7_PARAMS } from "./params";

// A whole game of v7's searches, every one of its moves through the runner's legality check: the
// endgame's eliminations, forced trades and last captures, which a few turns' tests don't reach.

describe("rule-v7", () => {
  it("makes only legal moves, game to its end", () => {
    const v7 = ruleBot({ ...V7_PARAMS, search: { replies: 1, candidates: 2, mixed: 1 } });
    expect(playGame({ seed: "legal-3", bots: [v7, greedyBot, greedyBot], maxTurns: 600 }).winner).not.toBeNull();
  }, 30_000);
});
