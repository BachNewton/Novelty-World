import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { eventTypes, explorer, inHaunt, testGame } from "../testing";
import type { GameState, RuleRef, Step } from "../types";
import { describeEvent } from "./describe";
import { damage, gain, relocate } from "./effects";
import { explorersFrom } from "./figures";
import { start, type Engine } from "./step-loop";

// Death (rules pp. 5, 16, 19): before the haunt a trait stops at its lowest
// value; from the haunt on, a trait at the skull kills, unless a rule says
// what the skull means instead (the lethalOutcome question).

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const FATHER = "father-rhinehardt";
const BELL: RuleRef = { source: "card", card: "bell" };
const ATTACK: RuleRef = { source: "rulebook", page: 13 };

/** Runs effects on a game with nothing pending. */
function run(state: GameState, steps: Step[], engine: Engine = ENGINE) {
  return start(engine, { ...state, pending: null }, steps);
}

/** Zoe at her lowest Might and Speed, in the Foyer, holding the cards
 *  given; Zoe is the traitor in the haunt. */
function weakZoe(cards: string[] = []): GameState {
  return inHaunt(
    testGame({
      explorers: [
        { seat: 0, room: "foyer", clips: { might: 0, speed: 0 }, cards },
      ],
    }),
    0,
  );
}

const lines = (state: GameState) =>
  state.lastEvents
    .map((e) => describeEvent(ENGINE, state, e))
    .filter((line) => line !== null);

describe("a trait at the skull", () => {
  it("before the haunt, stops at its lowest value: no one dies", () => {
    const state = testGame({ explorers: [{ seat: 0, clips: { might: 0 } }] });
    const after = run(state, [gain(ZOE, "might", -3, BELL)]);
    expect(after.figures[ZOE].alive).toBe(true);
    expect(explorer(after, 0).traits.clips.might).toBe(0);
    expect(after.memory.deaths).toEqual([]);
  });

  it("after the haunt, kills: the figure leaves the board and the death is remembered with its cause", () => {
    const after = run(weakZoe(), [gain(ZOE, "might", -1, BELL)]);
    const zoe = after.figures[ZOE];
    expect(zoe.alive).toBe(false);
    expect(zoe.place).toBeNull();
    expect(after.memory.deaths).toEqual([
      { figure: ZOE, trait: "might", cause: BELL, killer: null, room: "foyer" },
    ]);
    expect(lines(after)).toContain(
      "Zoe Ingstrom dies in the Foyer as Might reaches the skull (Bell).",
    );
  });

  it("from an attack, records the winner as the killer, and every split that kills is one choice", () => {
    const after = run(weakZoe(), [damage(ZOE, "physical", { points: 2 }, ATTACK, OX)]);
    expect(eventTypes(after)).toContain("forced");
    expect(after.memory.deaths).toEqual([
      expect.objectContaining({ figure: ZOE, killer: OX, cause: ATTACK }),
    ]);
    expect(lines(after)).toContain(
      "Zoe Ingstrom dies in the Foyer as Might reaches the skull, killed by Ox Bellows.",
    );
  });

  it("kills once, however many traits reach it", () => {
    const after = run(weakZoe(), [
      gain(ZOE, "might", -1, BELL),
      gain(ZOE, "speed", -1, BELL),
    ]);
    expect(after.memory.deaths).toHaveLength(1);
    expect(eventTypes(after).filter((t) => t === "died")).toHaveLength(1);
  });

  it("ends the dead explorer's turn, and what was still to happen to them lapses", () => {
    const state = weakZoe();
    expect(state.turn?.seat).toBe(0);
    const after = run(state, [
      gain(ZOE, "might", -1, BELL),
      damage(ZOE, "mental", { dice: 2 }, BELL),
      gain(ZOE, "sanity", 1, BELL),
    ]);
    expect(after.turn?.over).toBe(true);
    expect(eventTypes(after)).toContain("turn-cut-short");
    expect(eventTypes(after)).not.toContain("rolled");
    expect(eventTypes(after).filter((t) => t === "trait-changed")).toHaveLength(1);
    const cut = after.lastEvents.find((e) => e.type === "turn-cut-short");
    expect(cut?.rule).toEqual({ source: "rulebook", page: 16, ruling: "dead-seats-turns" });
  });

  it("leaves the dead out of every \"each explorer\" rule", () => {
    const after = run(weakZoe(), [gain(ZOE, "might", -1, BELL)]);
    expect(explorersFrom(after, OX)).toEqual([OX, FATHER]);
  });

  it("means what a rule says it means instead", () => {
    const clamped: Engine = {
      ...ENGINE,
      behaviours: {
        ...ENGINE.behaviours,
        cards: {
          ...ENGINE.behaviours.cards,
          bell: {
            modifiers: [
              {
                question: "lethalOutcome",
                when: (_state, { figure }, source) => figure === source.holder,
                change: { transform: () => ({ kind: "clamp" }) },
              },
            ],
          },
        },
      },
    };
    const state = inHaunt(
      testGame({
        engine: clamped,
        explorers: [{ seat: 0, clips: { might: 0 }, cards: ["bell"] }],
      }),
      0,
    );
    const after = run(state, [gain(ZOE, "might", -2, BELL)], clamped);
    expect(after.figures[ZOE].alive).toBe(true);
    expect(explorer(after, 0).traits.clips.might).toBe(0);
  });
});

describe("a dead explorer's things (p. 19)", () => {
  it("drop: items and omens that work as items onto the room's pile, companions set aside in the room", () => {
    // Gaining the Dog raised Zoe's Might a space, so it takes 2 to reach the skull.
    const after = run(weakZoe(["axe", "book", "dog", "bite"]), [
      gain(ZOE, "might", -2, BELL),
    ]);
    expect(after.piles.foyer).toEqual(["axe", "book"]);
    expect(after.aside).toEqual([{ card: "dog", room: "foyer" }]);
    // The Bite isn't an item: it stays with the body and does nothing more.
    expect(after.figures[ZOE].cards).toEqual(["bite"]);
    expect(after.tokens.some((t) => t.token === "dog")).toBe(false);
    const omen = after.lastEvents.find(
      (e) => e.type === "card-lost" && (e.data as { card: string }).card === "book",
    );
    expect(omen?.rule).toEqual({
      source: "rulebook",
      page: 19,
      ruling: "dead-explorers-omens",
    });
    expect(lines(after)).toContain(
      "Zoe Ingstrom's Dog stays in the Foyer, for the next explorer to come in.",
    );
  });

  it("leave kept events with the body, doing nothing more", () => {
    const state = weakZoe(["debris"]);
    const after = run(state, [gain(ZOE, "might", -1, BELL)]);
    expect(after.figures[ZOE].cards).toEqual(["debris"]);
  });

  it("give a waiting companion to the next living explorer to come into the room", () => {
    const dead = run(weakZoe(["girl"]), [gain(ZOE, "might", -1, BELL)]);
    const sanity = explorer(dead, 2).traits.clips.sanity;
    const after = run(dead, [relocate(FATHER, "foyer", BELL)]);
    expect(after.aside).toEqual([]);
    expect(after.figures[FATHER].cards).toContain("girl");
    // Gaining the Girl gains its traits, as gaining it any way does.
    expect(explorer(after, 2).traits.clips.sanity).toBe(sanity + 1);
    expect(lines(after)).toContain(
      "Father Rhinehardt takes custody of the Girl, left where its explorer died.",
    );
  });
});
