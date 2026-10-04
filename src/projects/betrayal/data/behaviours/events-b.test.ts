import { describe, expect, it } from "vitest";
import { traitValue } from "../../engine/explorers";
import { askNumber } from "../../engine/questions";
import { ENGINE } from "../../game";
import { choose, offered, pendingDecision, testGame } from "../../testing";
import type { GameState, Trait } from "../../types";

// Each card's tests come from its content/cards/events.md entry, not from its implementation.

const SEEDS = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

type Rolled = { seat: number; dice: number[]; result: number };

function rolls(state: GameState): Rolled[] {
  return state.lastEvents
    .filter((e) => e.type === "rolled")
    .map((e) => e.data as Rolled);
}

/** Zoe explores north from the Entrance Hall into the Ballroom, which has an event symbol. */
function drawEvent(
  event: string,
  seed = "test-seed",
  setUp: (state: GameState) => void = () => undefined,
): GameState {
  const state = testGame({
    seed,
    stack: ["ballroom"],
    decks: { event: [event] },
  });
  setUp(state);
  return choose(state, "Explore through the north door");
}

/** Answers every damage split the card left, taking whatever split is offered first. */
function takeDamage(state: GameState): GameState {
  let next = state;
  while (
    next.pending?.type === "decision" &&
    pendingDecision(next).kind === "split-damage"
  )
    next = choose(next, "Take");
  return next;
}

function clipsOf(state: GameState, seat = 0) {
  return { ...state.explorers[seat].clips };
}

function changes(before: GameState, after: GameState, seat = 0) {
  const a = clipsOf(before, seat);
  const b = clipsOf(after, seat);
  return {
    speed: b.speed - a.speed,
    might: b.might - a.might,
    sanity: b.sanity - a.sanity,
    knowledge: b.knowledge - a.knowledge,
  };
}

const OX_FIRST = ["ox-bellows", "zoe-ingstrom", "father-rhinehardt"];
const FATHER_FIRST = ["father-rhinehardt", "zoe-ingstrom", "ox-bellows"];

const NONE = { speed: 0, might: 0, sanity: 0, knowledge: 0 };

/** Plays the card under many seeds, checking each outcome against the table
 *  row its roll landed on, and that every row was reached. */
function eachRow(
  event: string,
  rows: {
    min: number;
    max: number;
    check: (s: {
      before: GameState;
      after: GameState;
      rolled: Rolled[];
    }) => void;
  }[],
  options: {
    characters?: string[];
    setUp?: (state: GameState) => void;
    then?: (state: GameState) => GameState;
  } = {},
) {
  const hit = new Set<number>();
  for (const seed of SEEDS) {
    const before = testGame({
      seed,
      characters: options.characters,
      stack: ["ballroom"],
      decks: { event: [event] },
    });
    options.setUp?.(before);
    let after = choose(before, "Explore through the north door");
    if (options.then) after = options.then(after);
    const rolled = rolls(after);
    const index = rows.findIndex(
      (r) => rolled[0].result >= r.min && rolled[0].result <= r.max,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    hit.add(index);
    rows[index].check({ before, after, rolled });
  }
  expect([...hit].sort()).toEqual(rows.map((_r, i) => i));
}

const value = (state: GameState, trait: Trait, seat = 0) =>
  traitValue(ENGINE.catalog, state, seat, trait);

describe("Night View", () => {
  it("makes a Knowledge roll: 5+ gains 1 Knowledge, 0-4 nothing", () => {
    eachRow(
      "night-view",
      [
        {
          min: 5,
          max: 99,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, knowledge: 1 }),
        },
        {
          min: 0,
          max: 4,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual(NONE),
        },
      ],
      { setUp: (s) => (s.explorers[0].clips.knowledge = 6) },
    );
  });

  it("rolls as many dice as the explorer's Knowledge, and is discarded", () => {
    const state = drawEvent("night-view");
    expect(rolls(state)[0].dice).toHaveLength(value(state, "knowledge"));
    expect(state.decks.event.discard).toContain("night-view");
  });
});

describe("Phone Call", () => {
  it("rolls 2 dice: 4 gains Sanity, 3 gains Knowledge, 1-2 is 1 die of mental damage, 0 is 2 dice of physical", () => {
    eachRow("phone-call", [
      {
        min: 4,
        max: 4,
        check: ({ before, after }) =>
          expect(changes(before, after)).toEqual({ ...NONE, sanity: 1 }),
      },
      {
        min: 3,
        max: 3,
        check: ({ before, after }) =>
          expect(changes(before, after)).toEqual({ ...NONE, knowledge: 1 }),
      },
      {
        min: 1,
        max: 2,
        check: ({ after, rolled }) => {
          expect(rolled[1].dice).toHaveLength(1);
          if (rolled[1].result > 0)
            expect(pendingDecision(after).params).toMatchObject({
              damage: "mental",
            });
        },
      },
      {
        min: 0,
        max: 0,
        check: ({ after, rolled }) => {
          expect(rolled[1].dice).toHaveLength(2);
          if (rolled[1].result > 0)
            expect(pendingDecision(after).params).toMatchObject({
              damage: "physical",
            });
        },
      },
    ]);
  });

  it("is not a trait roll: always 2 dice", () => {
    const state = drawEvent("phone-call");
    expect(rolls(state)[0].dice).toHaveLength(2);
  });
});

describe("Possession", () => {
  it("lets you choose the trait to roll", () => {
    const state = drawEvent("possession");
    expect(offered(state).map((c) => c.label)).toEqual([
      "Make a Speed roll",
      "Make a Might roll",
      "Make a Sanity roll",
      "Make a Knowledge roll",
    ]);
  });

  it("on 4+ gains 1 in a trait of your choice; on 0-3 drops the rolled trait to its lowest value", () => {
    eachRow(
      "possession",
      [
        {
          min: 4,
          max: 99,
          check: ({ before, after }) => {
            expect(offered(after).map((c) => c.label)).toEqual([
              "Gain 1 Speed",
              "Gain 1 Might",
              "Gain 1 Sanity",
              "Gain 1 Knowledge",
            ]);
            const gained = choose(after, "Gain 1 Sanity");
            expect(changes(before, gained)).toEqual({ ...NONE, sanity: 1 });
          },
        },
        {
          min: 0,
          max: 3,
          check: ({ before, after }) => {
            // The lowest value, not the skull: the first space of the track.
            expect(after.explorers[0].clips.might).toBe(0);
            expect(after.explorers[0].clips.speed).toBe(
              before.explorers[0].clips.speed,
            );
          },
        },
      ],
      { then: (s) => choose(s, "Make a Might roll") },
    );
  });

  it("lowers a different trait of your choice when the rolled one is already at its lowest", () => {
    let found = false;
    for (const seed of SEEDS) {
      let state = drawEvent("possession", seed, (s) => {
        s.explorers[0].clips.might = 0;
        s.explorers[0].clips.speed = 0;
      });
      state = choose(state, "Make a Might roll");
      if (rolls(state)[0].result >= 4) continue;
      found = true;
      // Speed is already at its lowest, so only Sanity and Knowledge can be lowered.
      expect(offered(state).map((c) => c.label)).toEqual([
        "Lower Sanity to its lowest value",
        "Lower Knowledge to its lowest value",
      ]);
      state = choose(state, "Lower Knowledge");
      expect(state.explorers[0].clips.knowledge).toBe(0);
      expect(state.explorers[0].clips.sanity).not.toBe(0);
    }
    expect(found).toBe(true);
  });
});

describe("Rotten", () => {
  it("makes a Sanity roll and applies its row", () => {
    eachRow(
      "rotten",
      [
        {
          min: 5,
          max: 99,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, sanity: 1 }),
        },
        {
          min: 2,
          max: 4,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, might: -1 }),
        },
        {
          min: 1,
          max: 1,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({
              ...NONE,
              might: -1,
              speed: -1,
            }),
        },
        {
          min: 0,
          max: 0,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({
              speed: -1,
              might: -1,
              sanity: -1,
              knowledge: -1,
            }),
        },
      ],
      // Ox Bellows: three dice of Sanity, so every row can come up, and no trait at its lowest.
      {
        characters: OX_FIRST,
        setUp: (s) => {
          s.explorers[0].clips.sanity = 2;
          s.explorers[0].clips.might = 3;
          s.explorers[0].clips.speed = 3;
          s.explorers[0].clips.knowledge = 3;
        },
      },
    );
  });
});

describe("Something Slimy", () => {
  it("makes a Speed roll: 4+ gains Speed, 1-3 loses Might, 0 loses Might and Speed", () => {
    eachRow(
      "something-slimy",
      [
        {
          min: 4,
          max: 99,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, speed: 1 }),
        },
        {
          min: 1,
          max: 3,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, might: -1 }),
        },
        {
          min: 0,
          max: 0,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({
              ...NONE,
              might: -1,
              speed: -1,
            }),
        },
      ],
      // Father Rhinehardt: three dice of Speed, one space above the lowest.
      {
        characters: FATHER_FIRST,
        setUp: (s) => {
          s.explorers[0].clips.speed = 1;
          s.explorers[0].clips.might = 3;
        },
      },
    );
  });
});

describe("Spider", () => {
  it("offers a Speed or a Sanity roll", () => {
    const state = drawEvent("spider");
    expect(offered(state).map((c) => c.label)).toEqual([
      "Make a Speed roll",
      "Make a Sanity roll",
    ]);
  });

  it("4+ gains 1 in the trait rolled; 1-3 is 1 die of physical damage; 0 is 2 dice", () => {
    eachRow(
      "spider",
      [
        {
          min: 4,
          max: 99,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, sanity: 1 }),
        },
        {
          min: 1,
          max: 3,
          check: ({ rolled }) => expect(rolled[1].dice).toHaveLength(1),
        },
        {
          min: 0,
          max: 0,
          check: ({ rolled }) => expect(rolled[1].dice).toHaveLength(2),
        },
      ],
      {
        characters: OX_FIRST,
        setUp: (s) => (s.explorers[0].clips.sanity = 2),
        then: (s) => choose(s, "Make a Sanity roll"),
      },
    );
  });
});

describe("The Voice", () => {
  it("makes a Knowledge roll: 4+ draws an item, 0-3 nothing", () => {
    eachRow("the-voice", [
      {
        min: 4,
        max: 99,
        check: ({ after }) => {
          expect(after.explorers[0].cards).toHaveLength(1);
          expect(ENGINE.catalog.cards[after.explorers[0].cards[0]].type).toBe(
            "item",
          );
        },
      },
      {
        min: 0,
        max: 3,
        check: ({ before, after }) => {
          expect(after.explorers[0].cards).toEqual([]);
          expect(changes(before, after)).toEqual(NONE);
        },
      },
    ]);
  });
});

describe("Something Hidden", () => {
  it("may be ignored, and then nothing happens", () => {
    let state = drawEvent("something-hidden");
    expect(offered(state).map((c) => c.label)).toEqual([
      "Make a Knowledge roll",
      "Don't roll",
    ]);
    const before = state;
    state = choose(state, "Don't roll");
    expect(rolls(state)).toEqual([]);
    expect(changes(before, state)).toEqual(NONE);
    expect(state.decks.event.discard).toContain("something-hidden");
  });

  it("on a Knowledge roll, 4+ draws an item and 0-3 loses 1 Sanity", () => {
    eachRow(
      "something-hidden",
      [
        {
          min: 4,
          max: 99,
          check: ({ after }) =>
            expect(ENGINE.catalog.cards[after.explorers[0].cards[0]].type).toBe(
              "item",
            ),
        },
        {
          min: 0,
          max: 3,
          check: ({ before, after }) =>
            expect(changes(before, after)).toEqual({ ...NONE, sanity: -1 }),
        },
      ],
      { then: (s) => choose(s, "Make a Knowledge roll") },
    );
  });
});

describe("Silence", () => {
  it("makes every explorer in the basement, and only them, roll Sanity", () => {
    const state = drawEvent("silence", "test-seed", (s) => {
      s.explorers[1].room = "basement-landing";
    });
    const rolled = rolls(state);
    expect(rolled[0].seat).toBe(1);
    expect(rolled.every((r) => r.seat === 1)).toBe(true);
    expect(rolled[0].dice).toHaveLength(value(state, "sanity", 1));
  });

  it("4+ nothing, 1-3 is 1 die of mental damage, 0 is 2 dice", () => {
    eachRow(
      "silence",
      [
        {
          min: 4,
          max: 99,
          check: ({ rolled }) => expect(rolled).toHaveLength(1),
        },
        {
          min: 1,
          max: 3,
          check: ({ rolled }) => expect(rolled[1].dice).toHaveLength(1),
        },
        {
          min: 0,
          max: 0,
          check: ({ rolled }) => expect(rolled[1].dice).toHaveLength(2),
        },
      ],
      {
        setUp: (s) => {
          s.explorers[1].room = "basement-landing";
          s.explorers[1].clips.sanity = 2;
        },
      },
    );
  });

  it("does nothing when no one is in the basement", () => {
    const state = drawEvent("silence");
    expect(rolls(state)).toEqual([]);
    expect(state.decks.event.discard).toContain("silence");
  });
});

describe("Shrieking Wind", () => {
  it("makes explorers outdoors or by an outside-facing window roll Might, and no one else", () => {
    const state = drawEvent("shrieking-wind", "test-seed", (s) => {
      // The Grand Staircase's window faces an empty space.
      s.explorers[1].room = "grand-staircase";
      s.board.tiles.push({
        tile: "gardens",
        floor: "ground",
        x: 9,
        y: 9,
        rotation: 0,
      });
      s.explorers[2].room = "gardens";
    });
    // Each roll and its damage settle before the next explorer rolls.
    const seats = rolls(state).map((r) => r.seat);
    let next = state;
    while (pendingDecision(next).kind === "split-damage") {
      next = choose(next, "Take");
      seats.push(...rolls(next).map((r) => r.seat));
    }
    expect(seats[0]).toBe(1);
    expect(new Set(seats)).toEqual(new Set([1, 2]));
  });

  it("ignores a window with a room against it, which is a false window", () => {
    const state = drawEvent("shrieking-wind", "test-seed", (s) => {
      s.explorers[1].room = "grand-staircase";
      s.board.tiles.push({
        tile: "dining-room",
        floor: "ground",
        x: 0,
        y: 1,
        rotation: 0,
      });
    });
    expect(rolls(state)).toEqual([]);
  });

  it("5+ nothing, 3-4 is 1 die of physical damage, 1-2 is 1 die of mental, 0 also puts an item of yours in the Entrance Hall", () => {
    eachRow(
      "shrieking-wind",
      [
        {
          min: 5,
          max: 99,
          check: ({ rolled }) => expect(rolled).toHaveLength(1),
        },
        {
          min: 3,
          max: 4,
          check: ({ after, rolled }) => {
            expect(rolled[1].dice).toHaveLength(1);
            if (rolled[1].result > 0)
              expect(pendingDecision(after).params).toMatchObject({
                damage: "physical",
              });
          },
        },
        {
          min: 1,
          max: 2,
          check: ({ after, rolled }) => {
            expect(rolled[1].dice).toHaveLength(1);
            if (rolled[1].result > 0)
              expect(pendingDecision(after).params).toMatchObject({
                damage: "mental",
              });
          },
        },
        {
          min: 0,
          max: 0,
          check: ({ after, rolled }) => {
            expect(rolled[1].dice).toHaveLength(1);
            let state = takeDamage(after);
            expect(offered(state).map((c) => c.label)).toEqual([
              "Put the Bottle in the Entrance Hall",
              "Put the Axe in the Entrance Hall",
            ]);
            state = choose(state, "Put the Axe");
            expect(state.explorers[1].cards).toEqual(["bottle", "book"]);
            expect(state.piles["entrance-hall"]).toEqual(["axe"]);
          },
        },
      ],
      // Zoe, in seat 1, rolls three dice of Might.
      {
        characters: FATHER_FIRST,
        setUp: (s) => {
          s.explorers[1].room = "grand-staircase";
          s.explorers[1].clips.might = 2;
          s.explorers[1].cards = ["bottle", "axe", "book"];
        },
      },
    );
  });
});

describe("Skeletons", () => {
  it("puts the Skeletons token in the room and deals 1 die of mental damage", () => {
    const drawn = drawEvent("skeletons");
    expect(rolls(drawn)[0].dice).toHaveLength(1);
    const state = takeDamage(drawn);
    expect(state.tokens).toContainEqual({
      token: "skeletons",
      room: "ballroom",
    });
    expect(state.decks.event.discard).toContain("skeletons");
  });

  it("can be searched with a Sanity roll once a turn by an explorer in its room: 5+ draws an item and removes the token, 0-4 is 1 die of mental damage", () => {
    const hit = new Set<string>();
    for (const seed of SEEDS) {
      let state = takeDamage(drawEvent("skeletons", seed));
      state.explorers[0].clips.sanity = 6;
      const sanity = value(state, "sanity");
      state = choose(state, "Search the Skeletons");
      const rolled = rolls(state);
      expect(rolled[0].dice).toHaveLength(sanity);
      if (rolled[0].result >= 5) {
        hit.add("found");
        expect(state.explorers[0].cards).toHaveLength(1);
        expect(state.tokens).not.toContainEqual({
          token: "skeletons",
          room: "ballroom",
        });
      } else {
        hit.add("nothing");
        expect(rolled[1].dice).toHaveLength(1);
        state = takeDamage(state);
        expect(state.tokens).toContainEqual({
          token: "skeletons",
          room: "ballroom",
        });
        // Once a turn.
        expect(
          offered(state).some((c) => c.label.includes("Search the Skeletons")),
        ).toBe(false);
      }
    }
    expect([...hit].sort()).toEqual(["found", "nothing"]);
  });

  it("isn't offered to an explorer in another room", () => {
    let state = takeDamage(drawEvent("skeletons"));
    state = choose(state, "End your turn");
    expect(
      offered(state).some((c) => c.label.includes("Search the Skeletons")),
    ).toBe(false);
  });
});

describe("Smoke", () => {
  const traitRoll = (trait: Trait) => ({
    spec: { kind: "trait" as const, trait },
    rule: { source: "card" as const, card: "test" },
    extraDice: 0,
  });

  it("puts the Smoke token in the room; trait rolls there get 2 fewer dice, to a minimum of 1", () => {
    const state = drawEvent("smoke");
    expect(state.tokens).toContainEqual({ token: "smoke", room: "ballroom" });
    expect(
      askNumber(ENGINE, state, "dicePool", {
        seat: 0,
        roll: traitRoll("speed"),
      }),
    ).toBe(value(state, "speed") - 2);
    // Zoe's Knowledge here is 2: two fewer would be none.
    state.explorers[0].clips.knowledge = 1;
    expect(value(state, "knowledge")).toBe(2);
    expect(
      askNumber(ENGINE, state, "dicePool", {
        seat: 0,
        roll: traitRoll("knowledge"),
      }),
    ).toBe(1);
  });

  it("doesn't touch rolls outside the room, or dice that aren't a trait roll", () => {
    const state = drawEvent("smoke");
    expect(
      askNumber(ENGINE, state, "dicePool", {
        seat: 1,
        roll: traitRoll("speed"),
      }),
    ).toBe(value(state, "speed", 1));
    expect(
      askNumber(ENGINE, state, "dicePool", {
        seat: 0,
        roll: {
          spec: { kind: "dice", count: 3 },
          rule: { source: "card", card: "test" },
          extraDice: 0,
        },
      }),
    ).toBe(3);
  });
});

describe("Whoops!", () => {
  it("loses one of your items at random, never an omen", () => {
    const lost = new Set<string>();
    for (const seed of SEEDS.slice(0, 20)) {
      const state = drawEvent("whoops", seed, (s) => {
        s.explorers[0].cards = ["axe", "book", "bottle"];
      });
      const kept = state.explorers[0].cards;
      expect(kept).toContain("book");
      expect(kept).toHaveLength(2);
      const gone = ["axe", "bottle"].find((c) => !kept.includes(c));
      expect(gone).toBeDefined();
      expect(state.decks.item.discard).toContain(gone);
      lost.add(gone ?? "");
    }
    // It is random: either item can go.
    expect([...lost].sort()).toEqual(["axe", "bottle"]);
  });

  it("does nothing to an explorer with no items", () => {
    const state = drawEvent("whoops", "test-seed", (s) => {
      s.explorers[0].cards = ["book"];
    });
    expect(state.explorers[0].cards).toEqual(["book"]);
  });
});
