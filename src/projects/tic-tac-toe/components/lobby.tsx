"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Hash } from "lucide-react";
import { useLobby } from "@/shared/lib/webrtc";
import { useTicTacToeStore } from "../store";

export function Lobby() {
  const { rooms } = useLobby({ game: "tic-tac-toe" });
  const setRoomCode = useTicTacToeStore((s) => s.setRoomCode);
  const setMyPlayer = useTicTacToeStore((s) => s.setMyPlayer);
  const setPhase = useTicTacToeStore((s) => s.setPhase);

  function handleCreate() {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(code);
    setMyPlayer("X");
    setPhase("waiting");
  }

  function handleJoin(code: string) {
    setRoomCode(code.toUpperCase());
    setMyPlayer("O");
    setPhase("waiting");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center space-y-3">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-orange">
          <Hash size={32} />
        </div>
        <h1 className="text-3xl font-bold">Tic Tac Toe</h1>
        <p className="text-text-secondary">Challenge a friend online</p>
      </div>

      <Button onClick={handleCreate}>Create Room</Button>

      {/* Live room list */}
      <div className="w-full max-w-lg space-y-3">
        <h2 className="font-medium text-text-primary">
          Open Rooms
          {rooms.length > 0 && (
            <span className="ml-2 text-sm text-text-muted font-normal">
              ({rooms.length})
            </span>
          )}
        </h2>

        {rooms.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-text-muted text-sm">
              No rooms available. Create one to get started!
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <Card
                key={room.roomCode}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tracking-widest text-brand-orange">
                    {room.roomCode}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {room.playerCount}/{room.maxPlayers} players
                  </span>
                </div>
                <Button
                  onClick={() => handleJoin(room.roomCode)}
                  disabled={room.playerCount >= room.maxPlayers}
                  className="text-sm"
                >
                  Join
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Link href="/">
        <Button variant="ghost">Back to Novelty World</Button>
      </Link>
    </div>
  );
}
