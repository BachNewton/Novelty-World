import { describe, expect, it } from "vitest";
import type { GameState } from "../contract";
import type { TerritoryId } from "../map";
import { referenceEngine as engine } from ".";
import { play, position } from "./test-kit";

const armies = (state: GameState, t: TerritoryId) => engine.view(state, null).territories[t].armies;

/** Seat 0 holds a chain Japan, Kamchatka, Alaska, Alberta, and Siam on its own; seat 1 holds
 *  Mongolia, seat 2 the rest. */
const chain = () =>
  position({
    phase: "fortify",
    board: {
      japan: [0, 5],
      kamchatka: [0, 1],
      alaska: [0, 1],
      alberta: [0, 1],
      siam: [0, 3],
      mongolia: [1, 1],
    },
  });

describe("fortify", () => {
  it("FORT-1: one move to any owned territory joined through the player's own", () => {
    const state = chain();
    const options = engine.options(state, 0);
    if (options?.kind !== "fortify") throw new Error("not fortifying");
    const fromJapan = options.moves.filter((m) => m.from === "japan").map((m) => m.to);
    expect(fromJapan.sort()).toEqual(["alaska", "alberta", "kamchatka"]);
    expect(engine.apply(state, 0, { kind: "fortify", from: "japan", to: "siam", armies: 1 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "fortify", from: "japan", to: "mongolia", armies: 1 }).ok).toBe(false);
    const moved = play(engine, state, 0, { kind: "fortify", from: "japan", to: "alberta", armies: 4 });
    expect(moved.events[0]).toEqual({ rule: "FORT-1", kind: "fortified", from: "japan", to: "alberta", armies: 4 });
    expect([armies(moved.state, "japan"), armies(moved.state, "alberta")]).toEqual([1, 5]);
  });

  it("FORT-1: at least 1 army stays behind", () => {
    const state = chain();
    expect(engine.apply(state, 0, { kind: "fortify", from: "japan", to: "kamchatka", armies: 5 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "fortify", from: "japan", to: "kamchatka", armies: 0 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "fortify", from: "kamchatka", to: "japan", armies: 1 }).ok).toBe(false);
  });

  it("FORT-3: a fortify, or skipping it, ends the turn", () => {
    for (const move of [{ kind: "fortify", from: "japan", to: "alaska", armies: 1 }, { kind: "end-turn" }] as const) {
      const result = play(engine, chain(), 0, move);
      expect(engine.view(result.state, null)).toMatchObject({ active: 1, turn: 2, phase: "reinforce" });
      expect(result.events).toContainEqual({ rule: "TURN-2", kind: "turn-started", seat: 1, turn: 2 });
    }
  });
});

describe("turn structure", () => {
  it("TURN-1: no attack while fortifying, no fortify while attacking", () => {
    expect(engine.apply(chain(), 0, { kind: "attack", from: "siam", to: "china", dice: 1 }).ok).toBe(false);
    const attacking = position({ phase: "attack", board: { japan: [0, 5], kamchatka: [0, 1] } });
    expect(engine.apply(attacking, 0, { kind: "fortify", from: "japan", to: "kamchatka", armies: 1 }).ok).toBe(false);
    expect(engine.apply(attacking, 0, { kind: "end-turn" }).ok).toBe(false);
  });

  it("TURN-1: the order is reinforce, attack, fortify; a phase with nothing to do but end it is ended by the engine", () => {
    // Seat 0 holds Australia, 1 army each. Its 5 reinforcements (3, and 2 for Australia, REINF-3)
    // on Eastern Australia, which borders only its own territories, leave no attack, so the
    // engine ends the attack phase and waits in the fortify phase, where Eastern Australia can move.
    const state = position({
      board: { indonesia: [0, 1], "new-guinea": [0, 1], "western-australia": [0, 1], "eastern-australia": [0, 1] },
    });
    const placed = play(engine, state, 0, { kind: "place", territory: "eastern-australia", armies: 5 });
    const phases = placed.events.flatMap((e) => (e.kind === "phase" ? [e.phase] : []));
    expect(phases).toEqual(["attack", "fortify"]);
    expect(engine.view(placed.state, null)).toMatchObject({ phase: "fortify", active: 0 });

    // With nothing to fortify either, the turn passes.
    const thin = position({ phase: "attack", board: { japan: [0, 1] } });
    const ended = play(engine, thin, 0, { kind: "end-attack" });
    expect(engine.view(ended.state, null)).toMatchObject({ active: 1, phase: "reinforce" });
  });

  it("TURN-2: turns pass round the seat order", () => {
    let state = position({ phase: "fortify", board: { japan: [0, 1], siam: [1, 1] } });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const v = engine.view(state, null);
      seen.push(v.active);
      // Place everything, then end the attack and the turn.
      if (v.phase === "reinforce") {
        const options = engine.options(state, v.active);
        if (options?.kind !== "reinforce") throw new Error("not reinforcing");
        state = play(engine, state, v.active, { kind: "place", territory: options.ownTerritories[0], armies: options.armiesToPlace }).state;
        if (engine.view(state, null).phase === "attack") state = play(engine, state, v.active, { kind: "end-attack" }).state;
      }
      if (engine.view(state, null).phase === "fortify") state = play(engine, state, v.active, { kind: "end-turn" }).state;
    }
    expect(seen).toEqual([0, 1, 2, 0]);
  });
});
