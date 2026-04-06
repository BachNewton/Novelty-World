"use client";

import { useEffect } from "react";
import { useLobbyRoom } from "@/shared/lib/multiplayer";
import { useProfile } from "@/shared/lib/profile";
import { useTicTacToeStore } from "../store";
import { Lobby } from "./lobby";
import { GameSession } from "./game-session";

export function TicTacToe() {
  const profile = useProfile();
  const room = useLobbyRoom({ game: "tic-tac-toe", profile });
  const reset = useTicTacToeStore((s) => s.reset);
  const { isHost, phase, players, start } = room;

  // Auto-start when opponent connects (2-player game logic)
  useEffect(() => {
    if (isHost && phase === "waiting" && players.length === 1 && players[0].status === "connected") {
      start();
    }
  }, [isHost, phase, players, start]);

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
