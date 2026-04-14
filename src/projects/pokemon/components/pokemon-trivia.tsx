"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { TriviaLobby } from "@/shared/trivia";
import { usePokemonStore } from "../store";
import { PokemonGameScreen } from "./pokemon-game-screen";
import { PokemonGameOverScreen } from "./pokemon-game-over";
import { GenerationFilter } from "./generation-filter";

export function PokemonTrivia() {
  const phase = usePokemonStore((s) => s.phase);
  const selectedGenerations = usePokemonStore((s) => s.selectedGenerations);
  const startGame = usePokemonStore((s) => s.startGame);
  const reset = usePokemonStore((s) => s.reset);

  // Reset to idle when navigating away so the store doesn't
  // resume a stale game on client-side back/forward navigation.
  useEffect(() => {
    return () => reset();
  }, [reset]);

  if (phase === "idle") {
    return (
      <TriviaLobby
        icon={<Sparkles size={40} className="text-brand-orange" />}
        title="Pokémon Type Trivia"
        description="Pick the correct type (or types) for each Pokémon"
        tagline={
          <>
            You get <span className="font-medium text-brand-pink">3 lives</span> — how many can you type?
          </>
        }
        onStart={startGame}
        startDisabled={selectedGenerations.length === 0}
      >
        <GenerationFilter />
      </TriviaLobby>
    );
  }

  if (phase === "game-over") {
    return <PokemonGameOverScreen />;
  }

  return <PokemonGameScreen />;
}
