"use client";

import { useEffect } from "react";
import { Crosshair } from "lucide-react";
import { TriviaLobby } from "@/shared/trivia";
import { useHaloStore } from "../store";
import { GameScreen } from "./game-screen";
import { HaloGameOverScreen } from "./halo-game-over-screen";
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
      <TriviaLobby
        icon={<Crosshair size={40} className="text-brand-orange" />}
        title="Halo Map Trivia"
        description="Guess the map from its image"
        tagline={
          <>
            You get <span className="font-medium text-brand-pink">3 lives</span> — how many can you name?
          </>
        }
        onStart={startGame}
        startDisabled={selectedGames.length === 0}
      >
        <GameFilter />
      </TriviaLobby>
    );
  }

  if (phase === "game-over") {
    return <HaloGameOverScreen />;
  }

  return <GameScreen />;
}
