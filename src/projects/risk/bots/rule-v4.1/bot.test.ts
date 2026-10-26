import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keptRecording, replayMoves } from "../../eval/replay";
import { riskBot } from "..";
import { ruleBot, ruleV4_1Bot } from ".";
import { V4_1_PARAMS } from "./params";

// v4.1 is v4 wherever v6.1's settings are off: with them gated off at every table it makes v4's
// kept moves, and at its default it is v4 at 3 players. Each game is v4's own frozen game, asked a
// slice of v4's decisions at a time, so no one test outlasts the timeout under a full parallel run.

const MAX_TURNS = 300;
const SLICE = 150;
const FROZEN = join(__dirname, "..", "__fixtures__", "frozen");

describe("rule-v4.1 with v6.1's settings off is v4", () => {
  const gatedOff = ruleBot({ ...V4_1_PARAMS, minPlayers: 7 });
  for (const [seed, seats, bot] of [
    ["frozen-a", ["rule-v4", "rule-v4", "rule-v4"], ruleV4_1Bot],
    ["frozen-b", ["rule-v4", "greedy", "rule-v4", "greedy", "greedy"], gatedOff],
  ] as const) {
    const kept = keptRecording(join(FROZEN, `rule-v4.${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS);
    const v4: number[] = [];
    kept.seats.forEach((seat, decision) => {
      if (seats[seat] === "rule-v4") v4.push(decision);
    });
    for (let from = 0; from < v4.length; from += SLICE) {
      const slice = new Set(v4.slice(from, from + SLICE));
      it(`makes v4's moves (${seed}, v4's decisions ${from.toString()} to ${(from + slice.size - 1).toString()})`, () => {
        replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
          if (slice.has(decision)) expect(bot(input), `decision ${decision.toString()}`).toEqual(move);
        });
      });
    }
  }
});
