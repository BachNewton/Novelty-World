import type { PokemonEntry, GameState } from "./types";
import allPokemon from "./data/pokemon.json";
import { shuffleArray } from "@/shared/trivia";

/**
 * The 18 canonical Pokemon types, ordered to roughly group related types
 * together for the selector grid.
 */
export const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "grass",
  "electric",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function getPlayablePokemon(
  selectedGenerations?: readonly number[],
): PokemonEntry[] {
  const genSet = selectedGenerations ? new Set(selectedGenerations) : null;
  const result: PokemonEntry[] = [];
  for (const p of allPokemon as PokemonEntry[]) {
    if (genSet && !genSet.has(p.generation)) continue;
    result.push(p);
  }
  return result;
}

export function createInitialState(
  selectedGenerations: number[],
  highScore: number,
): GameState {
  return {
    phase: "idle",
    selectedGenerations,
    shuffled: shuffleArray(getPlayablePokemon(selectedGenerations)),
    currentIndex: 0,
    score: 0,
    lives: 3,
    maxLives: 3,
    highScore,
    lastGuessCorrect: null,
    revealed: null,
  };
}

/** Compare two type arrays as unordered sets (case-insensitive). */
export function typeSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const normalized = new Set(b.map((t) => t.toLowerCase()));
  return a.every((t) => normalized.has(t.toLowerCase()));
}

export function checkGuess(state: GameState, guess: readonly string[]): boolean {
  const current = state.shuffled[state.currentIndex];
  return typeSetsEqual(current.types, guess);
}

export function applyCorrectGuess(state: GameState): GameState {
  const current = state.shuffled[state.currentIndex];
  const newScore = state.score + 1;
  return {
    ...state,
    phase: "reveal",
    score: newScore,
    highScore: Math.max(newScore, state.highScore),
    lastGuessCorrect: true,
    revealed: current,
  };
}

export function applyWrongGuess(state: GameState): GameState {
  const current = state.shuffled[state.currentIndex];
  return {
    ...state,
    phase: "reveal",
    lives: state.lives - 1,
    lastGuessCorrect: false,
    revealed: current,
    highScore: Math.max(state.score, state.highScore),
  };
}

export function advanceToNextPokemon(state: GameState): GameState {
  if (state.lives <= 0) {
    return { ...state, phase: "game-over", revealed: null };
  }
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.shuffled.length) {
    return { ...state, phase: "game-over", revealed: null };
  }
  return {
    ...state,
    phase: "playing",
    currentIndex: nextIndex,
    lastGuessCorrect: null,
    revealed: null,
  };
}

export function restartGame(state: GameState): GameState {
  return createInitialState(state.selectedGenerations, state.highScore);
}
