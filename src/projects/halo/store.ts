"use client";

import { create } from "zustand";
import type { GameState } from "./types";
import {
  createInitialState,
  checkGuess,
  applyCorrectGuess,
  applyWrongGuess,
  advanceToNextMap,
  restartGame,
} from "./logic";
import { getProjectStorage } from "@/shared/lib/storage";

const storage = getProjectStorage("halo");
const HIGHSCORE_KEY = "highScore";

function loadHighScore(): number {
  return storage.get<number>(HIGHSCORE_KEY) ?? 0;
}

function saveHighScore(score: number): void {
  storage.set(HIGHSCORE_KEY, score);
}

interface HaloActions {
  startGame: () => void;
  submitGuess: (guess: string) => void;
  advance: () => void;
  playAgain: () => void;
  reset: () => void;
}

export type HaloStore = GameState & HaloActions;

export const useHaloStore = create<HaloStore>((set, get) => ({
  ...createInitialState(loadHighScore()),

  startGame: () => {
    set({ ...createInitialState(loadHighScore()), phase: "playing" });
  },

  submitGuess: (guess: string) => {
    const state = get();
    if (state.phase !== "playing") return;

    const isCorrect = checkGuess(state, guess);
    const newState = isCorrect
      ? applyCorrectGuess(state)
      : applyWrongGuess(state);
    saveHighScore(newState.highScore);
    set(newState);
  },

  advance: () => {
    const state = get();
    if (state.phase !== "reveal") return;
    set(advanceToNextMap(state));
  },

  playAgain: () => {
    set({ ...restartGame(get()), phase: "playing" });
  },

  reset: () => {
    set(createInitialState(loadHighScore()));
  },
}));
