import { describe, expect, it } from "vitest";
import type { Move } from "../../contract";
import { playGame } from "../../eval/runner";
import { riskBot } from "..";
import { ruleBot } from ".";
import { NO_FIXES, V6_PARAMS } from "./params";

// v6 is v5 with switches (`ideas/rule-bot-v6.md`), so with every switch off it must be v5, move
// for move: that is what lets a screen pin a result on the one fix it switched on.

const v6Bare = ruleBot({ ...V6_PARAMS, fixes: NO_FIXES });

function moves(seed: string, seats: readonly string[], swap: boolean): string[] {
  const out: string[] = [];
  playGame({
    seed,
    bots: seats.map((s) => (swap && s === "rule-v5" ? v6Bare : riskBot(s))),
    maxTurns: 200,
    observe: { decided: (input, move: Move) => out.push(`${input.seat.toString()}:${JSON.stringify(move)}`) },
  });
  return out;
}

describe("rule-v6 with every fix off", () => {
  for (const [seed, seats] of [
    ["parity-a", ["rule-v5", "rule-v5", "rule-v5"]],
    ["parity-b", ["rule-v5", "greedy", "rule-v4", "rule-v5", "gd-stacker"]],
  ] as const) {
    it(`plays v5's moves (${seed})`, () => {
      expect(moves(seed, seats, true)).toEqual(moves(seed, seats, false));
    });
  }
});
