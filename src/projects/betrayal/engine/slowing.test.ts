import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { at, choose, eventTypes, inHaunt, offered, testGame } from "../testing";
import type { GameState } from "../types";
import { describeEvent } from "./describe";

// Moving past opponents (rules p. 17): after the haunt starts, leaving a
// room costs 1 extra space for each opponent in it, though a figure can
// always move at least 1 space a turn, and a stunned monster slows no one.

const ZOE = "zoe-ingstrom";

const moved = (state: GameState) => state.turn?.moved[ZOE] ?? 0;
const canMove = (state: GameState) =>
  offered(state).some((c) => c.label.startsWith("Move to"));

describe("leaving a room with opponents in it", () => {
  it("costs nothing extra before the haunt", () => {
    const state = choose(testGame(), "Move to the Foyer");
    expect(moved(state)).toBe(1);
    expect(eventTypes(state)).not.toContain("slowed");
  });

  it("costs 1 extra space per opponent, and allies don't count", () => {
    // Everyone starts in the Entrance Hall: Ox is the traitor, Father
    // Rhinehardt a fellow hero.
    const state = choose(inHaunt(testGame(), 1), "Move to the Foyer");
    expect(moved(state)).toBe(2);
    const slowed = state.lastEvents.find((e) => e.type === "slowed");
    if (!slowed) throw new Error("No slowed event");
    expect(describeEvent(ENGINE, state, slowed)).toBe(
      "Zoe Ingstrom spends 1 more space of movement to get past opponents in the Entrance Hall.",
    );
    // No opponent in the Foyer, so the next move costs 1.
    const on = choose(state, "Move to the Grand Staircase");
    expect(moved(on)).toBe(3);
  });

  it("counts every opponent there", () => {
    const state = inHaunt(testGame(), 1);
    state.seats[2] = { ...state.seats[2], side: "traitor" };
    expect(moved(choose(state, "Move to the Foyer"))).toBe(3);
  });

  it("always allows 1 space a turn, however slow", () => {
    // The Lights Out holds Zoe to 1 space; Ox in the room makes leaving cost
    // 2. (The Axe keeps the turn from being forced to end once she has moved.)
    const state = inHaunt(
      testGame({ explorers: [{ seat: 0, cards: ["lights-out", "axe"] }] }),
      1,
    );
    expect(canMove(state)).toBe(true);
    const after = choose(state, "Move to the Foyer");
    expect(at(after, 0).room).toBe("foyer");
    expect(canMove(after)).toBe(false);
  });

  it("isn't slowed by a stunned opponent", () => {
    const state = inHaunt(testGame(), 1);
    state.figures["ox-bellows"].stunned = true;
    expect(moved(choose(state, "Move to the Foyer"))).toBe(1);
  });
});
