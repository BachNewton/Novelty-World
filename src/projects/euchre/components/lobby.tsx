"use client";

import { Spade } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import type { LobbyRoomState } from "@/shared/lib/multiplayer";

interface LobbyProps {
  room: LobbyRoomState;
}

export function EuchreLobby({ room }: LobbyProps) {
  return (
    <GameLobby
      room={room}
      icon={<Spade size={32} />}
      title="Euchre"
      subtitle="Play Euchre with friends"
    />
  );
}
