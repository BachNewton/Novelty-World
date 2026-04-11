import type { HaloMapEntry, GameState } from "./types";
import allMaps from "./data/halo-maps.json";

/** Fisher-Yates shuffle — returns a new array. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Maps that can appear as questions — must have an image, deduplicated by name.
 * Keeps the first occurrence of each name.
 */
export function getPlayableMaps(): HaloMapEntry[] {
  const seen = new Set<string>();
  const result: HaloMapEntry[] = [];
  for (const m of allMaps as HaloMapEntry[]) {
    if (m.imageUrl && !seen.has(m.name)) {
      seen.add(m.name);
      result.push(m);
    }
  }
  return result;
}

/**
 * All unique map names sorted alphabetically — used for combobox options.
 * Includes maps with null images so the full roster is represented.
 */
export function getAllMapNames(): string[] {
  const names = new Set<string>();
  for (const m of allMaps as HaloMapEntry[]) {
    names.add(m.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function createInitialState(highScore: number): GameState {
  return {
    phase: "idle",
    shuffledMaps: shuffleArray(getPlayableMaps()),
    currentIndex: 0,
    score: 0,
    lives: 3,
    maxLives: 3,
    highScore,
    lastGuessCorrect: null,
    correctAnswer: null,
    sourceGame: null,
  };
}

export function checkGuess(state: GameState, guess: string): boolean {
  const current = state.shuffledMaps[state.currentIndex];
  return current.name.toLowerCase().trim() === guess.toLowerCase().trim();
}

export function applyCorrectGuess(state: GameState): GameState {
  const current = state.shuffledMaps[state.currentIndex];
  const newScore = state.score + 1;
  return {
    ...state,
    phase: "reveal",
    score: newScore,
    highScore: Math.max(newScore, state.highScore),
    lastGuessCorrect: true,
    correctAnswer: current.name,
    sourceGame: current.sourceGame,
  };
}

export function applyWrongGuess(state: GameState): GameState {
  const current = state.shuffledMaps[state.currentIndex];
  const newLives = state.lives - 1;
  return {
    ...state,
    phase: newLives <= 0 ? "game-over" : "reveal",
    lives: newLives,
    lastGuessCorrect: false,
    correctAnswer: current.name,
    sourceGame: current.sourceGame,
    highScore: Math.max(state.score, state.highScore),
  };
}

export function advanceToNextMap(state: GameState): GameState {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.shuffledMaps.length) {
    return { ...state, phase: "game-over", correctAnswer: null, sourceGame: null };
  }
  return {
    ...state,
    phase: "playing",
    currentIndex: nextIndex,
    lastGuessCorrect: null,
    correctAnswer: null,
    sourceGame: null,
  };
}

export function restartGame(state: GameState): GameState {
  return createInitialState(state.highScore);
}
