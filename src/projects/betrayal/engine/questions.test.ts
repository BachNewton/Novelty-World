import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { pendingDecision, testGame } from "../testing";
import type { RuleRef } from "../types";
import { damage } from "./effects";
import { controllerOf, onTurn } from "./questions";
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
            change: { transform: () => 2 },
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
