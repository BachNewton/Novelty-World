"use client";

import Link from "next/link";
import { Spade } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useEuchreStore } from "../store";
import type { PlayerIndex } from "../types";
import { GameTable } from "./game-table";

/**
 * Root Euchre component.
 *
 * Currently renders a local-play start screen + the game table.
 * Will be refactored to use useGameRoom() for multiplayer in phase 6.
 */
export function Euchre() {
  const game = useEuchreStore((s) => s.game);
  const myPlayer = useEuchreStore((s) => s.myPlayer);
  const startGame = useEuchreStore((s) => s.startGame);
  const setMyPlayer = useEuchreStore((s) => s.setMyPlayer);
  const reset = useEuchreStore((s) => s.reset);

  function handleStart() {
    const dealer = (Math.floor(Math.random() * 4)) as PlayerIndex;
    setMyPlayer(0 as PlayerIndex);
    startGame(dealer);
  }

  // Start screen
  if (!game || myPlayer == null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="text-center space-y-3">
          <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-orange">
            <Spade size={32} />
          </div>
          <h1 className="text-3xl font-bold">Euchre</h1>
          <p className="text-text-secondary">
            The classic trick-taking card game
          </p>
        </div>

        <Button onClick={handleStart}>Start Local Game</Button>

        <p className="text-xs text-text-muted max-w-xs text-center">
          Local mode &mdash; all hands visible. Multiplayer coming soon.
        </p>

        <Link href="/">
          <Button variant="ghost">Back to Novelty World</Button>
        </Link>
      </div>
    );
  }

  // Active game
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Euchre</h1>
        <Button variant="ghost" className="text-xs" onClick={reset}>
          Leave game
        </Button>
      </div>

      <GameTable />
    </div>
  );
}
