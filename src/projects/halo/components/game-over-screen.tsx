"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useHaloStore } from "../store";

export function GameOverScreen() {
  const score = useHaloStore((s) => s.score);
  const highScore = useHaloStore((s) => s.highScore);
  const currentIndex = useHaloStore((s) => s.currentIndex);
  const shuffledMaps = useHaloStore((s) => s.shuffledMaps);
  const lives = useHaloStore((s) => s.lives);
  const playAgain = useHaloStore((s) => s.playAgain);

  const isNewHighScore = score === highScore && score > 0;
  const isVictory = lives > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold">
        {isVictory ? "You Win!" : "Game Over"}
      </h1>

      <div className="flex flex-col items-center gap-1">
        <span className="text-5xl font-bold text-brand-orange">{score}</span>
        <span className="text-sm text-text-secondary">
          {currentIndex + 1} of {shuffledMaps.length} maps attempted
        </span>
      </div>

      {isNewHighScore && (
        <div className="flex items-center gap-2 text-brand-orange">
          <Trophy size={20} />
          <span className="font-semibold">New High Score!</span>
        </div>
      )}

      {!isNewHighScore && (
        <span className="text-sm text-text-muted">
          High Score: {highScore}
        </span>
      )}

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button onClick={playAgain}>Play Again</Button>
        <Link href="/">
          <Button variant="secondary" className="w-full">
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
