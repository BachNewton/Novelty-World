"use client";

import { Hash } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";

interface LobbyProps {
  onCreate: () => void;
  onJoin: (code: string) => void;
  notice: string | null;
}

export function Lobby(props: LobbyProps) {
  return (
    <GameLobby
      {...props}
      icon={<Hash size={32} />}
      title="Tic Tac Toe"
      subtitle="Challenge a friend online"
    />
  );
}
