import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keptRecording, replayMoves } from "../../eval/replay";
import { riskBot } from "..";
import { ruleBot, ruleV5_1Bot } from ".";
import { V5_1_PARAMS } from "./params";

// v5.1 is v5 wherever v6.1's settings are off: with them gated off at every table it makes v5's
// kept moves, and at its default it is v5 at 3 players. Each game is v5's own frozen game, asked a
// slice of v5's decisions at a time, so no one test outlasts the timeout under a full parallel run.

const MAX_TURNS = 300;
const SLICE = 150;
const FROZEN = join(__dirname, "..", "__fixtures__", "frozen");

describe("rule-v5.1 with v6.1's settings off is v5", () => {
  const gatedOff = ruleBot({ ...V5_1_PARAMS, minPlayers: 7 });
  for (const [seed, seats, bot] of [
    ["frozen-a", ["rule-v5", "rule-v5", "rule-v5"], ruleV5_1Bot],
    ["frozen-b", ["rule-v5", "greedy", "rule-v5", "greedy", "greedy"], gatedOff],
  ] as const) {
    const kept = keptRecording(join(FROZEN, `rule-v5.${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS);
    const v5: number[] = [];
    kept.seats.forEach((seat, decision) => {
      if (seats[seat] === "rule-v5") v5.push(decision);
    });
    for (let from = 0; from < v5.length; from += SLICE) {
      const slice = new Set(v5.slice(from, from + SLICE));
      it(`makes v5's moves (${seed}, v5's decisions ${from.toString()} to ${(from + slice.size - 1).toString()})`, () => {
        replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
          if (slice.has(decision)) expect(bot(input), `decision ${decision.toString()}`).toEqual(move);
        });
      });
    }
  }
});
