"use client";

import { create } from "zustand";
import type { GameState } from "./types";
import {
  createInitialState,
  GENERATIONS,
  checkGuess,
  applyCorrectGuess,
  applyWrongGuess,
  advanceToNextPokemon,
  restartGame,
} from "./logic";
import { getProjectStorage } from "@/shared/lib/storage";
import { highScoreKey } from "@/shared/trivia";

const storage = getProjectStorage("pokemon");

function genKey(gens: readonly number[]): string[] {
  return [...gens].map((g) => `gen${g}`);
}

function loadHighScore(selectedGenerations: readonly number[]): number {
  return storage.get<number>(highScoreKey(genKey(selectedGenerations))) ?? 0;
}

function saveHighScore(
  selectedGenerations: readonly number[],
  score: number,
): void {
  storage.set(highScoreKey(genKey(selectedGenerations)), score);
}

const allGenerations = [...GENERATIONS];

interface PokemonActions {
  toggleGeneration: (gen: number) => void;
  selectAllGenerations: () => void;
  deselectAllGenerations: () => void;
  startGame: () => void;
  submitGuess: (types: string[]) => void;
  advance: () => void;
  playAgain: () => void;
  reset: () => void;
}

export type PokemonStore = GameState & PokemonActions;

export const usePokemonStore = create<PokemonStore>((set, get) => ({
  ...createInitialState(allGenerations, loadHighScore(allGenerations)),

  toggleGeneration: (gen: number) => {
    const { selectedGenerations } = get();
    const next = selectedGenerations.includes(gen)
      ? selectedGenerations.filter((g) => g !== gen)
      : [...selectedGenerations, gen].sort((a, b) => a - b);
    set({ selectedGenerations: next, highScore: loadHighScore(next) });
  },

  selectAllGenerations: () => {
    set({
      selectedGenerations: allGenerations,
      highScore: loadHighScore(allGenerations),
    });
  },

  deselectAllGenerations: () => {
    set({ selectedGenerations: [], highScore: 0 });
  },

  startGame: () => {
    const { selectedGenerations } = get();
    set({
      ...createInitialState(
        selectedGenerations,
        loadHighScore(selectedGenerations),
      ),
      phase: "playing",
    });
  },

  submitGuess: (types: string[]) => {
    const state = get();
    if (state.phase !== "playing") return;

    const isCorrect = checkGuess(state, types);
    const newState = isCorrect
      ? applyCorrectGuess(state)
      : applyWrongGuess(state);
    saveHighScore(state.selectedGenerations, newState.highScore);
    set(newState);
  },

  advance: () => {
    const state = get();
    if (state.phase !== "reveal") return;
    set(advanceToNextPokemon(state));
  },

  playAgain: () => {
    const state = get();
    set({
      ...restartGame(state),
      phase: "playing",
    });
  },

  reset: () => {
    set(createInitialState(allGenerations, loadHighScore(allGenerations)));
  },
}));
