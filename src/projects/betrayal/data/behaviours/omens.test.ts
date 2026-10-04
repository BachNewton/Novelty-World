import { describe, expect, it } from "vitest";
import { attack } from "../../engine/combat";
import { damage, discardCard } from "../../engine/effects";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import { choose, offered, pendingDecision, testGame } from "../../testing";
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

describe("Mask (cards/omens.md)", () => {
  /** Zoe, mid-track on every trait, holds the Mask and the Angel Feather, which names the Mask's roll. */
  function masked(): GameState {
    const state = testGame();
    state.explorers[0].clips = { speed: 3, might: 3, sanity: 3, knowledge: 3 };
    state.explorers[0].cards.push("mask", "angel-feather");
    return state;
  }
  const useWith = (state: GameState, result: number) =>
    choose(
      choose(state, "Use the Mask"),
      `Use Angel Feather: the result is ${result}`,
    );

  it("on a Sanity roll of 4+, you may put it on: gain 2 Knowledge and lose 2 Sanity", () => {
    const rolled = useWith(masked(), 4);
    expect(labels(rolled)).toEqual(["Put on the Mask", "Leave the Mask off"]);
    const worn = choose(rolled, "Put on the Mask");
    expect(worn.explorers[0].clips).toMatchObject({ sanity: 1, knowledge: 5 });
    // Once during your turn.
    expect(labels(worn).some((l) => l.startsWith("Use the Mask"))).toBe(false);
  });

  it("on 0-3, you can't use it this turn", () => {
    const failed = useWith(masked(), 3);
    expect(failed.explorers[0].clips).toMatchObject({
      sanity: 3,
      knowledge: 3,
    });
    expect(labels(failed).some((l) => l.startsWith("Use the Mask"))).toBe(
      false,
    );
  });

  it("takes it off on a later turn: gain 2 Sanity and lose 2 Knowledge", () => {
    let state = choose(useWith(masked(), 5), "Put on the Mask");
    for (let i = 0; i < 3; i++) state = choose(state, "End your turn");
    state.explorers[0].cards.push("angel-feather");
    const rolled = useWith(state, 6);
    expect(labels(rolled)).toEqual(["Take off the Mask", "Keep the Mask on"]);
    const off = choose(rolled, "Take off the Mask");
    expect(off.explorers[0].clips).toMatchObject({ sanity: 3, knowledge: 3 });
  });

  it("losing it while you wear it takes it off", () => {
    const worn = choose(useWith(masked(), 4), "Put on the Mask");
    const lost = lose(worn, "mask");
    expect(lost.explorers[0].clips).toMatchObject({ sanity: 3, knowledge: 3 });
    expect(lost.cardMarks.mask).toBeUndefined();
  });
});

describe("Skull (cards/omens.md)", () => {
  const RULE = { source: "card", card: "angry-being" } as const;

  /** Zoe holds these cards and takes damage. */
  function damaged(
    cards: string[],
    kind: "physical" | "mental",
    points: number,
  ): GameState {
    const state = testGame();
    state.explorers[0].cards.push(...cards);
    return start(ENGINE, { ...state, pending: null }, [
      damage(0, kind, { points }, RULE),
    ]);
  }

  it("lets you take mental damage as physical damage instead", () => {
    let state = damaged(["skull"], "mental", 2);
    expect(labels(state)).toEqual([
      "Take 2 mental damage",
      "Use Skull: take 2 physical damage instead",
    ]);
    state = choose(state, "Use Skull");
    expect(pendingDecision(state).params).toMatchObject({
      damage: "physical",
      amount: 2,
    });
    expect(labels(state)[0]).toBe("Take 2 Might and 0 Speed");
  });

  it("may be passed up: the damage stays mental", () => {
    const state = choose(damaged(["skull"], "mental", 2), "Take 2 mental");
    expect(pendingDecision(state).params).toMatchObject({ damage: "mental" });
  });

  it("offers nothing for physical damage", () => {
    const state = damaged(["skull"], "physical", 1);
    expect(pendingDecision(state).kind).toBe("split-damage");
  });

  it("makes the damage physical, so the Armor takes 1 off it (project ruling)", () => {
    const state = choose(damaged(["skull", "armor"], "mental", 2), "Use Skull");
    expect(pendingDecision(state).params).toMatchObject({
      damage: "physical",
      amount: 1,
    });
  });
});

/** Starts Zoe's attack on Ox in the middle of her turn. */
function attackOx(state: GameState): GameState {
  return start(ENGINE, { ...state, pending: null }, [
    attack({ kind: "explorer", seat: 0 }, 1, { source: "rulebook", page: 13 }),
  ]);
}

function rollsMade(state: GameState): { seat: number; dice: number }[] {
  return state.lastEvents
    .filter((e) => e.type === "rolled")
    .map((e) => {
      const d = e.data as { seat: number; dice: number[] };
      return { seat: d.seat, dice: d.dice.length };
    });
}

describe("Bite (cards/omens.md)", () => {
  it("when drawn, the player on your right makes a Might 4 attack against you, and you defend with your Might", () => {
    const state = drawOmen("bite");
    // Father Rhinehardt sits on Zoe's right; Zoe's Might is 3.
    expect(rollsMade(state)).toEqual([
      { seat: 2, dice: 4 },
      { seat: 0, dice: 3 },
    ]);
    expect(state.explorers[0].cards).toContain("bite");
  });

  it("can't be dropped, traded or stolen", () => {
    expect(ENGINE.catalog.cards.bite.transfer).toEqual({
      trade: false,
      drop: false,
      steal: false,
    });
  });
});

describe("Ring (cards/omens.md)", () => {
  it("attacks with Sanity instead of Might; the opponent defends with Sanity, and the damage is mental", () => {
    const state = testGame();
    state.explorers[0].cards.push("ring");
    let next = attackOx(state);
    expect(labels(next)).toEqual([
      "Attack with Might",
      "Attack with Sanity, using the Ring",
    ]);
    next = choose(next, "using the Ring");
    // Zoe's Sanity is 5, Ox's 3.
    expect(rollsMade(next)).toEqual([
      { seat: 0, dice: 5 },
      { seat: 1, dice: 3 },
    ]);
    const outcome = next.lastEvents.find((e) => e.type === "attack-outcome")
      ?.data as { damage: { kind: string } | null };
    if (outcome.damage) expect(outcome.damage.kind).toBe("mental");
  });
});

describe("Spear (cards/omens.md)", () => {
  it("rolls 2 extra dice on a Might attack made with it", () => {
    const state = testGame();
    state.explorers[0].cards.push("spear");
    const next = choose(attackOx(state), "using the Spear");
    expect(rollsMade(next)).toEqual([
      { seat: 0, dice: 5 },
      { seat: 1, dice: 5 },
    ]);
  });
});
