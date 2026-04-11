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

/**
 * Build a deterministic storage key for a set of selected games.
 * Sorted so the same selection always produces the same key.
 */
export function highScoreKey(selectedGames: string[]): string {
  const sorted = [...selectedGames].sort((a, b) => a.localeCompare(b));
  return `highScore:${sorted.join(",")}`;
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
  return createInitialState(state.selectedGames, state.highScore);
}
