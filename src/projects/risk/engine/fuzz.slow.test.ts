import { describe, expect, it } from "vitest";
import { referenceEngine as engine } from ".";
import { checkOptionsMatchApply, MAX_STEPS, playRandomGame } from "./test-kit";

// The fast suite's random games, many times over. Its four games reach every event, but the rare
// ones, the forced trades after an elimination (ELIM-3), only a handful of times. These 48 games
// reach many more, in far more combinations: two forced trades in a row, eliminations mid-attack.
// As the oracle the fast engine is tested against, the reference engine's rare paths are the ones
// worth the time.

const SEEDS_PER_COUNT = 12;

describe("random-legal games, many seeds", () => {
  for (const players of [3, 4, 5, 6]) {
    it(`${players} players: ${SEEDS_PER_COUNT} games, invariants and options checked on every step`, () => {
      for (let i = 0; i < SEEDS_PER_COUNT; i++) {
        const game = playRandomGame({
          players,
          seed: `sweep-${players}-${i}`,
          engine,
          maxSteps: MAX_STEPS,
          onStep: checkOptionsMatchApply,
        });
        expect(game.winner).not.toBeNull();
      }
    }, 60_000);
  }
});
