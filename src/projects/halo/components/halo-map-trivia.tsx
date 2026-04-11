"use client";

import { useEffect } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useHaloStore } from "../store";
import { GameScreen } from "./game-screen";
import { GameOverScreen } from "./game-over-screen";
import { GameFilter } from "./game-filter";

export function HaloMapTrivia() {
  const phase = useHaloStore((s) => s.phase);
  const selectedGames = useHaloStore((s) => s.selectedGames);

  const startGame = useHaloStore((s) => s.startGame);
  const reset = useHaloStore((s) => s.reset);

  // Reset to idle when navigating away so the store doesn't
  // resume a stale game on client-side back/forward navigation.
  useEffect(() => {
    return () => reset();
  }, [reset]);

  if (phase === "idle") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-8 text-center">
        <div className="rounded-full bg-surface-elevated p-4">
          <Crosshair size={40} className="text-brand-orange" />
        </div>

        <div>
          <h1 className="text-3xl font-bold">Halo Map Trivia</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Guess the map from its image
          </p>
          <p className="mt-1 text-xs text-text-muted">
            You get <span className="font-medium text-brand-pink">3 lives</span> — how many can you name?
          </p>
        </div>

        <GameFilter />

        <Button
          onClick={startGame}
          disabled={selectedGames.length === 0}
          className="px-8"
        >
          Start Game
        </Button>
      </div>
    );
  }

  if (phase === "game-over") {
    return <GameOverScreen />;
  }

  return <GameScreen />;
}
