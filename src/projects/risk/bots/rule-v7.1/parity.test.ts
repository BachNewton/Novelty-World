import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keptRecording, replayMoves } from "../../eval/replay";
import { riskBot } from "..";

// v7.1 with no replies is v6.1, move for move, so anything the replies change is theirs. Each game
// is kept as its moves (`__fixtures__/`), played by v6.1 and the bots beside it, at 5 and 6 seats
// where v6.1's settings are in effect, and v7.1 is asked every one of v6.1's decisions again on the
// same input, a slice at a time, so no one test outlasts the timeout under a full parallel run.

const MAX_TURNS = 60;
/** v6.1's decisions asked of v7.1 in one test, about half a second on one idle core. */
const SLICE = 120;

describe("rule-v7.1 with no replies", () => {
  const bare = riskBot('rule-v7.1~{"replies":0}');
  for (const [seed, seats] of [
    ["parity-5", ["rule-v6.1", "greedy", "rule-v5", "rule-v6.1", "gd-stacker"]],
    ["parity-6", ["rule-v6.1", "rule-v6.1", "gd-aggressive", "rule-v6.1", "rule-v6.1", "rule-v6.1"]],
  ] as const) {
    const kept = keptRecording(join(__dirname, "__fixtures__", `${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS);
    const v6_1: number[] = [];
    kept.seats.forEach((seat, decision) => {
      if (seats[seat] === "rule-v6.1") v6_1.push(decision);
    });
    for (let from = 0; from < v6_1.length; from += SLICE) {
      const slice = new Set(v6_1.slice(from, from + SLICE));
      it(`plays v6.1's moves (${seed}, v6.1's decisions ${from.toString()} to ${(from + slice.size - 1).toString()})`, () => {
        replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
          if (slice.has(decision)) expect(bare(input), `decision ${decision.toString()}`).toEqual(move);
        });
      });
    }
  }
});
