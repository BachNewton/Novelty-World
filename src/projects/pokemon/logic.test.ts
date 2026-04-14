import { describe, it, expect } from "vitest";
import type { GameState, PokemonEntry } from "./types";
import {
  typeSetsEqual,
  evaluateGuess,
  applyGuess,
  advanceToNextPokemon,
  getPlayablePokemon,
  POKEMON_TYPES,
  POKEMON_MAX_LIVES,
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
    lives: POKEMON_MAX_LIVES,
    maxLives: POKEMON_MAX_LIVES,
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
});

describe("evaluateGuess", () => {
  it("is perfect when the guessed set matches exactly", () => {
    const result = evaluateGuess(makeState(), ["poison", "grass"]);
    expect(result).toEqual({ isPerfect: true, missingCount: 0, wrongCount: 0 });
  });

  it("counts one missing when a correct type is omitted", () => {
    const result = evaluateGuess(makeState(), ["grass"]);
    expect(result).toEqual({ isPerfect: false, missingCount: 1, wrongCount: 0 });
  });

  it("counts one wrong when an unrelated type is included", () => {
    const result = evaluateGuess(makeState(), ["grass", "poison", "fire"]);
    expect(result).toEqual({ isPerfect: false, missingCount: 0, wrongCount: 1 });
  });

  it("counts both missing and wrong independently", () => {
    const result = evaluateGuess(makeState(), ["fire"]);
    expect(result).toEqual({ isPerfect: false, missingCount: 2, wrongCount: 1 });
  });
});

describe("applyGuess", () => {
  it("increments score and leaves lives intact on a perfect guess", () => {
    const next = applyGuess(makeState(), ["grass", "poison"]);
    expect(next.phase).toBe("reveal");
    expect(next.score).toBe(1);
    expect(next.lives).toBe(POKEMON_MAX_LIVES);
    expect(next.lastGuessCorrect).toBe(true);
    expect(next.highScore).toBe(1);
    expect(next.revealed?.name).toBe("Bulbasaur");
  });

  it("subtracts one life per missing type", () => {
    const next = applyGuess(makeState(), ["grass"]);
    expect(next.lives).toBe(POKEMON_MAX_LIVES - 1);
    expect(next.score).toBe(0);
    expect(next.lastGuessCorrect).toBe(false);
  });

  it("subtracts one life per wrong type", () => {
    const next = applyGuess(makeState(), ["grass", "poison", "fire"]);
    expect(next.lives).toBe(POKEMON_MAX_LIVES - 1);
    expect(next.lastGuessCorrect).toBe(false);
  });

  it("combines missing and wrong penalties", () => {
    const next = applyGuess(makeState({ lives: 5 }), ["fire"]);
    // missing grass, missing poison, wrong fire → penalty 3
    expect(next.lives).toBe(2);
  });

  it("clamps lives at zero", () => {
    const next = applyGuess(makeState({ lives: 1 }), ["fire", "water"]);
    expect(next.lives).toBe(0);
  });
});

describe("advanceToNextPokemon", () => {
  it("moves to next index and playing phase when lives remain", () => {
    const state = makeState({
      phase: "reveal",
      shuffled: [makeEntry({ id: 1 }), makeEntry({ id: 2 })],
      currentIndex: 0,
      lives: 5,
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
