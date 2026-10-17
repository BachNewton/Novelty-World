import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import type { Bot } from "../bot";
import { greedyBot } from "../greedy";
import { ruleV3Bot } from "../rule-v3";
import { ruleBot } from "./index";
import { AS_V3_PARAMS } from "./params";

// v4 moved v3's opponent model out of the evaluation unchanged before changing it: with the
// model set to v3's, v4 plays v3's moves, so every difference v4 measures is its beliefs.

function moves(bot: Bot, seed: string, seats: (bot: Bot) => Bot[]): string {
  const hash = createHash("sha256");
  playGame({ seed, bots: seats(bot), maxTurns: 300, observe: { decided: (input, move) => hash.update(`${input.seat.toString()}:${JSON.stringify(move)};`) } });
  return hash.digest("hex");
}

describe("v4 with v3's opponent model", () => {
  const asV3 = ruleBot(AS_V3_PARAMS);
  it("plays v3's moves", () => {
    for (const [seed, seats] of [
      ["same-a", (b: Bot) => [b, b, b]],
      ["same-b", (b: Bot) => [b, greedyBot, b, greedyBot]],
    ] as const) {
      expect(moves(asV3, seed, seats)).toBe(moves(ruleV3Bot, seed, seats));
    }
  });
});
