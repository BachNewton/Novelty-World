import { describe, expect, it } from "vitest";
import { adjacent } from "../../engine/board";
import { askNumber } from "../../engine/questions";
import { ENGINE } from "../../game";
import {
  choose,
  offered,
  pendingDecision,
  testGame,
  type TestGame,
} from "../../testing";
import type { GameState } from "../../types";

// Each card's tests come from its content/cards/items.md entry, not from its
// implementation. The Angel Feather names a roll's result, so it pins down the
// row of a table under test.

const ZOE = 0;
const OX = 1;

/** Zoe's turn, in the Entrance Hall with the other explorers, holding these cards. */
function holding(cards: string[], options: TestGame = {}): GameState {
  const state = testGame(options);
  state.explorers[ZOE].cards.push(...cards);
  return state;
}

/** Zoe explores north into the Ballroom and draws this event. */
function drawEvent(state: GameState, event: string): GameState {
  state.board.stack = [
    "ballroom",
    ...state.board.stack.filter((t) => t !== "ballroom"),
  ];
  state.decks.event.draw = [
    event,
    ...state.decks.event.draw.filter((c) => c !== event),
  ];
  return choose(state, "Explore through the north door");
}

function rolled(state: GameState): {
  dice: number[];
  named: number | null;
  result: number;
} {
  const event = state.lastEvents.find((e) => e.type === "rolled");
  if (!event) throw new Error("Nothing was rolled");
  return event.data as { dice: number[]; named: number | null; result: number };
}

const labels = (state: GameState) => offered(state).map((c) => c.label);

/** Uses an item whose roll the Angel Feather then names. */
function actWithNamedRoll(state: GameState, action: string, result: number) {
  const next = choose(state, action);
  return choose(next, `Use Angel Feather: the result is ${result}`);
}

describe("Angel Feather (cards/items.md)", () => {
  it("names any result from 0 to 8 instead of rolling, then is discarded", () => {
    let state = drawEvent(holding(["angel-feather"]), "angry-being");
    expect(labels(state)).toEqual([
      "Make the Speed roll (4 dice)",
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) => `Use Angel Feather: the result is ${n}`,
      ),
    ]);
    state = choose(state, "the result is 6");
    expect(rolled(state)).toMatchObject({ dice: [], named: 6, result: 6 });
    // Angry Being's 5+ row: gain 1 Speed.
    expect(state.explorers[ZOE].clips.speed).toBe(4);
    expect(state.explorers[ZOE].cards).not.toContain("angel-feather");
    expect(state.decks.item.discard).toContain("angel-feather");
  });
});

describe("Armor (cards/items.md)", () => {
  const dealt = (
    state: GameState,
    seat: number,
    damage: "physical" | "mental",
  ) =>
    askNumber(ENGINE, state, "damageAmount", {
      seat,
      damage,
      amount: 3,
      rule: { source: "card", card: "angry-being" },
    });

  it("reduces every physical damage its holder takes by 1, and nothing else", () => {
    const state = holding(["armor"]);
    expect(dealt(state, ZOE, "physical")).toBe(2);
    expect(dealt(state, ZOE, "mental")).toBe(3);
    expect(dealt(state, OX, "physical")).toBe(3);
  });

  it("can be traded and dropped, but not stolen", () => {
    expect(ENGINE.catalog.cards.armor.transfer).toEqual({
      trade: true,
      drop: true,
      steal: false,
    });
  });
});

describe("Bell (cards/items.md)", () => {
  it("gains 1 Sanity when you get it and loses 1 when you lose it", () => {
    let state = testGame({ stack: ["bloody-room"], decks: { item: ["bell"] } });
    const sanity = state.explorers[ZOE].clips.sanity;
    state = choose(state, "Explore through the north door");
    expect(state.explorers[ZOE].clips.sanity).toBe(sanity + 1);
    state = choose(state, "Drop the Bell");
    expect(state.explorers[ZOE].clips.sanity).toBe(sanity);
  });
});

describe("Bottle (cards/items.md)", () => {
  function inTheHaunt(): GameState {
    const state = holding(["bottle", "angel-feather"]);
    state.status = "haunt";
    return state;
  }

  it("can only be drunk from once the haunt is revealed", () => {
    expect(labels(holding(["bottle"]))).not.toContain("Drink from the Bottle");
    expect(labels(inTheHaunt())).toContain("Drink from the Bottle");
  });

  it("applies the row of its 3-dice table, then is discarded", () => {
    const changes: [number, Record<string, number>][] = [
      [5, { might: 2, speed: 2, knowledge: 0, sanity: 0 }],
      [4, { might: 0, speed: 0, knowledge: 2, sanity: 2 }],
      [3, { might: -1, speed: 0, knowledge: 1, sanity: 0 }],
      [2, { might: 0, speed: 0, knowledge: -2, sanity: -2 }],
      [1, { might: -2, speed: -2, knowledge: 0, sanity: 0 }],
      [0, { might: -2, speed: -2, knowledge: -2, sanity: -2 }],
    ];
    for (const [result, change] of changes) {
      const before = inTheHaunt();
      const state = actWithNamedRoll(before, "Drink from the Bottle", result);
      for (const [trait, spaces] of Object.entries(change)) {
        const t = trait as keyof GameState["explorers"][number]["clips"];
        expect(
          state.explorers[ZOE].clips[t] - before.explorers[ZOE].clips[t],
        ).toBe(spaces);
      }
      expect(state.decks.item.discard).toContain("bottle");
    }
  });

  it("on a 6, puts your explorer in a room of your choice", () => {
    let state = actWithNamedRoll(inTheHaunt(), "Drink from the Bottle", 6);
    expect(pendingDecision(state).kind).toBe("choose-one");
    expect(labels(state)).toContain("Put your explorer in the Foyer");
    expect(labels(state)).not.toContain(
      "Put your explorer in the Entrance Hall",
    );
    state = choose(state, "Put your explorer in the Foyer");
    expect(state.explorers[ZOE].room).toBe("foyer");
    expect(state.turn?.moved).toBe(0);
    expect(state.decks.item.discard).toContain("bottle");
  });
});

describe("Dark Dice (cards/items.md)", () => {
  const roll = (state: GameState, result: number) =>
    actWithNamedRoll(state, "Roll the Dark Dice", result);

  it("on a 6, moves you to another explorer's room", () => {
    const state = holding(["dark-dice", "angel-feather"]);
    state.explorers[OX].room = "foyer";
    const after = roll(state, 6);
    expect(after.explorers[ZOE].room).toBe("foyer");
  });

  it("on a 5, moves another explorer in your room into an adjacent room", () => {
    let state = roll(holding(["dark-dice", "angel-feather"]), 5);
    const room = adjacent(state.board, "entrance-hall")[0];
    const label = `Move Ox Bellows into the ${ENGINE.catalog.rooms[room].name}`;
    expect(labels(state)).toContain(label);
    expect(labels(state).some((l) => l.startsWith("Move Zoe"))).toBe(false);
    state = choose(state, label);
    expect(state.explorers[OX].room).toBe(room);
  });

  it("on a 4 or a 2, gains 1 in a physical or a mental trait of your choice", () => {
    let state = roll(holding(["dark-dice", "angel-feather"]), 4);
    expect(labels(state)).toEqual(["Gain 1 Might", "Gain 1 Speed"]);
    const might = state.explorers[ZOE].clips.might;
    state = choose(state, "Gain 1 Might");
    expect(state.explorers[ZOE].clips.might).toBe(might + 1);

    state = roll(holding(["dark-dice", "angel-feather"]), 2);
    expect(labels(state)).toEqual(["Gain 1 Sanity", "Gain 1 Knowledge"]);
  });

  it("on a 3, moves you into an adjacent room without spending movement", () => {
    let state = holding(["dark-dice", "angel-feather"]);
    state.explorers[ZOE].room = "foyer";
    state = roll(state, 3);
    const rooms = adjacent(state.board, "foyer");
    expect(rooms.length).toBeGreaterThan(1);
    expect(labels(state)).toEqual(
      rooms.map((r) => `Move into the ${ENGINE.catalog.rooms[r].name}`),
    );
    state = choose(
      state,
      `Move into the ${ENGINE.catalog.rooms[rooms[0]].name}`,
    );
    expect(state.explorers[ZOE].room).toBe(rooms[0]);
    expect(state.turn?.moved).toBe(0);
  });

  it("on a 1, draws an event card", () => {
    const state = roll(
      holding(["dark-dice", "angel-feather"], {
        decks: { event: ["angry-being"] },
      }),
      1,
    );
    expect(state.lastEvents).toContainEqual(
      expect.objectContaining({
        type: "card-drawn",
        data: expect.objectContaining({ type: "event" }) as unknown,
      }),
    );
  });

  it("on a 0, drops every trait to its lowest value and discards the Dark Dice", () => {
    const state = roll(holding(["dark-dice", "angel-feather"]), 0);
    expect(state.explorers[ZOE].clips).toEqual({
      speed: 0,
      might: 0,
      sanity: 0,
      knowledge: 0,
    });
    expect(state.decks.item.discard).toContain("dark-dice");
  });

  it("is rolled once per turn", () => {
    const state = roll(holding(["dark-dice", "angel-feather"]), 3);
    expect(pendingDecision(state).kind).toBe("turn");
    expect(labels(state)).not.toContain("Roll the Dark Dice");
  });
});

describe("Healing Salve (cards/items.md)", () => {
  it("can't be applied while no Might or Speed in the room is below its starting value", () => {
    expect(labels(holding(["healing-salve"]))).not.toContain(
      "Apply the Healing Salve",
    );
  });

  it("raises one or both physical traits of you or a roommate to their starting value, then is discarded", () => {
    let state = holding(["healing-salve"]);
    state.explorers[ZOE].clips.might = 1;
    state.explorers[ZOE].clips.speed = 0;
    state.explorers[OX].clips.speed = 1;
    state.explorers[2].room = "foyer";
    state.explorers[2].clips.might = 0;
    state = choose(state, "Apply the Healing Salve");
    expect(labels(state)).toEqual([
      "Raise Zoe Ingstrom's Might to its starting value",
      "Raise Zoe Ingstrom's Might and Speed to their starting values",
      "Raise Zoe Ingstrom's Speed to its starting value",
      "Raise Ox Bellows's Speed to its starting value",
    ]);
    state = choose(state, "Zoe Ingstrom's Might and Speed");
    expect(state.explorers[ZOE].clips).toMatchObject({ might: 3, speed: 3 });
    expect(state.decks.item.discard).toContain("healing-salve");
  });
});

describe("Smelling Salts (cards/items.md)", () => {
  it("raises your or a roommate's Knowledge to its starting value, then is discarded", () => {
    let state = holding(["smelling-salts"]);
    state.explorers[OX].clips.knowledge = 0;
    state = choose(state, "Use the Smelling Salts");
    // Only Ox's Knowledge is low, so the engine applies it.
    expect(state.explorers[OX].clips.knowledge).toBe(2);
    expect(state.decks.item.discard).toContain("smelling-salts");
  });
});

describe("Medical Kit (cards/items.md)", () => {
  function hurt(): GameState {
    const state = holding(["medical-kit", "angel-feather"]);
    state.explorers[ZOE].clips.might = 1;
    state.explorers[ZOE].clips.speed = 2;
    return state;
  }

  it("on 8+, gains up to 3 physical points, never past their starting values", () => {
    let state = actWithNamedRoll(hurt(), "Use the Medical Kit", 8);
    expect(labels(state)).toEqual([
      "Zoe Ingstrom gains 2 Might and 1 Speed",
      "Zoe Ingstrom gains 2 Might",
      "Zoe Ingstrom gains 1 Might and 1 Speed",
      "Zoe Ingstrom gains 1 Might",
      "Zoe Ingstrom gains 1 Speed",
    ]);
    state = choose(state, "gains 2 Might and 1 Speed");
    expect(state.explorers[ZOE].clips).toMatchObject({ might: 3, speed: 3 });
  });

  it("on 4-5 gains 1 point, and on 0-3 nothing happens", () => {
    let state = actWithNamedRoll(hurt(), "Use the Medical Kit", 4);
    expect(labels(state)).toEqual([
      "Zoe Ingstrom gains 1 Might",
      "Zoe Ingstrom gains 1 Speed",
    ]);
    state = actWithNamedRoll(hurt(), "Use the Medical Kit", 3);
    expect(state.explorers[ZOE].clips).toMatchObject({ might: 1, speed: 2 });
    expect(labels(state)).not.toContain("Use the Medical Kit");
    expect(state.explorers[ZOE].cards).toContain("medical-kit");
  });

  it("can heal another explorer in your room", () => {
    let state = holding(["medical-kit", "angel-feather"]);
    state.explorers[OX].clips.might = 0;
    state = choose(state, "Use the Medical Kit");
    state = choose(state, "Use Angel Feather: the result is 6");
    expect(labels(state)).toEqual([
      "Ox Bellows gains 2 Might",
      "Ox Bellows gains 1 Might",
    ]);
    state = choose(state, "Ox Bellows gains 2 Might");
    expect(state.explorers[OX].clips.might).toBe(2);
  });
});

describe("Puzzle Box (cards/items.md)", () => {
  it("on 6+, draws 2 items and discards the Puzzle Box", () => {
    const state = actWithNamedRoll(
      holding(["puzzle-box", "angel-feather"], {
        decks: { item: ["bell", "armor"] },
      }),
      "Try to open the Puzzle Box",
      6,
    );
    expect(state.explorers[ZOE].cards).toEqual(["bell", "armor"]);
    expect(state.decks.item.discard).toContain("puzzle-box");
  });

  it("on 0-5, stays shut, and can't be tried again this turn", () => {
    const state = actWithNamedRoll(
      holding(["puzzle-box", "angel-feather"]),
      "Try to open the Puzzle Box",
      5,
    );
    expect(state.explorers[ZOE].cards).toEqual(["puzzle-box"]);
    expect(labels(state)).not.toContain("Try to open the Puzzle Box");
  });
});

describe("Lucky Stone (cards/items.md)", () => {
  it("rerolls any number of the dice after a roll, then is discarded", () => {
    let state = drawEvent(holding(["lucky-stone"]), "angry-being");
    const dice = (pendingDecision(state).params as { dice: number[] }).dice;
    const rerolls = labels(state).filter((l) =>
      l.startsWith("Use Lucky Stone"),
    );
    expect(rerolls.some((l) => l.split(",").length === dice.length)).toBe(true);
    state = choose(state, "Use Lucky Stone");
    expect(rolled(state).dice).toHaveLength(dice.length);
    expect(state.decks.item.discard).toContain("lucky-stone");
  });
});

describe("Rabbit's Foot (cards/items.md)", () => {
  it("rerolls 1 die on your turn, and you keep the second roll", () => {
    let state = drawEvent(holding(["rabbits-foot"]), "angry-being");
    const rerolls = labels(state).filter((l) =>
      l.startsWith("Use Rabbit's Foot"),
    );
    expect(rerolls.length).toBeGreaterThan(0);
    for (const label of rerolls) expect(label).toMatch(/reroll \d$/);
    state = choose(state, "Use Rabbit's Foot");
    expect(rolled(state).dice).toHaveLength(4);
    expect(state.explorers[ZOE].cards).toContain("rabbits-foot");
  });

  it("is not offered on another explorer's turn", () => {
    const state = holding([]);
    state.explorers[OX].cards.push("rabbits-foot");
    const rabbit = ENGINE.behaviours.cards["rabbits-foot"]?.rollOptions?.[0];
    const roll = {
      spec: { kind: "trait", trait: "speed" },
      rule: { source: "card", card: "angry-being" },
    } as const;
    expect(rabbit?.applies(state, OX, roll)).toBe(false);
    expect(rabbit?.applies(state, ZOE, roll)).toBe(true);
  });
});
