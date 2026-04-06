"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Activity } from "lucide-react";
import type { GameRoom } from "@/shared/lib/multiplayer";

interface LobbyProps {
  room: GameRoom;
}

export function Lobby({ room }: LobbyProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center space-y-3">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-orange">
          <Activity size={32} />
        </div>
        <h1 className="text-3xl font-bold">Network Test</h1>
        <p className="text-text-secondary">
          Test multiplayer network performance
        </p>
      </div>

      <Button onClick={room.createRoom}>Create Room</Button>

      <div className="w-full max-w-lg space-y-3">
        <h2 className="font-medium text-text-primary">
          Open Rooms
          {room.rooms.length > 0 && (
            <span className="ml-2 text-sm text-text-muted font-normal">
              ({room.rooms.length})
            </span>
          )}
        </h2>

        {room.rooms.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-text-muted text-sm">
              No rooms available. Create one to get started!
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {room.rooms.map((r) => (
              <Card
                key={r.roomCode}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tracking-widest text-brand-orange">
                    {r.roomCode}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {r.playerCount} players
                  </span>
                </div>
                <Button
                  onClick={() => room.joinRoom(r.roomCode)}
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
