import { describe, expect, it } from "vitest";
import { discardCard } from "../../engine/effects";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import { choose, offered, testGame } from "../../testing";
import type { GameState, Trait } from "../../types";

// Each card's tests come from its content/cards/omens.md entry, not from its implementation.

/** Zoe explores north from the Entrance Hall into the Abandoned Room, which has an omen symbol. */
function drawOmen(omen: string): GameState {
  const state = testGame({
    stack: ["abandoned-room"],
    decks: { omen: [omen] },
  });
  return choose(state, "Explore through the north door");
}

function lose(state: GameState, omen: string): GameState {
  return start(ENGINE, { ...state, pending: null }, [discardCard(0, omen)]);
}

const labels = (state: GameState) => offered(state).map((c) => c.label);

describe.each<[string, string, Partial<Record<Trait, number>>]>([
  ["dog", "Dog", { might: 1, sanity: 1 }],
  ["girl", "Girl", { sanity: 1, knowledge: 1 }],
  ["holy-symbol", "Holy Symbol", { sanity: 2 }],
  ["madman", "Madman", { might: 2, sanity: -1 }],
])("%s (cards/omens.md)", (omen, name, changes) => {
  it(`changes traits when you get the ${name}, and reverses them when you lose it`, () => {
    const before = testGame().explorers[0].clips;
    const drawn = drawOmen(omen);
    for (const [trait, amount] of Object.entries(changes) as [
      Trait,
      number,
    ][]) {
      expect(drawn.explorers[0].clips[trait]).toBe(before[trait] + amount);
    }
    expect(lose(drawn, omen).explorers[0].clips).toEqual(before);
  });
});

describe("Companions can't be dropped (cards/omens.md)", () => {
  it.each(["dog", "girl", "madman"])("offers no drop for the %s", (omen) => {
    expect(labels(drawOmen(omen)).some((l) => l.startsWith("Drop"))).toBe(
      false,
    );
  });
});

describe("Madman (cards/omens.md)", () => {
  it("takes back only what it pushed past the Might maximum when lost (rules p. 11)", () => {
    let state = testGame({
      stack: ["abandoned-room"],
      decks: { omen: ["madman"] },
    });
    state.explorers[0].clips.might = 6;
    state = choose(state, "Explore through the north door");
    expect(state.explorers[0].clips.might).toBe(7);
    expect(lose(state, "madman").explorers[0].clips.might).toBe(6);
  });
});

describe("Spirit Board (cards/omens.md)", () => {
  function holding(): GameState {
    const state = testGame({ stack: ["ballroom", "kitchen"] });
    state.explorers[0].cards.push("spirit-board");
    return state;
  }

  it("lets you look at the top room tile before you move, once a turn", () => {
    let state = holding();
    state = choose(state, "Use the Spirit Board");
    expect(
      state.lastEvents.find((e) => e.type === "room-stack-seen")?.data,
    ).toEqual({ seat: 0, tile: "ballroom" });
    // The tile stays on top of the stack.
    expect(state.board.stack[0]).toBe("ballroom");
    expect(labels(state)).not.toContain(
      "Use the Spirit Board: look at the top room tile",
    );
  });

  it("isn't offered once you have moved", () => {
    let state = holding();
    state = choose(state, "Move to the Foyer");
    expect(labels(state)).not.toContain(
      "Use the Spirit Board: look at the top room tile",
    );
  });
});

describe("Crystal Ball (cards/omens.md)", () => {
  const LABEL = "Look into the Crystal Ball (Knowledge roll)";

  function holding(seed: string): GameState {
    const state = testGame({ seed });
    state.explorers[0].cards.push("crystal-ball");
    return state;
  }

  it("can't be used before the haunt is revealed", () => {
    expect(labels(holding("1"))).not.toContain(LABEL);
  });

  it("after the haunt, a Knowledge roll of 4+ stacks a chosen card on top of the item or event stack; less costs Sanity", () => {
    const seen = new Set<string>();
    for (const seed of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      let state = holding(seed);
      state.status = "haunt";
      const sanity = state.explorers[0].clips.sanity;
      state = choose(state, LABEL);
      const rolled = state.lastEvents.find((e) => e.type === "rolled");
      const result = (rolled?.data as { result: number }).result;
      if (result >= 4) {
        seen.add("search");
        expect(labels(state)).toEqual([
          "Search the item stack",
          "Search the event stack",
        ]);
        state = choose(state, "Search the item stack");
        const size = state.decks.item.draw.length;
        const last = state.decks.item.draw[size - 1];
        const options = offered(state);
        expect(options).toHaveLength(size);
        state = choose(state, options[options.length - 1].label);
        expect(state.decks.item.draw[0]).toBe(last);
        expect(state.decks.item.draw).toHaveLength(size);
        expect(state.explorers[0].clips.sanity).toBe(sanity);
      } else {
        seen.add(result === 0 ? "lose 2" : "lose 1");
        expect(state.explorers[0].clips.sanity).toBe(
          sanity - (result === 0 ? 2 : 1),
        );
      }
      expect(labels(state)).not.toContain(LABEL);
    }
    expect(seen.has("search")).toBe(true);
    expect(seen.has("lose 1")).toBe(true);
  });
});
