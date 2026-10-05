import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { pendingDecision, testGame } from "../testing";
import type { RuleRef } from "../types";
import { damage } from "./effects";
import { figureName } from "./figures";
import {
  askNumber,
  askStructured,
  controllerOf,
  hasTrait,
  onTurn,
  traitValue,
} from "./questions";
import { start, type Engine } from "./step-loop";

// Who decides for a figure is the controller question, not a stored seat:
// its base answer is the owner, and a rule source can change it, as
// possession and the Ring will.

const ZOE = "zoe-ingstrom";
const RULE: RuleRef = { source: "rulebook", page: 13 };

/** The real engine, with a card that hands its holder to seat 2. */
const handedOver: Engine = {
  ...ENGINE,
  behaviours: {
    ...ENGINE.behaviours,
    cards: {
      ...ENGINE.behaviours.cards,
      bell: {
        modifiers: [
          {
            question: "controller",
            when: (_state, { figure }, source) => figure === source.holder,
            change: { replace: () => 2 },
          },
        ],
      },
    },
  },
};

describe("the controller question", () => {
  it("answers with the seat that owns the figure", () => {
    const state = testGame();
    expect(controllerOf(ENGINE, state, ZOE)).toBe(0);
    expect(onTurn(ENGINE, state, ZOE)).toBe(true);
  });

  it("sends a figure's choices to whichever seat a rule says controls it", () => {
    const state = testGame({
      engine: handedOver,
      explorers: [{ seat: 0, cards: ["bell"] }],
    });
    expect(controllerOf(handedOver, state, ZOE)).toBe(2);
    expect(onTurn(handedOver, state, ZOE)).toBe(false);
    const hurt = start(handedOver, { ...state, pending: null }, [
      damage(ZOE, "physical", { points: 2 }, RULE),
    ]);
    const split = pendingDecision(hurt);
    expect(split.kind).toBe("split-damage");
    expect(split.seats).toEqual([2]);
  });
});

// A figure's trait value is a question too: its base answer reads the
// figure's definition (clips on tracks, or fixed values), so a rule that ties
// a value to something else is a modifier, and every roll and allowance that
// reads the trait follows it.

/** The real engine, with a card that sets its holder's Speed to 2. */
const slowed: Engine = {
  ...ENGINE,
  behaviours: {
    ...ENGINE.behaviours,
    cards: {
      ...ENGINE.behaviours.cards,
      bell: {
        modifiers: [
          {
            question: "traitValue",
            when: (_state, { figure, trait }, source) =>
              figure === source.holder && trait === "speed",
            change: { set: 2 },
          },
        ],
      },
    },
  },
};

/** The real catalogue, with a monster of fixed traits and no Sanity. */
const withMonster: Engine = {
  ...ENGINE,
  catalog: {
    ...ENGINE.catalog,
    figures: {
      ...ENGINE.catalog.figures,
      brute: {
        id: "brute",
        name: "Brute",
        kind: "monster",
        traits: { kind: "fixed", values: { speed: 3, might: 6 } },
        token: null,
        explores: false,
        carries: false,
      },
    },
  },
};

describe("the trait value question", () => {
  it("reads an explorer's value off its track", () => {
    const state = testGame({ explorers: [{ seat: 0, clips: { speed: 7 } }] });
    expect(traitValue(ENGINE, state, ZOE, "speed")).toBe(
      ENGINE.catalog.characters[ZOE].tracks.speed[7],
    );
  });

  it("follows a modifier, and so does everything that reads the trait", () => {
    const state = testGame({ engine: slowed, explorers: [{ seat: 0, cards: ["bell"] }] });
    expect(traitValue(slowed, state, ZOE, "speed")).toBe(2);
    expect(askNumber(slowed, state, "movement", { figure: ZOE })).toBe(2);
  });

  it("reads a figure with fixed traits from its definition, by the same lookup", () => {
    const state = testGame({ engine: withMonster });
    state.figures.brute = {
      id: "brute",
      kind: "monster",
      definition: "brute",
      owner: null,
      place: { room: "foyer", side: null },
      traits: { kind: "fixed" },
      cards: [],
      statuses: [],
      stunned: false,
      alive: true,
    };
    expect(figureName(withMonster.catalog, state, "brute")).toBe("Brute");
    expect(traitValue(withMonster, state, "brute", "might")).toBe(6);
    expect(hasTrait(withMonster, state, "brute", "sanity")).toBe(false);
    expect(() => traitValue(withMonster, state, "brute", "sanity")).toThrow(
      "brute has no sanity",
    );
  });
});

// Several modifiers in one layer apply in an order that doesn't depend on
// play history (by source kind, then id), and a structured answer may be
// replaced by at most one of them (design/engine.md, section 5).

/** The real engine, with the Bell and the Angel Feather each ruling who
 *  controls their holder: the Bell hands it to seat 2, and the Feather
 *  either hands it to seat 1 too or turns a seat-2 answer into seat 1. */
const ruling = (feather: "replace" | "adjust"): Engine => ({
  ...ENGINE,
  behaviours: {
    ...ENGINE.behaviours,
    cards: {
      ...ENGINE.behaviours.cards,
      bell: {
        modifiers: [
          {
            question: "controller",
            when: (_state, { figure }, source) => figure === source.holder,
            change: { replace: () => 2 },
          },
        ],
      },
      "angel-feather": {
        modifiers: [
          {
            question: "controller",
            when: (_state, { figure }, source) => figure === source.holder,
            change:
              feather === "replace"
                ? { replace: () => 1 }
                : { adjust: (_state, _subject, seat) => (seat === 2 ? 1 : seat) },
          },
        ],
      },
    },
  },
});

describe("several modifiers in one layer", () => {
  it("throws when two of them replace a structured answer", () => {
    const engine = ruling("replace");
    const state = testGame({ engine, explorers: [{ seat: 0, cards: ["bell", "angel-feather"] }] });
    expect(() => controllerOf(engine, state, ZOE)).toThrow(
      "Conflicting replacements of controller in the card layer",
    );
  });

  it("applies the one replacement first, then the adjustments, whatever order they came in", () => {
    const engine = ruling("adjust");
    for (const cards of [["bell", "angel-feather"], ["angel-feather", "bell"]]) {
      const state = testGame({ engine, explorers: [{ seat: 0, cards }] });
      expect(controllerOf(engine, state, ZOE)).toBe(1);
    }
  });

  it("adjust in source order, not the order the cards were picked up", () => {
    const modes = (cards: string[]) =>
      askStructured(ENGINE, testGame({ explorers: [{ seat: 0, cards }] }), "attackModes", {
        attacker: ZOE,
        defender: "ox-bellows",
      });
    expect(modes(["revolver", "axe"])).toEqual(modes(["axe", "revolver"]));
    expect(modes(["revolver", "axe"]).map((m) => m.card)).toEqual([null, "axe", "revolver"]);
  });
});
