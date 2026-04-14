import { describe, it, expect } from "vitest";
import type { GameState, PokemonEntry } from "./types";
import {
  typeSetsEqual,
  checkGuess,
  applyCorrectGuess,
  applyWrongGuess,
  advanceToNextPokemon,
  getPlayablePokemon,
  POKEMON_TYPES,
} from "./logic";

function makeEntry(overrides: Partial<PokemonEntry> = {}): PokemonEntry {
  return {
    id: 1,
    name: "Bulbasaur",
    types: ["grass", "poison"],
    generation: 1,
    spriteUrl: "https://example.com/1.png",
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "playing",
    selectedGenerations: [1],
    shuffled: [makeEntry()],
    currentIndex: 0,
    score: 0,
    lives: 3,
    maxLives: 3,
    highScore: 0,
    lastGuessCorrect: null,
    revealed: null,
    ...overrides,
  };
}

describe("typeSetsEqual", () => {
  it("returns true for identical sets", () => {
    expect(typeSetsEqual(["grass", "poison"], ["grass", "poison"])).toBe(true);
  });

  it("is order-insensitive", () => {
    expect(typeSetsEqual(["grass", "poison"], ["poison", "grass"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(typeSetsEqual(["Grass", "POISON"], ["grass", "poison"])).toBe(true);
  });

  it("rejects different lengths", () => {
    expect(typeSetsEqual(["grass"], ["grass", "poison"])).toBe(false);
  });

  it("rejects different types of same length", () => {
    expect(typeSetsEqual(["grass", "poison"], ["grass", "fire"])).toBe(false);
  });

  it("handles single-type comparisons", () => {
    expect(typeSetsEqual(["fire"], ["fire"])).toBe(true);
    expect(typeSetsEqual(["fire"], ["water"])).toBe(false);
  });
});

describe("checkGuess", () => {
  it("is correct when the guessed set matches", () => {
    const state = makeState();
    expect(checkGuess(state, ["poison", "grass"])).toBe(true);
  });

  it("is wrong when a type is missing", () => {
    const state = makeState();
    expect(checkGuess(state, ["grass"])).toBe(false);
  });

  it("is wrong when an extra type is present", () => {
    const state = makeState();
    expect(checkGuess(state, ["grass", "poison", "fire"])).toBe(false);
  });
});

describe("applyCorrectGuess", () => {
  it("increments score and enters reveal", () => {
    const state = makeState();
    const next = applyCorrectGuess(state);
    expect(next.phase).toBe("reveal");
    expect(next.score).toBe(1);
    expect(next.lastGuessCorrect).toBe(true);
    expect(next.revealed?.name).toBe("Bulbasaur");
    expect(next.highScore).toBe(1);
  });

  it("leaves lives unchanged", () => {
    const state = makeState({ lives: 3 });
    expect(applyCorrectGuess(state).lives).toBe(3);
  });
});

describe("applyWrongGuess", () => {
  it("decrements lives and enters reveal", () => {
    const state = makeState({ lives: 3 });
    const next = applyWrongGuess(state);
    expect(next.phase).toBe("reveal");
    expect(next.lives).toBe(2);
    expect(next.lastGuessCorrect).toBe(false);
    expect(next.score).toBe(0);
  });
});

describe("advanceToNextPokemon", () => {
  it("moves to next index and playing phase when lives remain", () => {
    const state = makeState({
      phase: "reveal",
      shuffled: [makeEntry({ id: 1 }), makeEntry({ id: 2 })],
      currentIndex: 0,
      lives: 2,
    });
    const next = advanceToNextPokemon(state);
    expect(next.phase).toBe("playing");
    expect(next.currentIndex).toBe(1);
    expect(next.revealed).toBe(null);
  });

  it("ends the game when lives hit zero", () => {
    const state = makeState({ phase: "reveal", lives: 0 });
    expect(advanceToNextPokemon(state).phase).toBe("game-over");
  });

  it("ends the game when all Pokemon are exhausted", () => {
    const state = makeState({
      phase: "reveal",
      shuffled: [makeEntry()],
      currentIndex: 0,
      lives: 3,
    });
    expect(advanceToNextPokemon(state).phase).toBe("game-over");
  });
});

describe("getPlayablePokemon", () => {
  it("filters by generation when provided", () => {
    const gen1 = getPlayablePokemon([1]);
    expect(gen1.length).toBeGreaterThan(0);
    expect(gen1.every((p) => p.generation === 1)).toBe(true);
  });

  it("returns all Pokemon when no filter", () => {
    const all = getPlayablePokemon();
    expect(all.length).toBeGreaterThan(1000);
  });

  it("returns an empty set for an unknown generation", () => {
    expect(getPlayablePokemon([99])).toEqual([]);
  });
});

describe("POKEMON_TYPES", () => {
  it("contains exactly 18 unique types", () => {
    expect(POKEMON_TYPES).toHaveLength(18);
    expect(new Set(POKEMON_TYPES).size).toBe(18);
  });
});
