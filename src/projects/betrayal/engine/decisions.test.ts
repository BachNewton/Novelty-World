import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { checkListedApply } from "../simulation";
import { checkWrite } from "../test/invariants";
import {
  at,
  choose,
  eventTypes,
  explorer,
  give,
  interject,
  offered,
  pendingDecision,
  pile,
  placeTiles,
  put,
  testGame,
  waitingOn,
  type TestGame,
} from "../testing";
import type { GameEvent, GameState, Json, RuleRef } from "../types";
import { placed } from "./board";
import { damage, drawCard } from "./effects";
import { apply } from "./step-loop";

// One targeted scenario for each decision kind the engine raises, and for
// each act of the turn's own decision: the smallest game that raises it, the
// choices it lists checked against what the rules allow there (each listed
// choice applies, and a tempting illegal one is absent), and the rule's
// outcome for an answer. Kinds that other files already cover this way are
// pointed to rather than repeated:
// - the turn's attack, `attack-mode` and `attack-steal`: attack-action.test.ts
//   ("choices match legality in attack states", "the turn's attack") and
//   combat.test.ts ("Stealing Items", "Weapons");
// - the turn's activate and done (a monster turn): monsters.test.ts ("the
//   choices listed on monster turns", "a monster acting");
// - the turn's discover and end: exploration.test.ts ("discovering a room",
//   "the turn", "forced steps and the player's acts");
// - `replace-figure`: 13-perchance-to-dream.test.ts ("unleashing Nightmares");
// - the ready wait, which lists no choices: haunt.test.ts (the reveal's wait).

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const RULE: RuleRef = { source: "rulebook", page: 5 };

const listed = (state: GameState): Json[] =>
  offered(state).map((c) => c.choice);
const labels = (state: GameState) => offered(state).map((c) => c.label);

/** Every listed choice of the pending decision applies. */
function allApply(state: GameState): void {
  checkListedApply(ENGINE, state, waitingOn(state), offered(state));
}

/** Answers the pending decision with this choice, checking the write as
 *  `choose` does. */
function answer(state: GameState, choice: Json): GameState {
  const result = apply(ENGINE, state, {
    kind: "choose",
    decision: pendingDecision(state).id,
    seat: waitingOn(state),
    choice,
  });
  if (!result.ok) throw new Error(`${JSON.stringify(choice)}: ${result.reason}`);
  checkWrite(ENGINE, state, result.state);
  return result.state;
}

function eventOf(state: GameState, type: string): GameEvent {
  const found = state.lastEvents.find((e) => e.type === type);
  if (!found) throw new Error(`No ${type} event`);
  return found;
}

const start = (figure: string) => {
  const traits = ENGINE.catalog.figures[figure].traits;
  if (traits.kind !== "tracks") throw new Error(`${figure} has no tracks`);
  return traits.start;
};

/** Zoe's first turn in the Entrance Hall with Ox and Father Rhinehardt:
 *  Zoe holds the Healing Salve and the Blood Dagger, which can't be traded
 *  or dropped; Ox holds the Lucky Stone; the Axe lies on the floor. Zoe's
 *  and Ox's Might are 1 below their starting values, Ox's Sanity too. */
function hall(options: TestGame = {}): GameState {
  const state = testGame({
    explorers: [
      {
        seat: 0,
        cards: ["healing-salve", "blood-dagger"],
        clips: { might: start(ZOE).might - 1 },
      },
      {
        seat: 1,
        cards: ["lucky-stone"],
        clips: { might: start(OX).might - 1, sanity: start(OX).sanity - 1 },
      },
    ],
    ...options,
  });
  pile(state, "entrance-hall", "axe");
  return state;
}

describe("the turn (rules.md, pp. 6-11)", () => {
  it("lists each move, discovery, action, trade, drop and pickup the rules allow, and ending the turn", () => {
    const state = hall();
    expect(pendingDecision(state).kind).toBe("turn");
    expect(listed(state)).toEqual([
      { act: "move", to: "foyer", side: null },
      // Not the east door: it is the front door, which leads outside.
      { act: "discover", direction: "top" },
      { act: "discover", direction: "bottom" },
      { act: "action", source: "card", id: "healing-salve", action: "use" },
      { act: "trade", with: OX, give: null, take: "lucky-stone" },
      { act: "trade", with: OX, give: "healing-salve", take: null },
      { act: "trade", with: OX, give: "healing-salve", take: "lucky-stone" },
      { act: "trade", with: "father-rhinehardt", give: "healing-salve", take: null },
      { act: "drop", card: "healing-salve" },
      { act: "pickup", card: "axe" },
      { act: "end" },
    ]);
    // The Blood Dagger "can't be traded or dropped" (cards/items.md).
    expect(labels(state).filter((l) => l.includes("Blood Dagger"))).toEqual([]);
    allApply(state);
  });

  it("never lists a move through a wall into a room next door", () => {
    // The Chapel's one door faces the Entrance Hall's north door; the
    // Bathroom beside it opens onto the Foyer, with walls between the two.
    const state = testGame();
    placeTiles(
      state,
      { tile: "chapel", floor: "ground", x: 2, y: -1, rotation: 2 },
      { tile: "bathroom", floor: "ground", x: 1, y: -1, rotation: 0 },
    );
    put(state, 0, "chapel");
    expect(listed(state)).toEqual([
      { act: "move", to: "entrance-hall", side: null },
      { act: "end" },
    ]);
    allApply(state);
    const moved = choose(state, "Move to the Entrance Hall");
    expect(at(moved, 0).room).toBe("entrance-hall");
    expect(moved.turn?.moved).toEqual({ [ZOE]: 1 });
  });

  it("dropping an item uses it for the turn: it can't be picked up again (p. 11)", () => {
    const state = choose(hall(), "Drop the Healing Salve");
    expect(state.piles["entrance-hall"]).toEqual(["axe", "healing-salve"]);
    expect(explorer(state, 0).cards).toEqual(["blood-dagger"]);
    expect(eventOf(state, "card-lost").rule).toEqual({ source: "rulebook", page: 11 });
    const pickups = listed(state).filter(
      (c) => (c as { act: string }).act === "pickup",
    );
    expect(pickups).toEqual([{ act: "pickup", card: "axe" }]);
    allApply(state);
  });

  it("picking an item up uses it for the turn: it can't be dropped or traded again (p. 11)", () => {
    const state = choose(hall(), "Pick up the Axe");
    expect(explorer(state, 0).cards).toEqual(["healing-salve", "blood-dagger", "axe"]);
    expect(state.piles["entrance-hall"]).toBeUndefined();
    expect(labels(state).filter((l) => l.includes("Axe"))).toEqual([]);
    allApply(state);
  });
});

describe("trade-offer (rules.md, p. 11)", () => {
  const offer = () =>
    choose(hall(), "Offer Ox Bellows your Healing Salve for their Lucky Stone");

  it("asks the other explorer to accept or decline", () => {
    const state = offer();
    expect(pendingDecision(state).kind).toBe("trade-offer");
    expect(waitingOn(state)).toBe(1);
    expect(listed(state)).toEqual([true, false]);
    allApply(state);
  });

  it("declined, nothing changes hands, and since both didn't agree the turn's trade isn't spent", () => {
    const state = choose(offer(), "Decline the trade");
    expect(eventOf(state, "trade-declined").rule).toEqual({ source: "rulebook", page: 11 });
    expect(explorer(state, 0).cards).toEqual(["healing-salve", "blood-dagger"]);
    expect(explorer(state, 1).cards).toEqual(["lucky-stone"]);
    expect(waitingOn(state)).toBe(0);
    expect(labels(state)).toContain(
      "Offer Ox Bellows your Healing Salve for their Lucky Stone",
    );
  });
});

describe("rotation (rules.md, p. 9)", () => {
  it("offers only the ways round that put a door against the doorway explored through", () => {
    // The Organ Room's doors are on two neighbouring walls: entering from
    // the south, one of them faces the Entrance Hall, two ways round.
    const state = choose(
      testGame({ stack: ["organ-room"] }),
      "Explore through the north door",
    );
    expect(pendingDecision(state).kind).toBe("rotation");
    const rotations = listed(state) as number[];
    expect(rotations).toHaveLength(2);
    const doors = ENGINE.catalog.rooms["organ-room"].doors;
    const EDGES = ["top", "right", "bottom", "left"] as const;
    for (const rotation of rotations) {
      // A door turned to face south, back to the Entrance Hall.
      const faces = doors.map(
        (d) => EDGES[(EDGES.indexOf(d) + rotation) % 4],
      );
      expect(faces).toContain("bottom");
    }
    allApply(state);
    const after = answer(state, rotations[1]);
    expect(placed(after.board, "organ-room")).toMatchObject({
      floor: "ground",
      x: 2,
      y: -1,
      rotation: rotations[1],
    });
    expect(at(after, 0).room).toBe("organ-room");
    expect(eventOf(after, "discovered").rule).toEqual({ source: "rulebook", page: 6 });
  });
});

describe("choose-one", () => {
  it("the Healing Salve offers each explorer here with Might or Speed below its start, never Sanity (cards/items.md)", () => {
    const state = choose(hall(), "Apply the Healing Salve");
    expect(pendingDecision(state).kind).toBe("choose-one");
    // Not Father Rhinehardt, at his starting values, nor Ox's Sanity: the
    // Salve heals Might and Speed.
    expect(labels(state)).toEqual([
      "Raise Zoe Ingstrom's Might to its starting value",
      "Raise Ox Bellows's Might to its starting value",
    ]);
    expect(listed(state)).toEqual([0, 1]);
    allApply(state);
    const after = choose(state, "Raise Ox Bellows's Might");
    expect(explorer(after, 1).traits.clips.might).toBe(start(OX).might);
    expect(explorer(after, 1).traits.clips.sanity).toBe(start(OX).sanity - 1);
    expect(explorer(after, 0).traits.clips.might).toBe(start(ZOE).might - 1);
    // "Discard this item after you use it."
    expect(after.decks.item.discard).toContain("healing-salve");
    expect(explorer(after, 0).cards).toEqual(["blood-dagger"]);
  });
});

describe("split-damage (rules.md, p. 5)", () => {
  it("lists each different way the damage can land once, on the damage's own traits", () => {
    // Might at its lowest, Speed one above: before the haunt a trait stops at
    // its lowest value (p. 5), so any split putting 2 or more on Speed lands
    // the same way, at the bottom of both.
    const state = testGame({
      explorers: [{ seat: 0, clips: { might: 0, speed: 1 } }],
    });
    const after = interject(ENGINE, state, [
      damage(ZOE, "physical", { points: 3 }, RULE),
    ]);
    expect(pendingDecision(after).kind).toBe("split-damage");
    expect(listed(after)).toEqual([
      { might: 3, speed: 0 },
      { might: 2, speed: 1 },
    ]);
    allApply(after);
    const split = answer(after, { might: 2, speed: 1 });
    expect(explorer(split, 0).traits.clips).toMatchObject({ might: 0, speed: 0 });
    expect(split.figures[ZOE].alive).toBe(true);
    expect(eventOf(split, "damaged")).toMatchObject({
      rule: RULE,
      data: { figure: ZOE, damage: "physical", split: { might: 2, speed: 1 } },
    });
  });
});

describe("damage-kind: the Skull (cards/omens.md)", () => {
  /** Zoe holds the Skull and the Armor, and takes 2 mental damage. */
  const hit = (kind: "physical" | "mental") => {
    const state = testGame();
    give(state, 0, "skull", "armor");
    return interject(ENGINE, state, [damage(ZOE, kind, { points: 2 }, RULE)]);
  };

  it("offers taking mental damage as physical", () => {
    const state = hit("mental");
    expect(pendingDecision(state).kind).toBe("damage-kind");
    expect(listed(state)).toEqual([null, "skull"]);
    allApply(state);
  });

  it("isn't asked of damage that is already physical", () => {
    expect(pendingDecision(hit("physical")).kind).toBe("split-damage");
  });

  it("taken as physical, it is physical in every respect: the Armor takes 1 off it (the card's project ruling)", () => {
    const state = choose(hit("mental"), "Use Skull");
    expect(eventOf(state, "damage-converted")).toMatchObject({
      rule: { source: "card", card: "skull" },
      data: { figure: ZOE, from: "mental", to: "physical" },
    });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { damage: "physical", amount: 1 },
    });
  });

  it("taken as mental, it lands on Sanity and Knowledge in full", () => {
    const state = choose(hit("mental"), "Take 2 mental damage");
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { damage: "mental", amount: 2 },
    });
    expect(listed(state)).toEqual([
      { sanity: 2, knowledge: 0 },
      { sanity: 1, knowledge: 1 },
      { sanity: 0, knowledge: 2 },
    ]);
  });
});

describe("roll-before (rules.md, p. 12; cards/items.md)", () => {
  /** Zoe tries the Puzzle Box, a Knowledge roll, holding the Angel Feather,
   *  the Idol and the Lucky Stone; the item deck holds the Axe and the Revolver. */
  const trying = () =>
    choose(
      testGame({
        explorers: [
          {
            seat: 0,
            cards: ["puzzle-box", "angel-feather", "idol", "lucky-stone"],
          },
        ],
        decks: { item: ["axe", "revolver"] },
      }),
      "Try to open the Puzzle Box",
    );
  const named = (value: number) => ({ card: "angel-feather", option: 0, value });

  it("offers rolling, each result the Angel Feather can name, and the Idol's dice, but not the Lucky Stone's reroll before the dice are thrown", () => {
    const state = trying();
    expect(pendingDecision(state)).toMatchObject({
      kind: "roll-before",
      params: { pool: 3 },
    });
    expect(listed(state)).toEqual([
      { card: null },
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(named),
      { card: "idol", option: 0, value: null },
    ]);
    allApply(state);
  });

  it("a card used on the roll isn't offered again, and its effect stays on the roll", () => {
    const state = choose(trying(), "Use Idol");
    // The Idol costs 1 Sanity each time it is used.
    expect(explorer(state, 0).traits.clips.sanity).toBe(start(ZOE).sanity - 1);
    expect(pendingDecision(state)).toMatchObject({
      kind: "roll-before",
      params: { pool: 5, used: ["idol"] },
    });
    expect(listed(state)).toEqual([
      { card: null },
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(named),
    ]);
    allApply(state);
  });

  it("a named 6 opens the Puzzle Box: two items drawn, the box and the Feather discarded, the Idol kept", () => {
    const state = answer(choose(trying(), "Use Idol"), named(6));
    expect(eventOf(state, "rolled")).toMatchObject({
      rule: { source: "card", card: "puzzle-box" },
      data: { figure: ZOE, dice: [], named: 6, result: 6 },
    });
    expect(explorer(state, 0).cards).toEqual(["idol", "lucky-stone", "axe", "revolver"]);
    expect(state.decks.item.discard).toEqual(
      expect.arrayContaining(["puzzle-box", "angel-feather"]),
    );
  });
});

describe("roll-after (rules.md, p. 12; cards/items.md)", () => {
  /** Zoe tries the Puzzle Box holding the Rabbit's Foot and the Lucky Stone,
   *  which act only once the dice are thrown. */
  const thrown = () =>
    choose(
      testGame({
        explorers: [
          { seat: 0, cards: ["puzzle-box", "rabbits-foot", "lucky-stone"] },
        ],
      }),
      "Try to open the Puzzle Box",
    );
  const dice = (state: GameState) =>
    (pendingDecision(state).params as { dice: number[] }).dice;

  it("offers keeping the result, the Rabbit's Foot's one die, and any of the dice for the Lucky Stone", () => {
    const state = thrown();
    expect(pendingDecision(state).kind).toBe("roll-after");
    const faces = dice(state);
    expect(faces).toHaveLength(3);
    const choices = listed(state) as { card: string | null; faces?: number[] }[];
    expect(choices[0]).toEqual({ card: null });
    const rabbit = choices.filter((c) => c.card === "rabbits-foot");
    // "Reroll 1 die": one per face showing, never two dice.
    expect(rabbit.map((c) => c.faces).sort()).toEqual(
      [...new Set(faces)].sort().map((f) => [f]),
    );
    // "Reroll any number of dice": every different set of faces, once.
    const lucky = choices.filter((c) => c.card === "lucky-stone");
    const counts = [0, 1, 2].map((f) => faces.filter((d) => d === f).length);
    expect(lucky).toHaveLength(counts.reduce((n, c) => n * (c + 1), 1) - 1);
    expect(new Set(lucky.map((c) => JSON.stringify(c.faces))).size).toBe(lucky.length);
    expect(lucky.some((c) => c.faces?.length === 3)).toBe(true);
    expect(choices).toHaveLength(1 + rabbit.length + lucky.length);
    allApply(state);
  });

  it("a reroll keeps the other dice and offers what is left; keeping the result makes the roll", () => {
    let state = thrown();
    const before = dice(state);
    const face = before[0];
    state = answer(state, { card: "rabbits-foot", option: 0, faces: [face] });
    expect(eventOf(state, "card-used")).toMatchObject({
      rule: { source: "card", card: "rabbits-foot" },
    });
    const after = dice(state);
    const kept = [...before];
    kept.splice(kept.indexOf(face), 1);
    expect(after.slice(0, 2)).toEqual(kept);
    expect(after).toHaveLength(3);
    expect(
      (listed(state) as { card: string | null }[]).some(
        (c) => c.card === "rabbits-foot",
      ),
    ).toBe(false);
    allApply(state);
    state = answer(state, { card: null });
    expect(eventOf(state, "rolled")).toMatchObject({
      data: { dice: after, result: after.reduce((a, b) => a + b, 0) },
    });
  });
});

describe("place-tile: What The . . . ? (cards/events.md)", () => {
  /** Zoe stands in the Chapel, north of the Entrance Hall, and draws the
   *  card. The Chapel has one door. */
  const lifted = () => {
    const state = testGame({ decks: { event: ["what-the"] } });
    placeTiles(state, { tile: "chapel", floor: "ground", x: 2, y: -1, rotation: 2 });
    put(state, 0, "chapel");
    return interject(ENGINE, state, [
      drawCard(ZOE, "event", { source: "rulebook", page: 10 }),
    ]);
  };

  it("offers each other free doorway on the floor, door toward it; not its own cell, nor leaving it", () => {
    const state = lifted();
    expect(pendingDecision(state).kind).toBe("place-tile");
    const spots = (listed(state) as ({ x: number; y: number; floor: string } | null)[]).map(
      (c) => (c === null ? null : `${c.floor} ${c.x},${c.y}`),
    );
    expect(spots.sort()).toEqual(["ground 1,-1", "ground 1,1", "ground 2,1"]);
    allApply(state);
  });

  it("moves the room with the explorer in it", () => {
    const state = lifted();
    const to = (listed(state) as { x: number; y: number }[]).find(
      (c) => c.x === 1 && c.y === 1,
    );
    if (!to) throw new Error("No spot south of the Foyer");
    const after = answer(state, to);
    expect(placed(after.board, "chapel")).toMatchObject({ floor: "ground", x: 1, y: 1 });
    expect(at(after, 0).room).toBe("chapel");
    expect(eventOf(after, "room-moved")).toMatchObject({
      rule: { source: "card", card: "what-the" },
      data: { tile: "chapel", from: "ground", floor: "ground" },
    });
    expect(eventTypes(after)).not.toContain("left");
  });
});
