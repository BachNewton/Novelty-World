"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface GameOverScreenProps {
  score: number;
  highScore: number;
  attempted: number;
  total: number;
  /** True when the player exhausted all questions without losing all lives. */
  victory: boolean;
  /** Singular noun for the question subject, e.g. "map", "Pokemon". */
  questionNoun: string;
  onPlayAgain: () => void;
}

export function GameOverScreen({
  score,
  highScore,
  attempted,
  total,
  victory,
  questionNoun,
  onPlayAgain,
}: GameOverScreenProps) {
  const isNewHighScore = score === highScore && score > 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") onPlayAgain();
    },
    [onPlayAgain],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.addEventListener("keydown", handleKeyDown);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold">
        {victory ? "You Win!" : "Game Over"}
      </h1>

      <div className="flex flex-col items-center gap-1">
        <span className="text-5xl font-bold text-brand-orange">{score}</span>
        <span className="text-sm text-text-secondary">
          {attempted} of {total} {questionNoun}
          {total === 1 ? "" : "s"} attempted
        </span>
      </div>

      {isNewHighScore ? (
        <div className="flex items-center gap-2 text-brand-orange">
          <Trophy size={20} />
          <span className="font-semibold">New High Score!</span>
        </div>
      ) : (
        <span className="text-sm text-text-muted">
          High Score: {highScore}
        </span>
      )}

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button onClick={onPlayAgain}>Play Again</Button>
        <Link href="/">
          <Button variant="secondary" className="w-full">
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
