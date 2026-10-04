import { describe, expect, it } from "vitest";
import { traitValue } from "../../engine/explorers";
import { ENGINE } from "../../game";
import {
  choose,
  eventTypes,
  offered,
  pendingDecision,
  testGame,
} from "../../testing";
import type { GameState } from "../../types";

// Each card's tests come from its content/ entry, not from its implementation.

const value = (
  state: GameState,
  trait: "speed" | "might" | "sanity" | "knowledge",
  seat = 0,
) => traitValue(ENGINE.catalog, state, seat, trait);

/** Zoe explores north from the Entrance Hall into the Ballroom, which has four doors and an event symbol. */
function drawEvent(
  event: string,
  setUp: (state: GameState) => void = () => undefined,
): GameState {
  const state = testGame({ stack: ["ballroom"], decks: { event: [event] } });
  setUp(state);
  return choose(state, "Explore through the north door");
}

describe("Angry Being (cards/events.md)", () => {
  it("makes a Speed roll and applies the row of the table it lands on", () => {
    for (const seed of ["1", "2", "3", "4", "5", "6"]) {
      let state = testGame({
        seed,
        stack: ["ballroom"],
        decks: { event: ["angry-being"] },
      });
      const speed = value(state, "speed");
      state = choose(state, "Explore through the north door");
      const rolled = state.lastEvents.find((e) => e.type === "rolled");
      const result = (rolled?.data as { result: number }).result;
      expect((rolled?.data as { dice: number[] }).dice).toHaveLength(speed);
      if (result >= 5) {
        // 5+: gain 1 Speed.
        expect(value(state, "speed")).toBeGreaterThanOrEqual(speed);
        expect(eventTypes(state)).toContain("trait-changed");
      } else {
        // 2-4: 1 die of mental damage; 0-1: also 1 die of physical. Either way dice are rolled for damage.
        const damageRolls =
          state.lastEvents.filter((e) => e.type === "rolled").length - 1;
        expect(damageRolls).toBeGreaterThanOrEqual(1);
      }
      // Damage waits for the player to split it; the card is discarded once its effect is done.
      while (
        state.pending?.type === "decision" &&
        pendingDecision(state).kind === "split-damage"
      ) {
        state = choose(state, "Take");
      }
      expect(state.decks.event.discard).toContain("angry-being");
    }
  });
});

describe("Adrenaline Shot (cards/items.md)", () => {
  it("adds 4 to a trait roll when used, and is discarded after use", () => {
    let state = drawEvent("angry-being", (s) =>
      s.explorers[0].cards.push("adrenaline-shot"),
    );
    expect(pendingDecision(state).kind).toBe("roll-before");
    expect(offered(state).map((c) => c.label)).toEqual([
      "Make the Speed roll (4 dice)",
      "Use Adrenaline Shot",
    ]);
    state = choose(state, "Use Adrenaline Shot");
    const rolled = state.lastEvents.find((e) => e.type === "rolled")?.data as {
      bonus: number;
      result: number;
      dice: number[];
    };
    expect(rolled.bonus).toBe(4);
    expect(rolled.result).toBe(rolled.dice.reduce((a, b) => a + b, 0) + 4);
    expect(state.explorers[0].cards).not.toContain("adrenaline-shot");
    expect(state.decks.item.discard).toContain("adrenaline-shot");
  });
});

describe("Amulet of the Ages (cards/items.md)", () => {
  it("gains 1 in every trait when you get it and loses 3 in every trait when you lose it", () => {
    // Zoe's Speed track is 4 4 4 [4] 5 6 8 8: one space up is 5, and back three spaces from there is 4.
    let state = testGame({
      stack: ["bloody-room"],
      decks: { item: ["amulet-of-the-ages"] },
    });
    state = choose(state, "Explore through the north door");
    expect(value(state, "speed")).toBe(5);
    state = choose(state, "Drop the Amulet of the Ages");
    expect(state.explorers[0].clips.speed).toBe(1);
  });

  it("takes a loss from the spaces it pushed past the maximum first (rules p. 11)", () => {
    let state = testGame({
      stack: ["bloody-room"],
      decks: { item: ["amulet-of-the-ages"] },
    });
    state.explorers[0].clips.speed = 7;
    state = choose(state, "Explore through the north door");
    expect(state.explorers[0].clips.speed).toBe(7);
    expect(state.explorers[0].overTop).toContainEqual({
      card: "amulet-of-the-ages",
      trait: "speed",
      spaces: 1,
    });
    state = choose(state, "Drop the Amulet of the Ages");
    // 3 spaces lost: the 1 noted space first, then 2 real ones.
    expect(state.explorers[0].clips.speed).toBe(5);
  });
});

describe("Book (cards/omens.md)", () => {
  it("gains 2 Knowledge when you get it and loses 2 when you lose it", () => {
    let state = testGame({
      stack: ["abandoned-room"],
      decks: { omen: ["book"] },
    });
    const before = state.explorers[0].clips.knowledge;
    state = choose(state, "Explore through the north door");
    expect(state.explorers[0].clips.knowledge).toBe(before + 2);
    state = choose(state, "Drop the Book");
    expect(state.explorers[0].clips.knowledge).toBe(before);
  });
});

describe("Larder (rooms.md)", () => {
  function inTheLarder(): GameState {
    const state = testGame();
    state.board.tiles.push({
      tile: "larder",
      floor: "basement",
      x: 0,
      y: -1,
      rotation: 0,
    });
    state.explorers[0].room = "larder";
    return state;
  }

  it("gains 1 Might for ending a turn there, once per game for each explorer", () => {
    let state = inTheLarder();
    const might = state.explorers[0].clips.might;
    state = choose(state, "End your turn");
    expect(state.explorers[0].clips.might).toBe(might + 1);
    expect(state.tokens).toContainEqual({
      token: "explorer-yellow",
      room: "larder",
    });
    // Round the table back to Zoe, still in the Larder.
    state = choose(state, "End your turn");
    state = choose(state, "End your turn");
    state = choose(state, "End your turn");
    expect(state.explorers[0].clips.might).toBe(might + 1);
  });
});
