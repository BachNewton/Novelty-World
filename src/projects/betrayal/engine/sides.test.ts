import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { inHaunt, testGame } from "../testing";
import type { GameState } from "../types";
import { controllerOf } from "./questions";
import { heroes, isOpponent, revealedAs, sideOf } from "./sides";
import { statusData } from "./sources";
import type { Engine } from "./step-loop";

// Sides belong to seats; a figure's side and who its opponents are are
// questions derived from them, never stored.

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const FATHER = "father-rhinehardt";

describe("sides", () => {
  it("are no one's before the haunt, so no one is anyone's opponent or a hero", () => {
    const state = testGame();
    expect(sideOf(ENGINE, state, ZOE)).toBeNull();
    expect(isOpponent(ENGINE, state, ZOE, OX)).toBe(false);
    expect(heroes(ENGINE, state)).toEqual([]);
  });

  it("make the traitor and the heroes each other's opponents, and heroes allies", () => {
    const state = inHaunt(testGame(), 0);
    expect(sideOf(ENGINE, state, ZOE)).toBe("traitor");
    expect(sideOf(ENGINE, state, OX)).toBe("heroes");
    expect(isOpponent(ENGINE, state, ZOE, OX)).toBe(true);
    expect(isOpponent(ENGINE, state, OX, ZOE)).toBe(true);
    expect(isOpponent(ENGINE, state, OX, FATHER)).toBe(false);
    expect(isOpponent(ENGINE, state, ZOE, ZOE)).toBe(false);
    expect(heroes(ENGINE, state).map((f) => f.id)).toEqual([OX, FATHER]);
  });

  it("follow a seat that changes side, everywhere at once", () => {
    const state = inHaunt(testGame(), 0);
    state.seats[1].side = "traitor";
    expect(isOpponent(ENGINE, state, ZOE, OX)).toBe(false);
    expect(isOpponent(ENGINE, state, OX, FATHER)).toBe(true);
    expect(heroes(ENGINE, state).map((f) => f.id)).toEqual([FATHER]);
  });

  it("leave a neutral seat no one's opponent", () => {
    const state = inHaunt(testGame(), 0);
    state.seats[2].side = "neutral";
    expect(isOpponent(ENGINE, state, ZOE, FATHER)).toBe(false);
    expect(isOpponent(ENGINE, state, FATHER, OX)).toBe(false);
  });

  it("count a dead hero out of the heroes in play", () => {
    const state = inHaunt(testGame(), 0);
    state.figures[OX].alive = false;
    state.figures[OX].place = null;
    expect(heroes(ENGINE, state).map((f) => f.id)).toEqual([FATHER]);
  });

  it("reveal a traitor only when everyone knows", () => {
    const state = inHaunt(testGame(), 0);
    expect(revealedAs(state, ZOE, "traitor")).toBe(true);
    expect(revealedAs(state, OX, "traitor")).toBe(false);
    state.seats[0].knownBy = [0];
    expect(revealedAs(state, ZOE, "traitor")).toBe(false);
  });
});

// A status is a rule source of its own, in the layer of the rule that put
// it on the figure, and it can carry data: here, the seat a controlled
// figure answers to.

/** The real engine, with a status that hands its bearer to a named seat. */
const withControl: Engine = {
  ...ENGINE,
  behaviours: {
    ...ENGINE.behaviours,
    statuses: {
      controlled: {
        modifiers: [
          {
            question: "controller",
            when: (_state, { figure }, source) => figure === source.holder,
            change: {
              transform: (_state, _subject, _answer, source) =>
                statusData<{ seat: number }>(source).seat,
            },
          },
          {
            question: "side",
            when: (_state, { figure }, source) => figure === source.holder,
            change: {
              transform: (state: GameState, _subject, _answer, source) =>
                state.seats[statusData<{ seat: number }>(source).seat].side,
            },
          },
        ],
      },
    },
  },
};

describe("a status", () => {
  it("changes the answers its behaviour modifies, reading its own data", () => {
    const state = inHaunt(testGame({ engine: withControl }), 0);
    state.figures[OX].statuses.push({
      id: "controlled",
      rule: { source: "haunt", haunt: 6, section: "Rules" },
      params: { seat: 0 },
    });
    expect(controllerOf(withControl, state, OX)).toBe(0);
    expect(sideOf(withControl, state, OX)).toBe("traitor");
    expect(isOpponent(withControl, state, OX, FATHER)).toBe(true);
    expect(controllerOf(withControl, state, FATHER)).toBe(2);
  });
});
