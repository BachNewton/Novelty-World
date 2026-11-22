import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import type { BotInput } from "../bot";
import { greedyBot } from "../greedy";
import { loadNet } from "../net-v1/network";
import { CLOCK, GLOBAL, observe } from "../net-v1/observe";
import { WEIGHTS } from "../net-v1/weights/d4-500";
import { TURN_CAP } from "../turn-cap";
import { learnedV3Bot } from "./index";

// learned-v3 reads the clock, the player-turns left before `TURN_CAP`. An online game has no cap, so
// a game can run past it: there the clock holds at zero, and the observation differs from the cap's
// own turn only in the turn itself (every net-v1 reads it, over 300, unbounded), never further than
// any net that doesn't read the clock sees there.

/** A few inputs of a greedy game, each kind of decision once. */
function inputs(): BotInput[] {
  const found = new Map<string, BotInput>();
  playGame({
    seed: "learned-v3-clock",
    maxTurns: 30,
    bots: Array.from({ length: 5 }, () => (input: BotInput) => {
      if (!found.has(input.options.kind)) found.set(input.options.kind, input);
      return greedyBot(input);
    }),
  });
  return [...found.values()];
}

const at = (input: BotInput, turn: number): BotInput => ({ ...input, view: { ...input.view, turn } });

describe("learned-v3 past the turn cap", () => {
  const all = inputs();

  it("reads the clock", () => {
    expect(loadNet(WEIGHTS).clock).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("counts the clock down to zero at the cap and holds it there past it", () => {
    const glob = (input: BotInput, turn: number): Float32Array => observe(at(input, turn), true).glob;
    const turnFeature = (input: BotInput, turn: number): number => observe(at(input, turn), false).glob.indexOf(Math.fround(turn / 300));
    for (const input of all) {
      expect(glob(input, TURN_CAP - 100)[GLOBAL + CLOCK - 1]).toBe(1);
      const cap = glob(input, TURN_CAP);
      expect(cap[GLOBAL + CLOCK - 1]).toBe(0);
      for (const turn of [TURN_CAP + 1, 4 * TURN_CAP, 100_000]) {
        const past = glob(input, turn);
        const differ = [...past.keys()].filter((i) => past[i] !== cap[i]);
        expect(differ).toEqual([turnFeature(input, turn)]);
      }
    }
  });

  it("answers far past the cap", () => {
    for (const input of all) expect(learnedV3Bot(at(input, 100_000)).kind).toBeTypeOf("string");
  });
});
