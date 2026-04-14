"use client";

import { GameOverScreen } from "@/shared/trivia";
import { usePokemonStore } from "../store";

export function PokemonGameOverScreen() {
  const score = usePokemonStore((s) => s.score);
  const highScore = usePokemonStore((s) => s.highScore);
  const currentIndex = usePokemonStore((s) => s.currentIndex);
  const shuffled = usePokemonStore((s) => s.shuffled);
  const lives = usePokemonStore((s) => s.lives);
  const playAgain = usePokemonStore((s) => s.playAgain);

  return (
    <GameOverScreen
      score={score}
      highScore={highScore}
      attempted={currentIndex + 1}
      total={shuffled.length}
      victory={lives > 0}
      questionNoun="Pokémon"
      onPlayAgain={playAgain}
    />
  );
}
