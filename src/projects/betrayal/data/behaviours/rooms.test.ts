import { describe, expect, it } from "vitest";
import {
  choose,
  eventTypes,
  offered,
  pendingDecision,
  testGame,
} from "../../testing";
import type { FloorId, GameState, Trait } from "../../types";

// Each room's tests come from its content/rooms.md entry, not from its implementation.

/** Zoe, seat 0, standing in a room placed beside a starting tile on one of its floors. */
function standingIn(room: string, floor: FloorId): GameState {
  const state = testGame();
  state.board.tiles.push({ tile: room, floor, x: 0, y: -1, rotation: 0 });
  state.explorers[0].room = room;
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
    const before = state.explorers[0].clips[trait];
    state = choose(state, "End your turn");
    expect(state.explorers[0].clips[trait]).toBe(before + 1);
    expect(state.tokens).toContainEqual({ token: "explorer-yellow", room });
    state = choose(roundTheTable(state), "End your turn");
    expect(state.explorers[0].clips[trait]).toBe(before + 1);
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
    const before = state.explorers[0].clips;
    state = choose(state, `Take 1 ${traits[0]}`);
    const trait = traits[0].toLowerCase() as Trait;
    expect(state.explorers[0].clips[trait]).toBe(before[trait] - 1);
    expect(state.turn?.seat).toBe(1);
  });
});

describe("Medallion (cards/omens.md)", () => {
  it("makes its holder immune to the Crypt", () => {
    let state = standingIn("crypt", "basement");
    state.explorers[0].cards.push("medallion");
    const before = state.explorers[0].clips;
    state = choose(state, "End your turn");
    expect(eventTypes(state)).not.toContain("damaged");
    expect(state.explorers[0].clips).toEqual(before);
    expect(state.turn?.seat).toBe(1);
  });

  it("doesn't protect from the Furnace Room", () => {
    let state = standingIn("furnace-room", "basement");
    state.explorers[0].cards.push("medallion");
    state = choose(state, "End your turn");
    expect(pendingDecision(state).kind).toBe("split-damage");
  });
});

describe("Coal Chute (rooms.md, rules p. 7)", () => {
  it("slides whoever enters it to the Basement Landing, the two together costing 1 space", () => {
    let state = testGame({ stack: ["coal-chute"] });
    state = choose(state, "Explore through the north door");
    expect(state.explorers[0].room).toBe("basement-landing");
    expect(state.turn?.moved).toBe(1);
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
