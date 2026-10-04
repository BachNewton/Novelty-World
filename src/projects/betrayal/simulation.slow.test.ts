import { describe, expect, it } from "vitest";
import { NO_HAUNT_ENGINE, simulate, type SimulationResult } from "./simulation";
import { ALL_TOY_ENGINE } from "./test/toy-haunt";

// Whole games over many seeds, a random but legal policy on every seat (see
// simulation.ts for what is checked at every write). A failure names its
// seed, which replays the same game: simulate("s123").

/** A long game takes a few seconds. */
const GAME_TIMEOUT = 60_000;

const seeds = (count: number) =>
  Array.from({ length: count }, (_, i) => `s${i}`);

const answered = new Set<string>();
const played = (result: SimulationResult) => {
  for (const kind of Object.keys(result.kinds)) answered.add(kind);
  return result;
};

describe("random play to the haunt, or until the house is full", () => {
  it.each(seeds(400))(
    "seed %s",
    (seed) => {
      expect(["haunt", "house-full"]).toContain(played(simulate(seed)).ending);
    },
    GAME_TIMEOUT,
  );
});

describe("random play with the haunt held off until the house is full", () => {
  it.each(seeds(150))(
    "seed %s",
    (seed) => {
      expect(played(simulate(seed, NO_HAUNT_ENGINE)).ending).toBe("house-full");
    },
    GAME_TIMEOUT,
  );
});

// No real haunt is built yet, so the haunt framework is swept with the toy
// haunt (test/toy-haunt.ts) standing in for every haunt on the chart.
describe("random play through a toy haunt to the game's end, or a full house", () => {
  it.each(seeds(100))(
    "seed %s",
    (seed) => {
      expect(["finished", "house-full"]).toContain(
        played(simulate(seed, ALL_TOY_ENGINE)).ending,
      );
    },
    GAME_TIMEOUT,
  );
});

// The sweep is only as good as what it reaches. Attacks before the haunt come
// only from a few cards, so the attack decisions are left to combat's tests.
// Tests in a file run in order, so this one sees every game above.
it("answers every kind of decision, on and off turn", () => {
  expect([...answered].sort()).toEqual(
    expect.arrayContaining([
      "turn:discover",
      "turn:move",
      "turn:action",
      "turn:trade",
      "turn:drop",
      "turn:pickup",
      "turn:end",
      "rotation",
      "place-tile",
      "trade-offer",
      "split-damage",
      "damage-kind",
      "choose-one",
      "roll-before",
      "roll-after",
      "off-turn:roll-before",
      "off-turn:split-damage",
      "off-turn:choose-one",
    ]),
  );
});
