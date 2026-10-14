import { describe, expect, it } from "vitest";
import { NO_HAUNT_ENGINE, simulate } from "./simulation";
import { ENGINE } from "./game";
import { ALL_TOY_ENGINE } from "./test/toy-haunt";

// The full random sweep: whole games over many seeds, a random but legal
// policy on every seat (see simulation.ts for what is checked at every
// write). It is opt-in, for engine changes, and skipped otherwise:
//   BETRAYAL_SWEEP=1 npx vitest run --config vitest.slow.config.ts src/projects/betrayal/simulation.slow.test.ts
// A failure names its seed, which replays the same game: simulate("s123").

/** The longest games, a long haunt 13 played out, take about 6 seconds;
 *  most take under 2. A game is
 *  synchronous, so vitest can't stop one that runs over: it fails it once it
 *  finishes. A game stuck in a loop is stopped by the simulation's own turn
 *  limits. */
const GAME_TIMEOUT = 40_000;

const seeds = (count: number) =>
  Array.from({ length: count }, (_, i) => `s${i}`);

describe.runIf(process.env.BETRAYAL_SWEEP)("the random sweep", () => {
  // A haunt that is built is played out to its end; any other stops the game.
  describe("random play to the haunt, or until the house is full", () => {
    it.each(seeds(400))(
      "seed %s",
      (seed) => {
        expect(["haunt", "finished", "house-full"]).toContain(
          simulate(seed, ENGINE).ending,
        );
      },
      GAME_TIMEOUT,
    );
  });

  describe("random play with the haunt held off until the house is full", () => {
    it.each(seeds(150))(
      "seed %s",
      (seed) => {
        expect(simulate(seed, NO_HAUNT_ENGINE).ending).toBe("house-full");
      },
      GAME_TIMEOUT,
    );
  });

  // Haunt 13 started at once, by a revealer the seed picks, and played to its
  // end: the traitor's top-up, the monster turns, escapes, unleashing and the
  // heroes' wake rolls.
  describe("random play through haunt 13 to its end", () => {
    it.each(seeds(40).map((s) => `h13-${s}`))(
      "seed %s",
      (seed) => {
        expect(simulate(seed, ENGINE, undefined, { haunt: 13 }).ending).toBe(
          "finished",
        );
      },
      GAME_TIMEOUT,
    );
  });

  // The haunt framework is swept with the toy haunt (test/toy-haunt.ts)
  // standing in for every haunt on the chart, built or not.
  describe("random play through a toy haunt to the game's end, or a full house", () => {
    it.each(seeds(100))(
      "seed %s",
      (seed) => {
        expect(["finished", "house-full"]).toContain(
          simulate(seed, ALL_TOY_ENGINE).ending,
        );
      },
      GAME_TIMEOUT,
    );
  });
});
