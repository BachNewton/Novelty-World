"use client";

import type { RoomStatus } from "@/shared/lib/peer";
import { useTicTacToeStore } from "../store";
import { Board } from "./board";
import { GameStatus } from "./game-status";
import { Button } from "@/shared/components/ui/button";

interface GameSessionProps {
  status: RoomStatus;
  isHost: boolean;
  roomCode: string;
  opponentLeft: boolean;
  onCellClick: (index: number) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
      {children}
    </div>
  );
}

export function GameSession({
  status,
  isHost,
  roomCode,
  opponentLeft,
  onCellClick,
  onPlayAgain,
  onLeave,
}: GameSessionProps) {
  const myPlayer = useTicTacToeStore((s) => s.myPlayer);

  if (status === "disconnected" || status === "offline") {
    return (
      <Screen>
        <p className="font-medium text-brand-pink">
          {status === "disconnected" ? "The host left the game" : "Could not reach the game server"}
        </p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </Screen>
    );
  }

  if (status !== "connected" || myPlayer === null) {
    return (
      <Screen>
        {isHost && status === "connected" ? (
          <>
            {opponentLeft && <p className="font-medium text-brand-pink">Your opponent left</p>}
            <p className="text-text-secondary">Share this code with your opponent:</p>
            <p
              data-testid="room-code"
              className="font-mono text-4xl font-bold tracking-widest text-brand-orange"
            >
              {roomCode}
            </p>
            <p className="animate-pulse text-sm text-text-muted">Waiting for opponent...</p>
          </>
        ) : (
          <p className="animate-pulse text-sm text-text-muted">
            {status === "connected" ? "Waiting for the host..." : "Connecting to room..."}
          </p>
        )}
        <Button variant="ghost" onClick={onLeave}>
          Cancel
        </Button>
      </Screen>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <GameStatus onPlayAgain={onPlayAgain} onLeave={onLeave} />
      <Board onCellClick={onCellClick} />
    </div>
  );
}
