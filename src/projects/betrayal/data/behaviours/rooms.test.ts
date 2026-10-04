import { describe, expect, it } from "vitest";
import { neighbourCell, placed } from "../../engine/board";
import { relocate } from "../../engine/effects";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import {
  at,
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  testGame,
} from "../../testing";
import type { FloorId, GameState, Trait } from "../../types";

// Each room's tests come from its content/rooms.md entry, not from its implementation.

const ZOE = "zoe-ingstrom";

/** Zoe, seat 0, standing in a room placed beside a starting tile on one of its floors. */
function standingIn(room: string, floor: FloorId): GameState {
  const state = testGame();
  state.board.tiles.push({ tile: room, floor, x: 0, y: -1, rotation: 0 });
  put(state, 0, room);
  return state;
}

/** Ends seat 0's turn, then the other two seats', back round to seat 0. */
function roundTheTable(state: GameState): GameState {
  return choose(choose(state, "End your turn"), "End your turn");
}

describe.each<[string, FloorId, Trait]>([
  ["gymnasium", "basement", "speed"],
  ["chapel", "ground", "sanity"],
  ["library", "ground", "knowledge"],
])("%s (rooms.md)", (room, floor, trait) => {
  it(`gains 1 ${trait} for ending a turn there, once per game for each explorer`, () => {
    let state = standingIn(room, floor);
    const before = explorer(state, 0).traits.clips[trait];
    state = choose(state, "End your turn");
    expect(explorer(state, 0).traits.clips[trait]).toBe(before + 1);
    expect(state.tokens).toContainEqual({ token: "explorer-yellow", room });
    state = choose(roundTheTable(state), "End your turn");
    expect(explorer(state, 0).traits.clips[trait]).toBe(before + 1);
  });
});

describe.each<[string, "physical" | "mental", string[]]>([
  ["crypt", "mental", ["Sanity", "Knowledge"]],
  ["furnace-room", "physical", ["Might", "Speed"]],
])("%s (rooms.md)", (room, kind, traits) => {
  it(`deals 1 point of ${kind} damage for ending a turn there`, () => {
    let state = standingIn(room, "basement");
    state = choose(state, "End your turn");
    expect(pendingDecision(state).kind).toBe("split-damage");
    expect(offered(state).map((c) => c.label)).toEqual([
      `Take 1 ${traits[0]} and 0 ${traits[1]}`,
      `Take 0 ${traits[0]} and 1 ${traits[1]}`,
    ]);
    const before = explorer(state, 0).traits.clips;
    state = choose(state, `Take 1 ${traits[0]}`);
    const trait = traits[0].toLowerCase() as Trait;
    expect(explorer(state, 0).traits.clips[trait]).toBe(before[trait] - 1);
    expect(state.turn?.seat).toBe(1);
  });
});

describe("Medallion (cards/omens.md)", () => {
  it("makes its holder immune to the Crypt", () => {
    let state = standingIn("crypt", "basement");
    explorer(state, 0).cards.push("medallion");
    const before = explorer(state, 0).traits.clips;
    state = choose(state, "End your turn");
    expect(eventTypes(state)).not.toContain("damaged");
    expect(explorer(state, 0).traits.clips).toEqual(before);
    expect(state.turn?.seat).toBe(1);
  });

  it("doesn't protect from the Furnace Room", () => {
    let state = standingIn("furnace-room", "basement");
    explorer(state, 0).cards.push("medallion");
    state = choose(state, "End your turn");
    expect(pendingDecision(state).kind).toBe("split-damage");
  });
});

describe("Coal Chute (rooms.md, rules p. 7)", () => {
  it("slides whoever enters it to the Basement Landing, the two together costing 1 space", () => {
    let state = testGame({ stack: ["coal-chute"] });
    state = choose(state, "Explore through the north door");
    expect(at(state, 0).room).toBe("basement-landing");
    expect(state.turn?.moved).toEqual({ [ZOE]: 1 });
    expect(
      state.lastEvents
        .filter((e) => e.type === "entered")
        .map((e) => (e.data as { room: string }).room),
    ).toEqual(["coal-chute", "basement-landing"]);
    // Movement goes on from the Basement Landing.
    expect(offered(state).map((c) => c.label)).toContain(
      "Explore through the north door of the Basement Landing",
    );
  });
});

describe.each<[string, FloorId, Trait, number, Trait]>([
  ["junk-room", "ground", "might", 3, "speed"],
  ["attic", "upper", "speed", 3, "might"],
  ["graveyard", "ground", "sanity", 4, "knowledge"],
  ["pentagram-chamber", "basement", "knowledge", 4, "sanity"],
])("%s (rooms.md)", (room, floor, trait, target, loss) => {
  /** Zoe holds the Angel Feather, which names the roll's result, and a card puts her in the Entrance Hall. */
  function leaving(): GameState {
    const state = standingIn(room, floor);
    explorer(state, 0).cards.push("angel-feather");
    return start(ENGINE, { ...state, pending: null }, [
      relocate(ZOE, "entrance-hall", { source: "card", card: "bottle" }),
    ]);
  }

  it(`makes a ${trait} roll of ${target}+ to leave, even when an effect moves you out`, () => {
    let state = leaving();
    expect(pendingDecision(state).params).toMatchObject({
      spec: { kind: "trait", trait },
    });
    const before = explorer(state, 0).traits.clips;
    state = choose(state, `the result is ${target}`);
    expect(at(state, 0).room).toBe("entrance-hall");
    expect(explorer(state, 0).traits.clips).toEqual(before);
  });

  it(`on a failure, loses 1 ${loss} and still leaves`, () => {
    let state = choose(leaving(), `the result is ${target - 1}`);
    expect(at(state, 0).room).toBe(room);
    const before = explorer(state, 0).traits.clips[loss];
    state = choose(state, "and keep going");
    expect(explorer(state, 0).traits.clips[loss]).toBe(before - 1);
    expect(at(state, 0).room).toBe("entrance-hall");
  });

  it("on a failure, may stay in the room instead, without the loss (official ruling)", () => {
    let state = choose(leaving(), `the result is ${target - 1}`);
    const before = explorer(state, 0).traits.clips;
    state = choose(state, "Stay in the");
    expect(at(state, 0).room).toBe(room);
    expect(explorer(state, 0).traits.clips).toEqual(before);
    expect(eventTypes(state)).toContain("stayed");
  });
});

describe("Junk Room (rooms.md, rules p. 7)", () => {
  /** Zoe in the Junk Room, which is north of the Entrance Hall, holding the
   *  Angel Feather, and the Axe, which she could drop, so her turn never ends by itself. */
  function inJunkRoom(): GameState {
    const state = testGame();
    const hall = placed(state.board, "entrance-hall");
    if (!hall) throw new Error("No Entrance Hall");
    state.board.tiles.push({
      tile: "junk-room",
      floor: "ground",
      ...neighbourCell(hall, "top"),
      rotation: 0,
    });
    put(state, 0, "junk-room");
    explorer(state, 0).cards.push("angel-feather", "axe");
    state.decks.item.draw = state.decks.item.draw.filter((c) => c !== "axe");
    return state;
  }

  it("rolls before a move out of it", () => {
    let state = choose(inJunkRoom(), "Move to the Entrance Hall");
    expect(pendingDecision(state).kind).toBe("roll-before");
    state = choose(state, "the result is 3");
    expect(at(state, 0).room).toBe("entrance-hall");
    expect(state.turn?.moved).toEqual({ [ZOE]: 1 });
  });

  it("an explorer who stays tries again on a later turn: no more movement this turn", () => {
    let state = choose(inJunkRoom(), "Move to the Entrance Hall");
    state = choose(choose(state, "the result is 2"), "Stay in the Junk Room");
    expect(at(state, 0).room).toBe("junk-room");
    expect(state.turn?.moved).toEqual({});
    const labels = offered(state).map((c) => c.label);
    expect(labels.some((l) => l.startsWith("Move to"))).toBe(false);
    expect(labels.some((l) => l.startsWith("Explore"))).toBe(false);
    expect(labels).toContain("End your turn");
  });

  it("still lets you out when the Speed it costs leaves no movement (p. 7)", () => {
    const state = inJunkRoom();
    if (!state.turn) throw new Error("No turn");
    // Speed 5, with 4 spaces moved: the loss brings it to 4, under the 5 spaces this move makes.
    explorer(state, 0).traits.clips.speed = 4;
    state.turn.moved = { [ZOE]: 4 };
    const out = choose(
      choose(choose(state, "Move to the Entrance Hall"), "the result is 0"),
      "Lose 1 Speed",
    );
    expect(at(out, 0).room).toBe("entrance-hall");
    expect(out.turn?.moved).toEqual({ [ZOE]: 5 });
  });
});

describe("Medallion and leaving (cards/omens.md)", () => {
  it("leaves the Graveyard without a roll", () => {
    const state = standingIn("graveyard", "ground");
    explorer(state, 0).cards.push("medallion");
    const after = start(ENGINE, { ...state, pending: null }, [
      relocate(ZOE, "entrance-hall", { source: "card", card: "bottle" }),
    ]);
    expect(eventTypes(after)).not.toContain("rolled");
    expect(at(after, 0).room).toBe("entrance-hall");
  });
});
