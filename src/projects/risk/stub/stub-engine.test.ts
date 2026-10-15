import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { GameState, Move, Options } from "../contract";
import { STUB_SCENES } from "./scenes";
import { stubEngine } from "./stub-engine";

function one<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/** Some move the options allow, picked at random. */
function anyMove(options: Options, random: () => number): Move {
  switch (options.kind) {
    case "setup-place":
      return { kind: "place", territory: one(options.ownTerritories, random), armies: 1 };
    case "reinforce":
      if (!options.mayPlace) return { kind: "trade", cards: one(options.sets, random) };
      return { kind: "place", territory: one(options.ownTerritories, random), armies: options.armiesToPlace };
    case "attack": {
      if (options.attacks.length === 0 || random() < 0.1) return { kind: "end-attack" };
      const attack = one(options.attacks, random);
      return { kind: "blitz", from: attack.from, to: attack.to, keepAtLeast: 1 };
    }
    case "occupy":
      return { kind: "occupy", armies: options.max };
    case "fortify":
      return { kind: "end-turn" };
  }
}

describe("the stand-in engine", () => {
  it("accepts every move its options offer, through a game's first hundreds of moves", () => {
    const random = createRng("stub").next;
    let state: GameState = stubEngine.newGame({ players: 4 }, "stub-test").state;
    for (let i = 0; i < 600; i++) {
      const view = stubEngine.view(state, null);
      const options = stubEngine.options(state, view.active);
      if (options === null) break;
      const result = stubEngine.apply(state, view.active, anyMove(options, random));
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
  });

  it("has a scene for each phase, each with something to do", () => {
    for (const scene of STUB_SCENES) {
      const { state } = scene.start();
      const view = stubEngine.view(state, null);
      if (view.phase !== "game-over") expect(stubEngine.options(state, view.active), scene.id).not.toBeNull();
    }
    expect(new Set(STUB_SCENES.map((scene) => stubEngine.view(scene.start().state, null).phase))).toEqual(new Set(["setup-place", "reinforce", "attack", "fortify", "game-over"]));
  });
});
