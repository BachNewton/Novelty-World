"use client";

import { useEffect } from "react";
import { useLobbyRoom } from "@/shared/lib/multiplayer";
import { useProfile } from "@/shared/lib/profile";
import { useEuchreStore } from "../store";
import { EuchreLobby } from "./lobby";
import { EuchreGameSession } from "./game-session";

export function Euchre() {
  const profile = useProfile();
  const room = useLobbyRoom({ game: "euchre", profile });
  const reset = useEuchreStore((s) => s.reset);
  const { isHost, phase, players, start } = room;

  // Auto-start handshake when 3 guests connected (4 players total)
  useEffect(() => {
    if (
      isHost &&
      phase === "waiting" &&
      players.filter((p) => p.status === "connected").length === 3
    ) {
      start();
    }
  }, [isHost, phase, players, start]);

  function handleLeave() {
    room.leave();
    reset();
  }

  // Lobby — shows open rooms and rejoinable in-progress rooms automatically
  if (phase === "lobby") {
    return <EuchreLobby room={room} />;
  }

  // Game session (covers waiting, connecting, ready, disconnected, failed)
  return <EuchreGameSession room={room} onLeave={handleLeave} key={room.roomCode} />;
}
