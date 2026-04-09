"use client";

import { Activity } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import type { LobbyRoomState } from "@/shared/lib/multiplayer";

interface LobbyProps {
  room: LobbyRoomState;
}

export function Lobby({ room }: LobbyProps) {
  return (
    <GameLobby
      room={room}
      icon={<Activity size={32} />}
      title="Network Test"
      subtitle="Test multiplayer network performance"
    />
  );
}
