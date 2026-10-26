import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import { greedyBot } from "../greedy";
import { ruleBot } from ".";
import { V7_1_PARAMS } from "./params";

// A whole game of v7.1's searches, every one of its moves through the runner's legality check: the
// endgame's eliminations, forced trades and last captures, which a few turns' tests don't reach. At
// 5 seats, where v6.1's settings are in effect.

describe("rule-v7.1", () => {
  it("makes only legal moves, game to its end", () => {
    const v7_1 = ruleBot({ ...V7_1_PARAMS, search: { replies: 1, candidates: 2, mixed: 1 } });
    expect(playGame({ seed: "legal-5", bots: [v7_1, greedyBot, greedyBot, greedyBot, greedyBot], maxTurns: 600 }).winner).not.toBeNull();
  }, 60_000);
});
