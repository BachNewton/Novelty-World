import type { HaloMapEntry, GameState } from "./types";
import allMaps from "./data/halo-maps.json";
import { shuffleArray } from "@/shared/trivia";

/** All distinct source game titles, sorted alphabetically. */
export function getSourceGames(): string[] {
  const games = new Set<string>();
  for (const m of allMaps as HaloMapEntry[]) {
    games.add(m.sourceGame);
  }
  return [...games].sort((a, b) => a.localeCompare(b));
}

/**
 * Maps that can appear as questions — must have an image, deduplicated by name.
 * When `selectedGames` is provided, only maps from those games are included.
 */
export function getPlayableMaps(selectedGames?: string[]): HaloMapEntry[] {
  const gameSet = selectedGames ? new Set(selectedGames) : null;
  const seen = new Set<string>();
  const result: HaloMapEntry[] = [];
  for (const m of allMaps as HaloMapEntry[]) {
    if (!m.imageUrl) continue;
    if (gameSet && !gameSet.has(m.sourceGame)) continue;
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    result.push(m);
  }
  return result;
}

/**
 * All unique map names sorted alphabetically — used for combobox options.
 * Includes maps with null images so the full roster is represented.
 * When `selectedGames` is provided, only names from those games are included.
 */
export function getAllMapNames(selectedGames?: string[]): string[] {
  const gameSet = selectedGames ? new Set(selectedGames) : null;
  const names = new Set<string>();
  for (const m of allMaps as HaloMapEntry[]) {
    if (gameSet && !gameSet.has(m.sourceGame)) continue;
    names.add(m.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function createInitialState(
  selectedGames: string[],
  highScore: number,
): GameState {
  return {
    phase: "idle",
    selectedGames,
    shuffledMaps: shuffleArray(getPlayableMaps(selectedGames)),
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
    phase: "reveal",
    lives: newLives,
    lastGuessCorrect: false,
    correctAnswer: current.name,
    sourceGame: current.sourceGame,
    highScore: Math.max(state.score, state.highScore),
  };
}

export function advanceToNextMap(state: GameState): GameState {
  if (state.lives <= 0) {
    return { ...state, phase: "game-over", correctAnswer: null, sourceGame: null };
  }
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
  return createInitialState(state.selectedGames, state.highScore);
}
