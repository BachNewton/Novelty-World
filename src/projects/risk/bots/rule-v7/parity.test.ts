import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import { riskBot } from "..";

// v7 with no replies is v6 (`ideas/rule-bot-v7.md`), move for move, so the budget curve's first
// point is v6 itself and anything the replies change is theirs. One game each, v7 asked every
// decision v6 makes, on the same input.

describe("rule-v7 with no replies", () => {
  const bare = riskBot('rule-v7~{"replies":0}');
  for (const [seed, seats] of [
    ["parity-a", ["rule-v6", "rule-v6", "rule-v6"]],
    ["parity-b", ["rule-v6", "greedy", "rule-v5", "rule-v6", "gd-stacker"]],
  ] as const) {
    it(`plays v6's moves (${seed})`, () => {
      let asked = 0;
      playGame({
        seed,
        bots: seats.map(riskBot),
        maxTurns: 30,
        observe: {
          decided: (input, move) => {
            if (seats[input.seat] !== "rule-v6") return;
            expect(bare(input)).toEqual(move);
            asked++;
          },
        },
      });
      expect(asked).toBeGreaterThan(50);
    });
  }
});
