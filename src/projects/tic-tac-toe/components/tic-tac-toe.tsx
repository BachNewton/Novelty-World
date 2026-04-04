"use client";

import type { PeerRole } from "@/shared/lib/webrtc";
import { useTicTacToeStore } from "../store";
import { Lobby } from "./lobby";
import { GameSession } from "./game-session";

export function TicTacToe() {
  const phase = useTicTacToeStore((s) => s.phase);
  const roomCode = useTicTacToeStore((s) => s.roomCode);
  const myPlayer = useTicTacToeStore((s) => s.myPlayer);

  if (phase === "lobby" || !roomCode || !myPlayer) {
    return <Lobby />;
  }

  const role: PeerRole = myPlayer === "X" ? "host" : "guest";
  return <GameSession roomCode={roomCode} role={role} key={roomCode} />;
}
