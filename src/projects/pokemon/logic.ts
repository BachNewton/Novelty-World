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

export const POKEMON_MAX_LIVES = 10;

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
    lives: POKEMON_MAX_LIVES,
    maxLives: POKEMON_MAX_LIVES,
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

export interface GuessEvaluation {
  isPerfect: boolean;
  /** Correct types the player failed to select. */
  missingCount: number;
  /** Selected types the Pokemon doesn't actually have. */
  wrongCount: number;
}

export function evaluateGuess(
  state: GameState,
  guess: readonly string[],
): GuessEvaluation {
  const current = state.shuffled[state.currentIndex];
  const correct = new Set(current.types.map((t) => t.toLowerCase()));
  const picked = new Set(guess.map((t) => t.toLowerCase()));
  let missingCount = 0;
  let wrongCount = 0;
  for (const t of correct) if (!picked.has(t)) missingCount++;
  for (const t of picked) if (!correct.has(t)) wrongCount++;
  return {
    isPerfect: missingCount === 0 && wrongCount === 0,
    missingCount,
    wrongCount,
  };
}

/**
 * Apply a guess with graduated penalty: the player loses one heart per
 * missing type (correct answer not selected) plus one per wrong type
 * (selected type the Pokemon doesn't have). Score only advances on a
 * perfect guess.
 */
export function applyGuess(
  state: GameState,
  guess: readonly string[],
): GameState {
  const current = state.shuffled[state.currentIndex];
  const result = evaluateGuess(state, guess);
  const penalty = result.missingCount + result.wrongCount;
  const newLives = Math.max(0, state.lives - penalty);
  const newScore = result.isPerfect ? state.score + 1 : state.score;
  return {
    ...state,
    phase: "reveal",
    lives: newLives,
    score: newScore,
    highScore: Math.max(newScore, state.highScore),
    lastGuessCorrect: result.isPerfect,
    revealed: current,
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
