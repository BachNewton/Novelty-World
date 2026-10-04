import { describe, expect, it } from "vitest";
import { NO_HAUNT_ENGINE, simulate, type SimulationResult } from "./simulation";
import { ENGINE } from "./game";
import { ALL_TOY_ENGINE } from "./test/toy-haunt";

// Whole games over many seeds, a random but legal policy on every seat (see
// simulation.ts for what is checked at every write). A failure names its
// seed, which replays the same game: simulate("s123").

/** A long game takes a few seconds; one that reaches a built haunt and
 *  plays it out, with every choice dry-run at every decision, can take a
 *  minute or more. */
const GAME_TIMEOUT = 180_000;

const seeds = (count: number) =>
  Array.from({ length: count }, (_, i) => `s${i}`);

const answered = new Set<string>();
const played = (result: SimulationResult) => {
  for (const kind of Object.keys(result.kinds)) answered.add(kind);
  return result;
};

// A haunt that is built is played out to its end; any other stops the game.
describe("random play to the haunt, or until the house is full", () => {
  it.each(seeds(400))(
    "seed %s",
    (seed) => {
      expect(["haunt", "finished", "house-full"]).toContain(
        played(simulate(seed)).ending,
      );
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

// Haunt 13 started at once, by a revealer the seed picks, and played to its
// end: the traitor's top-up, the monster turns, escapes, unleashing and the
// heroes' wake rolls, under the choices-match-legality check at every
// decision.
describe("random play through haunt 13 to its end", () => {
  it.each(seeds(40).map((s) => `h13-${s}`))(
    "seed %s",
    (seed) => {
      expect(played(simulate(seed, ENGINE, undefined, { haunt: 13 })).ending).toBe(
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
        played(simulate(seed, ALL_TOY_ENGINE)).ending,
      );
    },
    GAME_TIMEOUT,
  );
});

// The sweep is only as good as what it reaches. The turn's attack and the
// monster turn come with the toy haunt; the choice of weapon and of
// stealing need cards held at the right moment, so they are left to
// combat's tests.
// Tests in a file run in order, so this one sees every game above.
it("answers every kind of decision, on and off turn", () => {
  expect([...answered].sort()).toEqual(
    expect.arrayContaining([
      "turn:discover",
      "turn:move",
      "turn:action",
      "turn:attack",
      "turn:trade",
      "turn:drop",
      "turn:pickup",
      "turn:end",
      "turn:activate",
      "turn:done",
      "replace-figure",
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
