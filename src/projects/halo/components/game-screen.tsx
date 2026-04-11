"use client";

import { useMemo } from "react";
import { useHaloStore } from "../store";
import { getAllMapNames } from "../logic";
import { MapImage } from "./map-image";
import { MapCombobox } from "./map-combobox";
import { GuessResult } from "./guess-result";
import { LivesDisplay } from "./lives-display";
import { ScoreDisplay } from "./score-display";

export function GameScreen() {
  const phase = useHaloStore((s) => s.phase);
  const shuffledMaps = useHaloStore((s) => s.shuffledMaps);
  const currentIndex = useHaloStore((s) => s.currentIndex);
  const score = useHaloStore((s) => s.score);
  const highScore = useHaloStore((s) => s.highScore);
  const lives = useHaloStore((s) => s.lives);
  const maxLives = useHaloStore((s) => s.maxLives);
  const lastGuessCorrect = useHaloStore((s) => s.lastGuessCorrect);
  const correctAnswer = useHaloStore((s) => s.correctAnswer);
  const sourceGame = useHaloStore((s) => s.sourceGame);
  const selectedGames = useHaloStore((s) => s.selectedGames);
  const submitGuess = useHaloStore((s) => s.submitGuess);
  const advance = useHaloStore((s) => s.advance);

  const mapNames = useMemo(() => getAllMapNames(selectedGames), [selectedGames]);
  const currentMap = shuffledMaps[currentIndex];
  const nextMap = shuffledMaps.at(currentIndex + 1);
  const isRevealing = phase === "reveal";

  return (
    <div className="flex min-h-screen w-full flex-col items-center px-4 pb-8 pt-6">
      {/* Header */}
      <div className="flex w-full max-w-2xl items-center justify-between gap-4 pb-4">
        <ScoreDisplay score={score} highScore={highScore} />

        <span className="text-xs text-text-muted">
          {currentIndex + 1} / {shuffledMaps.length}
        </span>

        <LivesDisplay lives={lives} maxLives={maxLives} />
      </div>

      {/* Map image */}
      <MapImage
        key={currentMap.imageUrl}
        src={currentMap.imageUrl ?? null}
        alt="Guess this Halo map"
        nextSrc={nextMap?.imageUrl}
      />

      {/* Guess area */}
      <div className="mt-4 flex w-full flex-col items-center">
        {isRevealing && correctAnswer && sourceGame != null ? (
          <GuessResult
            correct={!!lastGuessCorrect}
            mapName={correctAnswer}
            sourceGame={sourceGame}
            onNext={advance}
          />
        ) : (
          <MapCombobox
            key={currentIndex}
            mapNames={mapNames}
            onSubmit={submitGuess}
            disabled={isRevealing}
          />
        )}
      </div>
    </div>
  );
}
