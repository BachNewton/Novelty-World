import type { GamePhase } from "@/shared/trivia";

export interface HaloMapEntry {
  name: string;
  imageUrl: string | null;
  sourceGame: string;
  sourceUrl: string;
}

export interface GameState {
  phase: GamePhase;
  selectedGames: string[];
  shuffledMaps: HaloMapEntry[];
  currentIndex: number;
  score: number;
  lives: number;
  maxLives: number;
  highScore: number;
  lastGuessCorrect: boolean | null;
  correctAnswer: string | null;
  sourceGame: string | null;
}
