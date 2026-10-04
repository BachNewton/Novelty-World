import { describe, expect, it } from "vitest";
import { askNumber } from "../../engine/questions";
import { ENGINE } from "../../game";
import { choose, offered, pendingDecision, testGame } from "../../testing";
import type { CardType, GameEvent, GameState, Trait } from "../../types";

// Each card's tests come from its content/cards/events.md entry, not from its implementation.

type Rolled = {
  seat: number;
  spec: { kind: string; trait?: Trait; count?: number };
  dice: number[];
  result: number;
};

const rolls = (events: GameEvent[]): Rolled[] =>
  events.filter((e) => e.type === "rolled").map((e) => e.data as Rolled);

const SEEDS = Array.from({ length: 3000 }, (_, i) => `${i}`);

const clip = (state: GameState, trait: Trait, seat = 0) =>
  state.explorers[seat].clips[trait];

const labels = (state: GameState) => offered(state).map((c) => c.label);

interface Draw {
  seed?: string;
  setUp?: (state: GameState) => void;
  decks?: Partial<Record<CardType, string[]>>;
  stack?: string[];
}

/** Zoe (seat 0) explores north from the Entrance Hall into a room with an event symbol, the Ballroom unless
 *  stacked otherwise, and draws the event. Ox and Father Rhinehardt stay in the Entrance Hall. */
function drawEvent(event: string, options: Draw = {}): GameState {
  const state = testGame({
    seed: options.seed,
    stack: options.stack ?? ["ballroom"],
    decks: {
      ...options.decks,
      event: [event, ...(options.decks?.event ?? [])],
    },
  });
  options.setUp?.(state);
  return choose(state, "Explore through the north door");
}

/** The state after the first seed whose play passes. */
function firstSeed(
  play: (seed: string) => GameState,
  passes: (state: GameState) => boolean,
): GameState {
  for (const seed of SEEDS) {
    const state = play(seed);
    if (passes(state)) return state;
  }
  throw new Error("No seed passes");
}

/** The state after the first seed whose play makes a first roll in the range. */
function landing(
  min: number,
  max: number,
  play: (seed: string) => GameState,
): GameState {
  return firstSeed(play, (state) => {
    const result = rolls(state.lastEvents)[0]?.result;
    return result >= min && result <= max;
  });
}

/** Zoe also holds the Axe, which she could drop, so her turn never ends by itself. */
function holdingAxe(state: GameState): void {
  state.decks.item.draw = state.decks.item.draw.filter((c) => c !== "axe");
  state.explorers[0].cards.push("axe");
}

/** Splits every damage the first way offered until something else is pending; returns every event on the way. */
function settle(start: GameState): { state: GameState; events: GameEvent[] } {
  let state = start;
  const events = [...state.lastEvents];
  while (
    state.pending?.type === "decision" &&
    pendingDecision(state).kind === "split-damage"
  ) {
    state = choose(state, "Take");
    events.push(...state.lastEvents);
  }
  return { state, events };
}

/** Each sanity roll, with the dice count of the damage roll that follows it, if any. */
function sanityRollsAndDamage(
  events: GameEvent[],
): { seat: number; result: number; damageDice: number | null }[] {
  const result: { seat: number; result: number; damageDice: number | null }[] =
    [];
  for (const r of rolls(events)) {
    if (r.spec.kind === "trait")
      result.push({ seat: r.seat, result: r.result, damageDice: null });
    else result[result.length - 1].damageDice = r.spec.count ?? null;
  }
  return result;
}

function placeTile(
  state: GameState,
  tile: string,
  floor: "basement" | "ground" | "upper",
  x: number,
  y: number,
): void {
  state.board.tiles.push({ tile, floor, x, y, rotation: 0 });
}

function endTurns(start: GameState, count: number): GameState {
  let state = start;
  for (let i = 0; i < count; i++) state = choose(state, "End your turn");
  return state;
}

// Zoe starts with Speed 4, Might 3, Sanity 5 and Knowledge 3 (clips 3, 3, 2, 2).

describe("Bloody Vision (cards/events.md)", () => {
  const alone = (s: GameState) => {
    s.explorers[1].room = "upper-landing";
    s.explorers[2].room = "upper-landing";
  };
  const draw = (seed: string, setUp = alone) =>
    drawEvent("bloody-vision", { seed, setUp });

  it("gains 1 Sanity on 4+ and loses 1 on 2-3", () => {
    expect(clip(landing(4, 8, draw), "sanity")).toBe(3);
    expect(clip(landing(2, 3, draw), "sanity")).toBe(1);
  });

  it("does nothing on 0-1 when no explorer is in your room or an adjacent one", () => {
    const state = landing(0, 1, draw);
    expect(clip(state, "sanity")).toBe(2);
    expect(pendingDecision(state).kind).toBe("turn");
  });

  it("fails loudly on 0-1 with an explorer in reach, because the attack isn't built", () => {
    const seed = landing(0, 1, draw).seed;
    // The Ballroom shares a side with the Entrance Hall, where the others stand.
    expect(() => drawEvent("bloody-vision", { seed })).toThrow(/needs combat/);
  });
});

describe("Burning Man (cards/events.md)", () => {
  const draw = (seed: string) => drawEvent("burning-man", { seed });

  it("gains 1 Sanity on 4+", () => {
    expect(clip(landing(4, 8, draw), "sanity")).toBe(3);
  });

  it("puts you in the Entrance Hall on 2-3", () => {
    expect(landing(2, 3, draw).explorers[0].room).toBe("entrance-hall");
  });

  it("deals 1 die of physical damage, then 1 die of mental, on 0-1", () => {
    const { events } = settle(landing(0, 1, draw));
    expect(rolls(events).map((r) => r.spec)).toEqual([
      { kind: "trait", trait: "sanity" },
      { kind: "dice", count: 1 },
      { kind: "dice", count: 1 },
    ]);
    const damage = events
      .filter((e) => e.type === "damaged" || e.type === "damage-prevented")
      .map((e) => (e.data as { damage: string }).damage);
    expect(damage).toEqual(["physical", "mental"]);
  });
});

describe("Closet Door (cards/events.md)", () => {
  const decks = {
    event: ["image-in-the-mirror-take"],
    item: ["candle", "axe"],
  };
  const open = (seed: string) =>
    choose(drawEvent("closet-door", { seed, decks }), "Open the Closet");
  const drawn = (state: GameState) =>
    state.lastEvents
      .filter((e) => e.type === "card-drawn")
      .map((e) => (e.data as { card: string }).card);

  it("puts the Closet token in the room, and only an explorer there may open it", () => {
    const state = drawEvent("closet-door", { decks });
    expect(state.tokens).toContainEqual({ token: "closet", room: "ballroom" });
    expect(labels(state)).toContain("Open the Closet (roll 2 dice)");
    state.explorers[0].room = "entrance-hall";
    expect(labels(state).some((l) => l.includes("Closet"))).toBe(false);
  });

  it("rolls 2 dice, once during each explorer's turn", () => {
    const state = open("test-seed");
    expect(rolls(state.lastEvents)[0].dice).toHaveLength(2);
    expect(labels(state).some((l) => l.includes("Closet"))).toBe(false);
  });

  it("draws an item on 4", () => {
    const state = landing(4, 4, open);
    expect(drawn(state)).toEqual(["candle"]);
    expect(state.tokens).toContainEqual({ token: "closet", room: "ballroom" });
  });

  it("draws an event on 2-3", () => {
    const state = landing(2, 3, open);
    // The drawn event (Image in the Mirror) itself draws an item.
    expect(drawn(state)).toEqual(["image-in-the-mirror-take", "candle"]);
    expect(state.tokens).toContainEqual({ token: "closet", room: "ballroom" });
  });

  it("draws an event and removes the Closet on 0-1", () => {
    const state = landing(0, 1, open);
    expect(drawn(state)).toEqual(["image-in-the-mirror-take", "candle"]);
    expect(state.tokens.some((t) => t.token === "closet")).toBe(false);
  });
});

describe("Creepy Crawlies (cards/events.md)", () => {
  const draw = (seed: string) => drawEvent("creepy-crawlies", { seed });

  it("gains 1 Sanity on 5+, loses 1 on 1-4 and 2 on 0", () => {
    expect(clip(landing(5, 8, draw), "sanity")).toBe(3);
    expect(clip(landing(1, 4, draw), "sanity")).toBe(1);
    expect(clip(landing(0, 0, draw), "sanity")).toBe(0);
  });
});

describe("Debris (cards/events.md)", () => {
  it("gains 1 Speed on 3+, and fails loudly on 0-2 because burying isn't built", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 40)) {
      try {
        const state = drawEvent("debris", { seed });
        expect(rolls(state.lastEvents)[0].result).toBeGreaterThanOrEqual(3);
        expect(clip(state, "speed")).toBe(4);
        seen.add("gained");
      } catch (error) {
        expect(String(error)).toMatch(/Debris can't bury/);
        seen.add("buried");
      }
    }
    expect(seen).toEqual(new Set(["gained", "buried"]));
  });
});

describe("Disquieting Sounds (cards/events.md)", () => {
  const draw = (seed: string, omens: number) =>
    drawEvent("disquieting-sounds", {
      seed,
      setUp: (s) => (s.omensDrawn = omens),
    });

  it("rolls 6 dice and gains 1 Sanity when the total is at least the omens revealed", () => {
    const state = draw("test-seed", 0);
    expect(rolls(state.lastEvents)[0].dice).toHaveLength(6);
    expect(clip(state, "sanity")).toBe(3);
  });

  it("deals 1 die of mental damage when the total is below the omens revealed", () => {
    const result = rolls(draw("test-seed", 0).lastEvents)[0].result;
    expect(clip(draw("test-seed", result), "sanity")).toBe(3);
    const below = draw("test-seed", result + 1);
    expect(clip(below, "sanity")).toBe(2);
    expect(rolls(below.lastEvents)[1].spec).toEqual({ kind: "dice", count: 1 });
  });
});

describe("Drip . . . Drip . . . Drip . . . (cards/events.md)", () => {
  const pool = (state: GameState, seat: number, trait: Trait) =>
    askNumber(ENGINE, state, "dicePool", {
      seat,
      roll: {
        spec: { kind: "trait", trait },
        rule: { source: "card", card: "angry-being" },
      },
    });

  it("puts the Drip token in the room, and an explorer there rolls 1 fewer die on trait rolls", () => {
    const state = drawEvent("drip-drip-drip");
    expect(state.tokens).toContainEqual({ token: "drip", room: "ballroom" });
    expect(pool(state, 0, "speed")).toBe(3);
    // Ox is in the Entrance Hall.
    const ox = testGame();
    expect(pool(state, 1, "speed")).toBe(pool(ox, 1, "speed"));
  });

  it("leaves dice rolls that aren't trait rolls alone", () => {
    const state = drawEvent("drip-drip-drip");
    expect(
      askNumber(ENGINE, state, "dicePool", {
        seat: 0,
        roll: {
          spec: { kind: "dice", count: 2 },
          rule: { source: "card", card: "closet-door" },
        },
      }),
    ).toBe(2);
  });

  it("never takes a roll below 1 die", () => {
    const state = drawEvent("drip-drip-drip");
    state.explorers[0].clips.knowledge = 0; // Zoe's lowest Knowledge is 1.
    expect(pool(state, 0, "knowledge")).toBe(1);
  });
});

describe("Footsteps (cards/events.md)", () => {
  const draw = (seed: string, setUp?: (s: GameState) => void) =>
    drawEvent("footsteps", { seed, setUp });
  const inChapel = (seed: string, setUp?: (s: GameState) => void) =>
    drawEvent("footsteps", { seed, setUp, stack: ["chapel"] });

  it("rolls 1 die, and 1 more for an explorer in the Chapel", () => {
    expect(rolls(draw("test-seed").lastEvents)[0].dice).toHaveLength(1);
    const chapel = inChapel("test-seed");
    expect(chapel.explorers[0].room).toBe("chapel");
    expect(rolls(chapel.lastEvents)[0].dice).toHaveLength(2);
  });

  it("loses 1 Sanity on 2 and 1 Speed on 1", () => {
    expect(clip(landing(2, 2, draw), "sanity")).toBe(1);
    expect(clip(landing(1, 1, draw), "speed")).toBe(2);
  });

  it("has every explorer, starting with you, lose 1 from a trait of their choice on 0", () => {
    let state = landing(0, 0, draw);
    expect(labels(state)).toEqual([
      "Lose 1 Speed",
      "Lose 1 Might",
      "Lose 1 Sanity",
      "Lose 1 Knowledge",
    ]);
    const before = state.explorers.map((e) => ({ ...e.clips }));
    state = choose(state, "Lose 1 Might");
    state = choose(state, "Lose 1 Speed");
    state = choose(state, "Lose 1 Knowledge");
    expect(clip(state, "might", 0)).toBe(before[0].might - 1);
    expect(clip(state, "speed", 1)).toBe(before[1].speed - 1);
    expect(clip(state, "knowledge", 2)).toBe(before[2].knowledge - 1);
  });

  it("on 4, you and the nearest explorer each gain 1 Might, and you break a tie", () => {
    let state = landing(4, 4, inChapel);
    expect(clip(state, "might")).toBe(4);
    // Ox and Father Rhinehardt are both one room away.
    expect(labels(state)).toEqual([
      "Ox Bellows is the nearest explorer",
      "Father Rhinehardt is the nearest explorer",
    ]);
    const might = clip(state, "might", 1);
    state = choose(state, "Ox Bellows");
    expect(clip(state, "might", 1)).toBe(might + 1);
  });

  it("on 3, you gain 1 Might and the nearest explorer loses 1 Sanity", () => {
    const farOx = (s: GameState) => (s.explorers[1].room = "upper-landing");
    const sanity = clip(testGame(), "sanity", 2);
    const state = landing(3, 3, (seed) => inChapel(seed, farOx));
    expect(clip(state, "might")).toBe(4);
    expect(clip(state, "sanity", 2)).toBe(sanity - 1);
    expect(pendingDecision(state).kind).toBe("turn");
  });
});

describe("Funeral (cards/events.md)", () => {
  const draw = (seed: string, setUp?: (s: GameState) => void) =>
    drawEvent("funeral", { seed, setUp });

  it("gains 1 Sanity on 4+ and loses 1 on 2-3", () => {
    expect(clip(landing(4, 8, draw), "sanity")).toBe(3);
    expect(clip(landing(2, 3, draw), "sanity")).toBe(1);
  });

  it("loses 1 Sanity and 1 Might on 0-1, and stays put when neither the Graveyard nor the Crypt is discovered", () => {
    const state = landing(0, 1, draw);
    expect(clip(state, "sanity")).toBe(1);
    expect(clip(state, "might")).toBe(2);
    expect(state.explorers[0].room).toBe("ballroom");
  });

  it("puts you in the Graveyard on 0-1 when it is the one discovered", () => {
    const state = landing(0, 1, (seed) =>
      draw(seed, (s) => placeTile(s, "graveyard", "ground", 5, 5)),
    );
    expect(state.explorers[0].room).toBe("graveyard");
  });

  it("lets you choose between the Graveyard and the Crypt when both are discovered", () => {
    let state = landing(0, 1, (seed) =>
      draw(seed, (s) => {
        placeTile(s, "graveyard", "ground", 5, 5);
        placeTile(s, "crypt", "basement", 5, 5);
      }),
    );
    expect(labels(state)).toEqual(["Go to the Graveyard", "Go to the Crypt"]);
    state = choose(state, "Go to the Crypt");
    expect(state.explorers[0].room).toBe("crypt");
  });
});

describe("Grave Dirt (cards/events.md)", () => {
  const draw = (seed: string) =>
    drawEvent("grave-dirt", { seed, setUp: holdingAxe });
  const kept = () => landing(0, 3, draw);

  it("gains 1 Might on 4+", () => {
    const state = landing(4, 8, draw);
    expect(clip(state, "might")).toBe(4);
    expect(state.explorers[0].cards).not.toContain("grave-dirt");
  });

  it("is kept on 0-3, and deals 1 point of physical damage at the start of each of your turns", () => {
    let state = kept();
    expect(state.explorers[0].cards).toContain("grave-dirt");
    state = endTurns(state, 3);
    expect(pendingDecision(state).kind).toBe("split-damage");
    expect(labels(state)).toEqual([
      "Take 1 Might and 0 Speed",
      "Take 0 Might and 1 Speed",
    ]);
  });

  it("is discarded when you end your turn in one of its rooms", () => {
    let state = kept();
    placeTile(state, "larder", "basement", 0, -1);
    state.explorers[0].room = "larder";
    state = choose(state, "End your turn");
    expect(state.explorers[0].cards).not.toContain("grave-dirt");
    expect(state.decks.event.discard).toContain("grave-dirt");
  });

  it("stays when you end your turn elsewhere", () => {
    const state = choose(kept(), "End your turn");
    expect(state.explorers[0].cards).toContain("grave-dirt");
  });

  it("is discarded once when an item card raises your traits", () => {
    let state = kept();
    state.piles.ballroom = ["amulet-of-the-ages"];
    state = choose(state, "Pick up the Amulet of the Ages");
    expect(state.explorers[0].cards).not.toContain("grave-dirt");
    expect(
      state.decks.event.discard.filter((c) => c === "grave-dirt"),
    ).toHaveLength(1);
  });
});

describe("Hanged Men (cards/events.md)", () => {
  const draw = (seed: string) => drawEvent("hanged-men", { seed });
  const start = testGame().explorers[0].clips;

  it("rolls each of your four traits, losing 1 from each that rolls 0-1", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const state = draw(seed);
      const made = rolls(state.lastEvents);
      expect(made.map((r) => r.spec.trait)).toEqual([
        "speed",
        "might",
        "sanity",
        "knowledge",
      ]);
      for (const r of made) {
        const trait = r.spec.trait as Trait;
        expect(clip(state, trait)).toBe(start[trait] - (r.result <= 1 ? 1 : 0));
      }
    }
  });

  it("gains 1 in a trait of your choice when all four rolls are 2+", () => {
    const allPass = firstSeed(draw, (s) =>
      rolls(s.lastEvents).every((r) => r.result >= 2),
    );
    expect(labels(allPass)).toEqual([
      "Gain 1 Speed",
      "Gain 1 Might",
      "Gain 1 Sanity",
      "Gain 1 Knowledge",
    ]);
    expect(clip(choose(allPass, "Gain 1 Sanity"), "sanity")).toBe(
      start.sanity + 1,
    );
  });

  it("offers no gain when any roll is 0-1", () => {
    const failed = firstSeed(draw, (s) =>
      rolls(s.lastEvents).some((r) => r.result <= 1),
    );
    expect(pendingDecision(failed).kind).toBe("turn");
  });
});

describe("Hideous Shriek (cards/events.md)", () => {
  it("has every explorer, starting with you, make a Sanity roll whose result is theirs alone", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { events } = settle(drawEvent("hideous-shriek", { seed }));
      const made = sanityRollsAndDamage(events);
      expect(made.map((r) => r.seat)).toEqual([0, 1, 2]);
      for (const r of made) {
        // 4+: nothing; 1-3: 1 die of mental damage; 0: 2 dice.
        expect(r.damageDice).toBe(r.result >= 4 ? null : r.result >= 1 ? 1 : 2);
      }
    }
  });
});

describe("Image in the Mirror, the one that draws (cards/events.md)", () => {
  it("draws an item card", () => {
    const state = drawEvent("image-in-the-mirror-take", {
      decks: { item: ["candle"] },
    });
    expect(state.explorers[0].cards).toEqual(["candle"]);
  });
});

describe("Jonah's Turn (cards/events.md)", () => {
  it("deals 1 die of mental damage when nobody has the Puzzle Box", () => {
    const state = drawEvent("jonahs-turn");
    expect(rolls(state.lastEvents).map((r) => r.spec)).toEqual([
      { kind: "dice", count: 1 },
    ]);
    expect(clip(state, "sanity")).toBeLessThanOrEqual(2);
  });

  it("swaps the Puzzle Box for a new item, and you gain 1 Sanity", () => {
    const state = drawEvent("jonahs-turn", {
      decks: { item: ["candle"] },
      setUp: (s) => {
        s.decks.item.draw = s.decks.item.draw.filter((c) => c !== "puzzle-box");
        s.explorers[1].cards.push("puzzle-box");
      },
    });
    expect(state.explorers[1].cards).toEqual(["candle"]);
    expect(state.decks.item.discard).toContain("puzzle-box");
    expect(clip(state, "sanity")).toBe(3);
  });
});

describe("Lights Out (cards/events.md)", () => {
  const draw = () => drawEvent("lights-out", { setUp: holdingAxe });

  it("is kept, and its holder moves only 1 space a turn", () => {
    let state = draw();
    expect(state.explorers[0].cards).toContain("lights-out");
    // Zoe ends alone in the Ballroom, so she keeps it.
    state = endTurns(state, 3);
    expect(state.explorers[0].cards).toContain("lights-out");
    state = choose(state, "Move to the Entrance Hall");
    expect(labels(state).some((l) => l.startsWith("Move to"))).toBe(false);
  });

  it("is discarded at the end of a turn you end with another explorer", () => {
    let state = endTurns(draw(), 3);
    state = choose(state, "Move to the Entrance Hall");
    state = choose(state, "End your turn");
    expect(state.explorers[0].cards).not.toContain("lights-out");
    expect(state.decks.event.discard).toContain("lights-out");
  });

  it("is discarded when you end your turn in the Furnace Room", () => {
    let state = draw();
    placeTile(state, "furnace-room", "basement", 0, -1);
    state.explorers[0].room = "furnace-room";
    state = choose(state, "End your turn");
    expect(state.explorers[0].cards).not.toContain("lights-out");
  });

  it("is discarded when you get the Candle", () => {
    let state = draw();
    state.piles.ballroom = ["candle"];
    state = choose(state, "Pick up the Candle");
    expect(state.explorers[0].cards).toEqual(["axe", "candle"]);
  });

  it("is discarded at once if you already have the Candle", () => {
    const state = drawEvent("lights-out", {
      setUp: (s) => {
        s.decks.item.draw = s.decks.item.draw.filter((c) => c !== "candle");
        s.explorers[0].cards.push("candle");
      },
    });
    expect(state.explorers[0].cards).toEqual(["candle"]);
    expect(state.decks.event.discard).toContain("lights-out");
  });
});

describe("Locked Safe (cards/events.md)", () => {
  const open = (seed: string) =>
    choose(
      drawEvent("locked-safe", {
        seed,
        decks: { item: ["candle", "axe"] },
      }),
      "Open the Safe",
    );

  it("puts the Safe token in the room, opened by a Knowledge roll once a turn from that room", () => {
    const state = drawEvent("locked-safe");
    expect(state.tokens).toContainEqual({ token: "safe", room: "ballroom" });
    const opened = choose(state, "Open the Safe (Knowledge roll)");
    expect(rolls(opened.lastEvents)[0].spec).toEqual({
      kind: "trait",
      trait: "knowledge",
    });
    expect(labels(settle(opened).state).some((l) => l.includes("Safe"))).toBe(
      false,
    );
    state.explorers[0].room = "entrance-hall";
    expect(labels(state).some((l) => l.includes("Safe"))).toBe(false);
  });

  it("draws 2 items and removes the Safe on 5+", () => {
    const state = landing(5, 8, open);
    expect(state.explorers[0].cards).toEqual(["candle", "axe"]);
    expect(state.tokens.some((t) => t.token === "safe")).toBe(false);
  });

  it("deals 1 die of physical damage on 2-4 and 2 dice on 0-1, and the Safe stays", () => {
    for (const [min, max, dice] of [
      [2, 4, 1],
      [0, 1, 2],
    ]) {
      const state = landing(min, max, open);
      expect(rolls(state.lastEvents)[1].spec).toEqual({
        kind: "dice",
        count: dice,
      });
      expect(state.tokens).toContainEqual({ token: "safe", room: "ballroom" });
    }
  });
});

describe("Mists from the Walls (cards/events.md)", () => {
  it("has every explorer in the basement make a Sanity roll, with more damage in a room with an event symbol", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { events } = settle(
        drawEvent("mists-from-the-walls", {
          seed,
          setUp: (s) => {
            placeTile(s, "crypt", "basement", 0, 1);
            s.explorers[1].room = "basement-landing"; // no event symbol
            s.explorers[2].room = "crypt"; // an event symbol
          },
        }),
      );
      const made = sanityRollsAndDamage(events);
      // Zoe is on the ground floor and doesn't roll.
      expect(made.map((r) => r.seat)).toEqual([1, 2]);
      const [ox, father] = made;
      expect(ox.damageDice).toBe(ox.result >= 4 ? null : 1);
      expect(father.damageDice).toBe(
        father.result >= 4 ? null : father.result >= 1 ? 2 : 3,
      );
    }
  });
});
