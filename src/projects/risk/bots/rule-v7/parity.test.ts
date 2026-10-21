import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keptRecording, replayMoves } from "../../eval/replay";
import { riskBot } from "..";

// v7 with no replies is v6 (`ideas/rule-bot-v7.md`), move for move, so the budget curve's first
// point is v6 itself and anything the replies change is theirs. Each game is kept as its moves
// (`__fixtures__/`), played by v6 and the bots beside it, and v7 is asked every one of v6's
// decisions again on the same input, a slice at a time, so no one test outlasts the timeout
// under a full parallel run. v6 is frozen, so its kept moves are the moves it makes.

const MAX_TURNS = 60;
/** v6's decisions asked of v7 in one test, about half a second on one idle core. */
const SLICE = 120;

describe("rule-v7 with no replies", () => {
  const bare = riskBot('rule-v7~{"replies":0}');
  for (const [seed, seats] of [
    ["parity-a", ["rule-v6", "rule-v6", "rule-v6"]],
    ["parity-b", ["rule-v6", "greedy", "rule-v5", "rule-v6", "gd-stacker"]],
  ] as const) {
    const kept = keptRecording(join(__dirname, "__fixtures__", `${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS);
    const v6: number[] = [];
    kept.seats.forEach((seat, decision) => {
      if (seats[seat] === "rule-v6") v6.push(decision);
    });
    for (let from = 0; from < v6.length; from += SLICE) {
      const slice = new Set(v6.slice(from, from + SLICE));
      it(`plays v6's moves (${seed}, v6's decisions ${from.toString()} to ${(from + slice.size - 1).toString()})`, () => {
        replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
          if (slice.has(decision)) expect(bare(input), `decision ${decision.toString()}`).toEqual(move);
        });
      });
    }
  }
});
