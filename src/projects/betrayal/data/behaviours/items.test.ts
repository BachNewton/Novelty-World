import { describe, expect, it } from "vitest";
import { adjacent } from "../../engine/board";
import { attack } from "../../engine/combat";
import { discardCard } from "../../engine/effects";
import { traitValue } from "../../engine/questions";
import { askNumber } from "../../engine/questions";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import {
  at,
  choose,
  eventTypes,
  explorer,
  inHaunt,
  offered,
  pendingDecision,
  put,
  testGame,
  type TestGame,
} from "../../testing";
import type { GameState, Trait } from "../../types";

// Each card's tests come from its content/cards/items.md entry, not from its
// implementation. The Angel Feather names a roll's result, so it pins down the
// row of a table under test.

const ZOE = 0;
const OX = 1;
const ZOE_ID = "zoe-ingstrom";
const OX_ID = "ox-bellows";
const FATHER_ID = "father-rhinehardt";

/** Zoe's turn, in the Entrance Hall with the other explorers, holding these cards. */
function holding(cards: string[], options: TestGame = {}): GameState {
  const state = testGame(options);
  explorer(state, ZOE).cards.push(...cards);
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

/** Starts Zoe's attack on Ox in the middle of her turn. */
function attackOx(state: GameState): GameState {
  return start(ENGINE, { ...state, pending: null }, [
    attack({ kind: "figure", figure: ZOE_ID }, OX_ID, {
      source: "rulebook",
      page: 13,
    }),
  ]);
}

/** Each roll made in the latest write: who rolled and how many dice. */
function rollsMade(state: GameState): { figure: string; dice: number }[] {
  return state.lastEvents
    .filter((e) => e.type === "rolled")
    .map((e) => {
      const d = e.data as { figure: string; dice: number[] };
      return { figure: d.figure, dice: d.dice.length };
    });
}

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
    expect(explorer(state, ZOE).traits.clips.speed).toBe(4);
    expect(explorer(state, ZOE).cards).not.toContain("angel-feather");
    expect(state.decks.item.discard).toContain("angel-feather");
  });

  it("takes a table's top row with a number past it (the card's project ruling)", () => {
    // The Mystic Elevator rolls 2 dice, and its table stops at 4: any floor.
    const state = choose(
      holding(["angel-feather"], { stack: ["mystic-elevator"] }),
      "Explore through the north door",
    );
    const named = choose(state, "the result is 5");
    expect(rolled(named)).toMatchObject({ named: 5, result: 5 });
    expect(labels(named)).toEqual([
      "Send the elevator to the upper floor",
      "Send the elevator to the ground floor",
      "Send the elevator to the basement",
    ]);
  });
});

describe("Armor (cards/items.md)", () => {
  const dealt = (
    state: GameState,
    figure: string,
    damage: "physical" | "mental",
  ) =>
    askNumber(ENGINE, state, "damageAmount", {
      figure,
      damage,
      amount: 3,
      rule: { source: "card", card: "angry-being" },
    });

  it("reduces every physical damage its holder takes by 1, and nothing else", () => {
    const state = holding(["armor"]);
    expect(dealt(state, ZOE_ID, "physical")).toBe(2);
    expect(dealt(state, ZOE_ID, "mental")).toBe(3);
    expect(dealt(state, OX_ID, "physical")).toBe(3);
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
    const sanity = explorer(state, ZOE).traits.clips.sanity;
    state = choose(state, "Explore through the north door");
    expect(explorer(state, ZOE).traits.clips.sanity).toBe(sanity + 1);
    state = choose(state, "Drop the Bell");
    expect(explorer(state, ZOE).traits.clips.sanity).toBe(sanity);
  });

  it("on a 5+, calls any unimpeded heroes 1 space closer, as the ringer chooses", () => {
    // Zoe and Father Rhinehardt are heroes, Ox the traitor; the others wait
    // in the Foyer. Trapped by the Debris, Father Rhinehardt can't be called.
    const state = inHaunt(holding(["bell", "angel-feather"]), 1);
    put(state, OX, "foyer");
    put(state, 2, "foyer");
    explorer(state, 2).cards.push("debris");
    let rung = actWithNamedRoll(state, "Ring the Bell (Sanity roll)", 5);
    expect(eventTypes(rung)).not.toContain("entered");
    explorer(state, 2).cards.pop();
    rung = actWithNamedRoll(state, "Ring the Bell (Sanity roll)", 5);
    expect(labels(rung)).toEqual([
      "Call Father Rhinehardt 1 space closer",
      "Leave Father Rhinehardt be",
    ]);
    rung = choose(rung, "Call Father Rhinehardt");
    expect(at(rung, 2).room).toBe("entrance-hall");
    expect(at(rung, OX).room).toBe("foyer");
  });

  it("can't be rung before the haunt is revealed", () => {
    expect(labels(holding(["bell"]))).not.toContain(
      "Ring the Bell (Sanity roll)",
    );
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
        const t = trait as Trait;
        expect(
          explorer(state, ZOE).traits.clips[t] - explorer(before, ZOE).traits.clips[t],
        ).toBe(spaces);
      }
      expect(state.decks.item.discard).toContain("bottle");
    }
  });

  it("on a 6, puts your explorer in a room of your choice, your own included", () => {
    let state = actWithNamedRoll(inTheHaunt(), "Drink from the Bottle", 6);
    expect(pendingDecision(state).kind).toBe("choose-one");
    expect(labels(state)).toContain("Put your explorer in the Foyer");
    expect(labels(state)).toContain("Stay in the Entrance Hall");
    expect(at(choose(state, "Stay in the Entrance Hall"), ZOE).room).toBe(
      "entrance-hall",
    );
    state = choose(state, "Put your explorer in the Foyer");
    expect(at(state, ZOE).room).toBe("foyer");
    expect(state.turn?.moved).toEqual({});
    expect(state.decks.item.discard).toContain("bottle");
  });
});

describe("Dark Dice (cards/items.md)", () => {
  const roll = (state: GameState, result: number) =>
    actWithNamedRoll(state, "Roll the Dark Dice", result);

  it("on a 6, moves you to another explorer's room", () => {
    const state = holding(["dark-dice", "angel-feather"]);
    put(state, OX, "foyer");
    const after = roll(state, 6);
    expect(at(after, ZOE).room).toBe("foyer");
  });

  it("on a 6, can take you across a barrier to an explorer on its other side", () => {
    const state = holding(["dark-dice", "angel-feather"]);
    state.board.tiles.push({
      tile: "chasm",
      floor: "basement",
      x: 9,
      y: 9,
      rotation: 0,
    });
    const [near, far] = ENGINE.catalog.rooms.chasm.doors;
    put(state, ZOE, "chasm", near);
    put(state, OX, "chasm", far);
    put(state, 2, "chasm", near);
    // Father Rhinehardt, on Zoe's own side, is already where she is: Ox is
    // the only explorer to move to, so the move is forced.
    const after = roll(state, 6);
    expect(at(after, ZOE).room).toBe("chasm");
    expect(at(after, ZOE).side).toBe(far);
  });

  it("on a 6, after the haunt, never moves you to a revealed traitor, but may to a hidden one", () => {
    const state = inHaunt(holding(["dark-dice", "angel-feather"]), 1);
    put(state, OX, "foyer");
    put(state, 2, "upper-landing");
    let after = roll(state, 6);
    // Father Rhinehardt is the only explorer to move to: the move is forced.
    expect(at(after, ZOE).room).toBe("upper-landing");
    state.seats[1].knownBy = [1];
    after = roll(state, 6);
    expect(labels(after)).toEqual([
      "Move to Ox Bellows in the Foyer",
      "Move to Father Rhinehardt in the Upper Landing",
    ]);
  });

  it("on a 5, moves another explorer in your room into an adjacent room", () => {
    let state = roll(holding(["dark-dice", "angel-feather"]), 5);
    const room = adjacent(state.board, "entrance-hall")[0];
    const label = `Move Ox Bellows into the ${ENGINE.catalog.rooms[room].name}`;
    expect(labels(state)).toContain(label);
    expect(labels(state).some((l) => l.startsWith("Move Zoe"))).toBe(false);
    state = choose(state, label);
    expect(at(state, OX).room).toBe(room);
  });

  it("on a 4 or a 2, gains 1 in a physical or a mental trait of your choice", () => {
    let state = roll(holding(["dark-dice", "angel-feather"]), 4);
    expect(labels(state)).toEqual(["Gain 1 Might", "Gain 1 Speed"]);
    const might = explorer(state, ZOE).traits.clips.might;
    state = choose(state, "Gain 1 Might");
    expect(explorer(state, ZOE).traits.clips.might).toBe(might + 1);

    state = roll(holding(["dark-dice", "angel-feather"]), 2);
    expect(labels(state)).toEqual(["Gain 1 Sanity", "Gain 1 Knowledge"]);
  });

  it("on a 3, moves you into an adjacent room without spending movement", () => {
    let state = holding(["dark-dice", "angel-feather"]);
    put(state, ZOE, "foyer");
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
    expect(at(state, ZOE).room).toBe(rooms[0]);
    expect(state.turn?.moved).toEqual({});
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
    expect(explorer(state, ZOE).traits.clips).toEqual({
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
    explorer(state, ZOE).traits.clips.might = 1;
    explorer(state, ZOE).traits.clips.speed = 0;
    explorer(state, OX).traits.clips.speed = 1;
    put(state, 2, "foyer");
    explorer(state, 2).traits.clips.might = 0;
    state = choose(state, "Apply the Healing Salve");
    expect(labels(state)).toEqual([
      "Raise Zoe Ingstrom's Might to its starting value",
      "Raise Zoe Ingstrom's Might and Speed to their starting values",
      "Raise Zoe Ingstrom's Speed to its starting value",
      "Raise Ox Bellows's Speed to its starting value",
    ]);
    state = choose(state, "Zoe Ingstrom's Might and Speed");
    expect(explorer(state, ZOE).traits.clips).toMatchObject({ might: 3, speed: 3 });
    expect(state.decks.item.discard).toContain("healing-salve");
  });
});

describe("Smelling Salts (cards/items.md)", () => {
  it("raises your or a roommate's Knowledge to its starting value, then is discarded", () => {
    let state = holding(["smelling-salts"]);
    explorer(state, OX).traits.clips.knowledge = 0;
    state = choose(state, "Use the Smelling Salts");
    // Only Ox's Knowledge is low, so the engine applies it.
    expect(explorer(state, OX).traits.clips.knowledge).toBe(2);
    expect(state.decks.item.discard).toContain("smelling-salts");
  });
});

describe("Medical Kit (cards/items.md)", () => {
  function hurt(): GameState {
    const state = holding(["medical-kit", "angel-feather"]);
    explorer(state, ZOE).traits.clips.might = 1;
    explorer(state, ZOE).traits.clips.speed = 2;
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
    expect(explorer(state, ZOE).traits.clips).toMatchObject({ might: 3, speed: 3 });
  });

  it("on 4-5 gains 1 point, and on 0-3 nothing happens", () => {
    let state = actWithNamedRoll(hurt(), "Use the Medical Kit", 4);
    expect(labels(state)).toEqual([
      "Zoe Ingstrom gains 1 Might",
      "Zoe Ingstrom gains 1 Speed",
    ]);
    state = actWithNamedRoll(hurt(), "Use the Medical Kit", 3);
    expect(explorer(state, ZOE).traits.clips).toMatchObject({ might: 1, speed: 2 });
    expect(labels(state)).not.toContain("Use the Medical Kit");
    expect(explorer(state, ZOE).cards).toContain("medical-kit");
  });

  it("can heal another explorer in your room", () => {
    let state = holding(["medical-kit", "angel-feather"]);
    explorer(state, OX).traits.clips.might = 0;
    state = choose(state, "Use the Medical Kit");
    state = choose(state, "Use Angel Feather: the result is 6");
    expect(labels(state)).toEqual([
      "Ox Bellows gains 2 Might",
      "Ox Bellows gains 1 Might",
    ]);
    state = choose(state, "Ox Bellows gains 2 Might");
    expect(explorer(state, OX).traits.clips.might).toBe(2);
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
    expect(explorer(state, ZOE).cards).toEqual(["bell", "armor"]);
    expect(state.decks.item.discard).toContain("puzzle-box");
  });

  it("on 0-5, stays shut, and can't be tried again this turn", () => {
    const state = actWithNamedRoll(
      holding(["puzzle-box", "angel-feather"]),
      "Try to open the Puzzle Box",
      5,
    );
    expect(explorer(state, ZOE).cards).toEqual(["puzzle-box"]);
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
    expect(explorer(state, ZOE).cards).toContain("rabbits-foot");
  });

  it("is not offered on another explorer's turn", () => {
    const state = testGame();
    explorer(state, OX).cards.push("rabbits-foot");
    // Ox defends against Zoe's attack on her turn: no reroll is offered.
    expect(eventTypes(attackOx(state))).toContain("attack-outcome");
  });
});

describe("Candle (cards/items.md)", () => {
  // Zoe's traits sit mid-track, so gains and losses of 2 aren't capped.
  function withSet(cards: string[]): GameState {
    const state = holding(cards);
    explorer(state, ZOE).traits.clips = {
      speed: 3,
      might: 3,
      sanity: 3,
      knowledge: 3,
    };
    return state;
  }
  const clips = (state: GameState) => explorer(state, ZOE).traits.clips;
  const each = (n: number) => ({ speed: n, might: n, sanity: n, knowledge: n });

  it("with the Bell, the Book and the Candle, you gain 2 in each trait", () => {
    const state = withSet(["bell", "book"]);
    state.piles["entrance-hall"] = ["candle"];
    expect(clips(choose(state, "Pick up the Candle"))).toEqual(each(5));
  });

  it("the first time you lose one of the three later, you lose 2 from each trait", () => {
    const state = withSet(["bell", "candle"]);
    state.piles["entrance-hall"] = ["book"];
    let after = choose(state, "Pick up the Book");
    // The Book itself: gain 2 Knowledge.
    expect(clips(after)).toEqual({ ...each(5), knowledge: 7 });
    after = choose(after, "Drop the Bell");
    // The Bell itself: lose 1 Sanity.
    expect(clips(after)).toEqual({ ...each(3), sanity: 2, knowledge: 5 });
    // The Book was picked up this turn, so it can't also be dropped: an event takes it.
    after = start(ENGINE, { ...after, pending: null }, [
      discardCard(ZOE_ID, "book"),
    ]);
    // Only the Book's own loss now: lose 2 Knowledge.
    expect(clips(after)).toEqual({ ...each(3), sanity: 2 });
  });

  it("losing the Candle itself also costs the set's 2 in each trait", () => {
    const state = withSet(["bell", "book"]);
    state.piles["entrance-hall"] = ["candle"];
    const after = choose(choose(state, "Pick up the Candle"), "End your turn");
    const dropped = choose(
      choose(choose(after, "End your turn"), "End your turn"),
      "Drop the Candle",
    );
    expect(clips(dropped)).toEqual(each(3));
  });

  /** The Sanity rolls made from drawing the event until the next turn
   *  decision, as [figure, dice], splitting damage the first way offered. */
  function sanityRolls(start: GameState): [string, number][] {
    let state = start;
    const seen = [...state.lastEvents];
    while (pendingDecision(state).kind === "split-damage") {
      state = choose(state, "Take");
      seen.push(...state.lastEvents);
    }
    return seen
      .filter((e) => e.type === "rolled")
      .map(
        (e) =>
          e.data as { figure: string; spec: { kind: string }; dice: number[] },
      )
      .filter((r) => r.spec.kind === "trait")
      .map((r) => [r.figure, r.dice.length]);
  }

  it("rolls 1 extra die for the trait rolls of an event you draw", () => {
    const state = drawEvent(holding(["candle"]), "angry-being");
    // Zoe's Speed is 4.
    expect(rolled(state).dice).toHaveLength(5);
  });

  it("adds nothing to another explorer's roll for an event you drew, or to yours for theirs", () => {
    const sanity = (figure: string) =>
      traitValue(ENGINE, testGame(), figure, "sanity");
    // Hideous Shriek: every explorer makes a Sanity roll.
    expect(
      sanityRolls(drawEvent(holding(["candle"]), "hideous-shriek")),
    ).toEqual([
      [ZOE_ID, sanity(ZOE_ID) + 1],
      [OX_ID, sanity(OX_ID)],
      [FATHER_ID, sanity(FATHER_ID)],
    ]);
    const state = holding([]);
    explorer(state, OX).cards.push("candle");
    expect(sanityRolls(drawEvent(state, "hideous-shriek"))).toEqual([
      [ZOE_ID, sanity(ZOE_ID)],
      [OX_ID, sanity(OX_ID)],
      [FATHER_ID, sanity(FATHER_ID)],
    ]);
  });

  it("adds nothing to an event's dice that aren't a trait roll, or once the event is gone", () => {
    const state = drawEvent(holding(["candle"]), "angry-being");
    const pool = (
      spec: { kind: "dice"; count: number } | { kind: "trait"; trait: "speed" },
    ) =>
      askNumber(ENGINE, state, "dicePool", {
        figure: ZOE_ID,
        roll: {
          spec,
          rule: { source: "card", card: "angry-being" },
          extraDice: 0,
        },
      });
    expect(pool({ kind: "dice", count: 2 })).toBe(2);
    // Angry Being has been discarded, so a roll naming it isn't for an event in play.
    expect(state.decks.event.discard).toContain("angry-being");
    expect(pool({ kind: "trait", trait: "speed" })).toBe(
      traitValue(ENGINE, state, ZOE_ID, "speed"),
    );
  });
});

describe("Idol (cards/items.md)", () => {
  it("adds 2 dice to a trait roll, and each use costs 1 Sanity", () => {
    let state = drawEvent(holding(["idol"]), "angry-being");
    expect(labels(state)).toEqual([
      "Make the Speed roll (4 dice)",
      "Use Idol: add 2 dice",
    ]);
    const sanity = explorer(state, ZOE).traits.clips.sanity;
    state = choose(state, "Use Idol");
    expect(rolled(state).dice).toHaveLength(6);
    expect(explorer(state, ZOE).traits.clips.sanity).toBe(sanity - 1);
    expect(explorer(state, ZOE).cards).toContain("idol");
  });

  it("never takes a roll past 8 dice", () => {
    const state = holding(["idol"]);
    // Zoe's Speed of 8.
    explorer(state, ZOE).traits.clips.speed = 7;
    const after = choose(drawEvent(state, "angry-being"), "Use Idol");
    expect(rolled(after).dice).toHaveLength(8);
  });

  it("is for trait, combat and event rolls: not an item's dice or the haunt roll", () => {
    const idol = ENGINE.behaviours.cards.idol?.rollOptions?.[0];
    const state = holding(["idol"]);
    const applies = (
      spec: { kind: "dice"; count: number } | { kind: "haunt" },
      card: string | null,
    ) =>
      idol?.applies(state, ZOE_ID, {
        spec,
        rule:
          card === null
            ? { source: "rulebook", page: 15 }
            : { source: "card", card },
        extraDice: 0,
      });
    expect(applies({ kind: "dice", count: 2 }, "angry-being")).toBe(true);
    expect(applies({ kind: "dice", count: 3 }, "dark-dice")).toBe(false);
    expect(applies({ kind: "haunt" }, null)).toBe(false);
  });
});

describe("Music Box (cards/items.md)", () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => `${i}`);
  const sanityRolls = (state: GameState) =>
    state.lastEvents
      .filter(
        (e) =>
          e.type === "rolled" &&
          (e.data as { spec: { kind: string; trait?: string } }).spec.trait ===
            "sanity",
      )
      .map((e) => e.data as { figure: string; result: number });

  /** The first seed whose play passes. */
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

  it("opens and closes once per turn", () => {
    let state = holding(["music-box"]);
    expect(labels(state)).toContain("Open the Music Box");
    state = choose(state, "Open the Music Box");
    expect(labels(state)).not.toContain("Close the Music Box");
    expect(labels(state)).not.toContain("Open the Music Box");
  });

  it("while open, an explorer starting a turn in its room makes a Sanity roll of 4+, and on a fail their turn ends", () => {
    const failed = firstSeed(
      (seed) =>
        choose(
          choose(holding(["music-box"], { seed }), "Open the Music Box"),
          "End your turn",
        ),
      (state) => sanityRolls(state)[0]?.result < 4,
    );
    const rolls = sanityRolls(failed);
    expect(rolls[0].figure).toBe(OX_ID);
    // Ox's turn ended at once, so Father Rhinehardt's turn has begun, and he heard it too.
    expect(rolls[1].figure).toBe(FATHER_ID);
    expect(failed.lastEvents.map((e) => e.type)).toContain("turn-cut-short");
  });

  it("an explorer entering its room makes the roll; passing, they carry on", () => {
    const passed = firstSeed(
      (seed) => {
        const state = holding([], { seed });
        explorer(state, OX).cards.push("music-box");
        put(state, OX, "foyer");
        state.cardMarks["music-box"] = { open: { value: true, lasts: "play" } };
        return choose(state, "Move to the Foyer");
      },
      (state) => sanityRolls(state)[0]?.result >= 4,
    );
    expect(sanityRolls(passed)[0].figure).toBe(ZOE_ID);
    expect(pendingDecision(passed).kind).toBe("turn");
    expect(passed.turn?.seat).toBe(ZOE);
  });

  it("a carrier who is mesmerized drops it, and it stays open", () => {
    const failed = firstSeed(
      (seed) => {
        const state = holding(["music-box"], { seed });
        state.cardMarks["music-box"] = { open: { value: true, lasts: "play" } };
        // Carrying the open box into a room is entering the box's room.
        return choose(state, "Move to the Foyer");
      },
      (state) => sanityRolls(state)[0]?.result < 4,
    );
    expect(explorer(failed, ZOE).cards).not.toContain("music-box");
    expect(failed.piles.foyer).toEqual(["music-box"]);
    expect(failed.cardMarks["music-box"]).toEqual({
      open: { value: true, lasts: "play" },
    });
    expect(failed.turn?.seat).toBe(OX);
  });

  it("does nothing while closed", () => {
    const state = holding(["music-box"]);
    const after = choose(state, "End your turn");
    expect(sanityRolls(after)).toEqual([]);
  });
});

describe("Axe (cards/items.md)", () => {
  it("rolls 1 extra die on a Might attack made with it", () => {
    const state = choose(attackOx(holding(["axe"])), "using the Axe");
    // Zoe's Might is 3; Ox defends with his 5 Might, no Axe for him.
    expect(rollsMade(state)).toEqual([
      { figure: ZOE_ID, dice: 4 },
      { figure: OX_ID, dice: 5 },
    ]);
  });
});

describe("Sacrificial Dagger (cards/items.md)", () => {
  const attackWithDagger = (result: number, setUp?: (s: GameState) => void) => {
    const state = holding(["sacrificial-dagger", "angel-feather"]);
    setUp?.(state);
    const next = choose(attackOx(state), "using the Sacrificial Dagger");
    // The Knowledge roll comes first.
    expect(pendingDecision(next).params).toMatchObject({
      spec: { kind: "trait", trait: "knowledge" },
    });
    return choose(next, `the result is ${result}`);
  };

  it("on 6+, the attack goes ahead with 3 extra dice", () => {
    const state = attackWithDagger(6);
    expect(rollsMade(state).slice(1)).toEqual([
      { figure: ZOE_ID, dice: 6 },
      { figure: OX_ID, dice: 5 },
    ]);
  });

  it("never past 8 dice", () => {
    const state = attackWithDagger(
      6,
      (s) => (explorer(s, ZOE).traits.clips.might = 7),
    );
    expect(rollsMade(state)[1]).toEqual({ figure: ZOE_ID, dice: 8 });
  });

  it("on 3-5, you lose 1 from a mental trait, then attack", () => {
    let state = attackWithDagger(4);
    expect(labels(state)).toEqual(["Lose 1 Sanity", "Lose 1 Knowledge"]);
    state = choose(state, "Lose 1 Knowledge");
    expect(explorer(state, ZOE).traits.clips.knowledge).toBe(1);
    expect(eventTypes(state)).toContain("attack-outcome");
  });

  it("on 0-2, you take 2 dice of physical damage and can't attack", () => {
    const state = attackWithDagger(2);
    expect(rollsMade(state)[1]).toEqual({ figure: ZOE_ID, dice: 2 });
    expect(eventTypes(state)).not.toContain("attack-outcome");
  });
});

describe("Blood Dagger (cards/items.md)", () => {
  it("rolls 3 extra dice on a Might attack, and using it costs 1 Speed", () => {
    const state = choose(
      attackOx(holding(["blood-dagger"])),
      "using the Blood Dagger",
    );
    expect(explorer(state, ZOE).traits.clips.speed).toBe(2);
    expect(rollsMade(state)).toEqual([
      { figure: ZOE_ID, dice: 6 },
      { figure: OX_ID, dice: 5 },
    ]);
  });

  it("is optional: attacking without it costs nothing", () => {
    const state = choose(
      attackOx(holding(["blood-dagger"])),
      "Attack with Might",
    );
    expect(explorer(state, ZOE).traits.clips.speed).toBe(3);
  });

  it("can't be traded or dropped", () => {
    const state = holding(["blood-dagger"]);
    expect(labels(state).some((l) => l.includes("Blood Dagger"))).toBe(false);
  });
});

describe("Revolver (cards/items.md)", () => {
  it("attacks with Speed and 1 extra die; the opponent defends with Speed", () => {
    let state = attackOx(holding(["revolver"]));
    expect(labels(state)).toEqual([
      "Attack with Might",
      "Attack with Speed, using the Revolver",
    ]);
    state = choose(state, "using the Revolver");
    // Zoe's Speed is 4, Ox's is 4.
    expect(rollsMade(state)).toEqual([
      { figure: ZOE_ID, dice: 5 },
      { figure: OX_ID, dice: 4 },
    ]);
    const outcome = state.lastEvents.find((e) => e.type === "attack-outcome")
      ?.data as { damage: { kind: string } | null };
    if (outcome.damage) expect(outcome.damage.kind).toBe("physical");
  });
});

describe("Dynamite (cards/items.md)", () => {
  const THROW =
    "Throw the Dynamite into an adjacent room, instead of attacking";
  const armed = (status: GameState["status"]) => {
    const state = holding(["dynamite"]);
    state.status = status;
    put(state, OX, "foyer");
    return state;
  };

  it("takes the place of an attack, so it can't be thrown before the haunt", () => {
    expect(labels(armed("exploring"))).not.toContain(THROW);
  });

  it("is thrown through a door into an adjacent room, where everyone makes a Speed roll, and is discarded", () => {
    // The Foyer is the only room it can go into, so it is thrown there.
    const state = choose(armed("haunt"), THROW);
    expect(rollsMade(state)[0]).toEqual({ figure: OX_ID, dice: 4 });
    expect(explorer(state, ZOE).cards).not.toContain("dynamite");
    expect(state.decks.item.discard).toContain("dynamite");
    expect(state.turn?.attacked).toEqual([ZOE_ID]);
    const result = (
      state.lastEvents.find((e) => e.type === "rolled")?.data as {
        result: number;
      }
    ).result;
    // 0-4: 4 points of physical damage; 5+: none.
    if (result <= 4)
      expect(pendingDecision(state).params).toMatchObject({
        figure: OX_ID,
        amount: 4,
      });
    else expect(eventTypes(state)).not.toContain("damaged");
  });

  it("can't be thrown once the turn's attack is made", () => {
    const state = armed("haunt");
    if (state.turn) state.turn.attacked = [ZOE_ID];
    expect(labels(state)).not.toContain(THROW);
  });
});

describe("Pickpoket's Gloves (cards/items.md)", () => {
  const GLOVES =
    "Discard the Pickpocket's Gloves to take an item from an explorer in your room";
  const withOx = (cards: string[]) => {
    const state = holding(["pickpokets-gloves"]);
    explorer(state, OX).cards.push(...cards);
    return state;
  };

  it("discards the gloves to take an item from an explorer in your room", () => {
    let state = choose(withOx(["axe", "spear", "armor"]), GLOVES);
    // Taking is stealing: not the Armor, which can't be stolen.
    expect(labels(state)).toEqual([
      "Take Ox Bellows's Axe",
      "Take Ox Bellows's Spear",
    ]);
    state = choose(state, "Take Ox Bellows's Axe");
    expect(explorer(state, ZOE).cards).toEqual(["axe"]);
    expect(explorer(state, OX).cards).toEqual(["spear", "armor"]);
    expect(state.decks.item.discard).toContain("pickpokets-gloves");
    // The take is the Axe's one action this turn.
    expect(labels(state).some((l) => l.includes("Axe"))).toBe(false);
  });

  it("can take the Blood Dagger, whose owner takes 2 dice of physical damage", () => {
    // The only thing to take, so it is taken.
    const state = choose(withOx(["blood-dagger"]), GLOVES);
    expect(rollsMade(state)).toEqual([{ figure: OX_ID, dice: 2 }]);
    const taken = state.pending === null ? state : choose(state, "Take");
    expect(explorer(taken, ZOE).cards).toContain("blood-dagger");
  });

  it("isn't offered with nothing to take in your room", () => {
    expect(labels(withOx(["armor"]))).not.toContain(GLOVES);
    const away = withOx(["axe"]);
    put(away, OX, "upper-landing");
    expect(labels(away)).not.toContain(GLOVES);
  });
});
