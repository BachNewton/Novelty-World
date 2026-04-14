import type { GamePhase } from "@/shared/trivia";

export interface PokemonEntry {
  id: number;
  name: string;
  types: string[];
  generation: number;
  spriteUrl: string;
}

export interface GameState {
  phase: GamePhase;
  selectedGenerations: number[];
  shuffled: PokemonEntry[];
  currentIndex: number;
  score: number;
  lives: number;
  maxLives: number;
  highScore: number;
  lastGuessCorrect: boolean | null;
  /** The Pokemon being revealed during the "reveal" phase. */
  revealed: PokemonEntry | null;
}
