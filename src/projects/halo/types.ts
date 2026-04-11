export interface HaloMapEntry {
  name: string;
  imageUrl: string | null;
  sourceGame: string;
  sourceUrl: string;
}

export type GamePhase = "idle" | "playing" | "reveal" | "game-over";

export interface GameState {
  phase: GamePhase;
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
