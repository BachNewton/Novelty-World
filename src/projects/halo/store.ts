"use client";

import { create } from "zustand";
import type { GameState } from "./types";
import {
  createInitialState,
  getSourceGames,
  checkGuess,
  applyCorrectGuess,
  applyWrongGuess,
  advanceToNextMap,
  restartGame,
} from "./logic";
import { getProjectStorage } from "@/shared/lib/storage";
import { highScoreKey } from "@/shared/trivia";

const storage = getProjectStorage("halo");

function loadHighScore(selectedGames: string[]): number {
  return storage.get<number>(highScoreKey(selectedGames)) ?? 0;
}

function saveHighScore(selectedGames: string[], score: number): void {
  storage.set(highScoreKey(selectedGames), score);
}

const allGames = getSourceGames();

interface HaloActions {
  toggleGame: (game: string) => void;
  selectAllGames: () => void;
  deselectAllGames: () => void;
  startGame: () => void;
  submitGuess: (guess: string) => void;
  advance: () => void;
  playAgain: () => void;
  reset: () => void;
}

export type HaloStore = GameState & HaloActions;

export const useHaloStore = create<HaloStore>((set, get) => ({
  ...createInitialState(allGames, loadHighScore(allGames)),

  toggleGame: (game: string) => {
    const { selectedGames } = get();
    const next = selectedGames.includes(game)
      ? selectedGames.filter((g) => g !== game)
      : [...selectedGames, game];
    set({ selectedGames: next, highScore: loadHighScore(next) });
  },

  selectAllGames: () => {
    set({ selectedGames: allGames, highScore: loadHighScore(allGames) });
  },

  deselectAllGames: () => {
    set({ selectedGames: [], highScore: 0 });
  },

  startGame: () => {
    const { selectedGames } = get();
    set({
      ...createInitialState(selectedGames, loadHighScore(selectedGames)),
      phase: "playing",
    });
  },

  submitGuess: (guess: string) => {
    const state = get();
    if (state.phase !== "playing") return;

    const isCorrect = checkGuess(state, guess);
    const newState = isCorrect
      ? applyCorrectGuess(state)
      : applyWrongGuess(state);
    saveHighScore(state.selectedGames, newState.highScore);
    set(newState);
  },

  advance: () => {
    const state = get();
    if (state.phase !== "reveal") return;
    set(advanceToNextMap(state));
  },

  playAgain: () => {
    const state = get();
    set({
      ...restartGame(state),
      phase: "playing",
    });
  },

  reset: () => {
    set(createInitialState(allGames, loadHighScore(allGames)));
  },
}));
