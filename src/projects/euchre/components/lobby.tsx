"use client";

import { Spade } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";

interface LobbyProps {
  onCreate: () => void;
  onJoin: (code: string) => void;
  notice: string | null;
}

export function EuchreLobby(props: LobbyProps) {
  return (
    <GameLobby
      {...props}
      icon={<Spade size={32} />}
      title="Euchre"
      subtitle="Play Euchre with friends"
    />
  );
}
