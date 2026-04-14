"use client";

import { GameOverScreen } from "@/shared/trivia";
import { useHaloStore } from "../store";

export function HaloGameOverScreen() {
  const score = useHaloStore((s) => s.score);
  const highScore = useHaloStore((s) => s.highScore);
  const currentIndex = useHaloStore((s) => s.currentIndex);
  const shuffledMaps = useHaloStore((s) => s.shuffledMaps);
  const lives = useHaloStore((s) => s.lives);
  const playAgain = useHaloStore((s) => s.playAgain);

  return (
    <GameOverScreen
      score={score}
      highScore={highScore}
      attempted={currentIndex + 1}
      total={shuffledMaps.length}
      victory={lives > 0}
      questionNoun="map"
      onPlayAgain={playAgain}
    />
  );
}
