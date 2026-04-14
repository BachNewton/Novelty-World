"use client";

import { GuessResult, LivesDisplay, ScoreDisplay } from "@/shared/trivia";
import { usePokemonStore } from "../store";
import { PokemonImage } from "./pokemon-image";
import { TypeSelector } from "./type-selector";
import { TypeIcon } from "./type-icon";

export function PokemonGameScreen() {
  const phase = usePokemonStore((s) => s.phase);
  const shuffled = usePokemonStore((s) => s.shuffled);
  const currentIndex = usePokemonStore((s) => s.currentIndex);
  const score = usePokemonStore((s) => s.score);
  const highScore = usePokemonStore((s) => s.highScore);
  const lives = usePokemonStore((s) => s.lives);
  const maxLives = usePokemonStore((s) => s.maxLives);
  const lastGuessCorrect = usePokemonStore((s) => s.lastGuessCorrect);
  const revealed = usePokemonStore((s) => s.revealed);
  const submitGuess = usePokemonStore((s) => s.submitGuess);
  const advance = usePokemonStore((s) => s.advance);

  const current = shuffled[currentIndex];
  const next = shuffled.at(currentIndex + 1);
  const isRevealing = phase === "reveal";

  return (
    <div className="flex min-h-screen w-full flex-col items-center overflow-hidden px-3 pb-25 pt-3">
      <div className="flex w-full max-w-2xl items-center justify-between gap-4 pb-2">
        <ScoreDisplay score={score} highScore={highScore} />

        <span className="text-xs text-text-muted">
          {currentIndex + 1} / {shuffled.length}
        </span>

        <LivesDisplay lives={lives} maxLives={maxLives} columns={5} />
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <PokemonImage
          key={current.id}
          src={current.spriteUrl}
          alt="Guess this Pokemon's type"
          nextSrc={next?.spriteUrl}
        />
      </div>

      {/* Stack TypeSelector and GuessResult in the same grid cell so the
          cell always reserves TypeSelector's (taller) natural height. This
          keeps the image wrapper's flex-1 space constant between phases,
          so the Pokemon doesn't visually jump when we reveal the answer. */}
      <div className="relative z-10 grid w-full">
        <div
          className={`col-start-1 row-start-1 flex flex-col items-center ${
            isRevealing ? "invisible" : ""
          }`}
          aria-hidden={isRevealing}
        >
          <TypeSelector
            key={currentIndex}
            onSubmit={submitGuess}
            disabled={isRevealing}
          />
        </div>
        <div
          className={`col-start-1 row-start-1 flex flex-col items-center justify-end ${
            isRevealing && revealed ? "" : "invisible"
          }`}
          aria-hidden={!(isRevealing && revealed)}
        >
          {revealed && (
            <GuessResult correct={!!lastGuessCorrect} onNext={advance}>
              <p className="text-center text-lg font-semibold text-text-primary">
                {revealed.name}
              </p>
              <div className="flex items-center gap-2">
                {revealed.types.map((t) => (
                  <div key={t} className="flex items-center gap-1">
                    <TypeIcon type={t} size={28} />
                    <span className="text-sm capitalize text-text-secondary">
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            </GuessResult>
          )}
        </div>
      </div>
    </div>
  );
}
