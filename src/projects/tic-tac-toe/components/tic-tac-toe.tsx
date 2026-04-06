"use client";

import { useGameRoom } from "@/shared/lib/multiplayer";
import { useProfile } from "@/shared/lib/profile";
import { useTicTacToeStore } from "../store";
import { Lobby } from "./lobby";
import { GameSession } from "./game-session";

export function TicTacToe() {
  const profile = useProfile();
  const room = useGameRoom({ game: "tic-tac-toe", maxPlayers: 2, profile });
  const reset = useTicTacToeStore((s) => s.reset);

  // Wrap leave to also reset game state
  function handleLeave() {
    room.leave();
    reset();
  }

  if (room.phase === "lobby") {
    return <Lobby room={room} />;
  }

  return <GameSession room={room} onLeave={handleLeave} key={room.roomCode} />;
}
