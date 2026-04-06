"use client";

import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type { GameRoom } from "@/shared/lib/multiplayer";

interface WaitingRoomProps {
  room: GameRoom;
  onLeave: () => void;
}

export function WaitingRoom({ room, onLeave }: WaitingRoomProps) {
  const { roomCode, isHost, players } = room;
  const connectedPeers = players.filter((p) => p.status === "connected");
  const canStart = isHost && connectedPeers.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Network Test</h1>

      <p className="text-text-secondary">
        Share this code with others:
      </p>
      <p className="text-4xl font-bold font-mono tracking-widest text-brand-orange">
        {roomCode}
      </p>

      <Card className="w-full max-w-sm p-4 space-y-3">
        <h2 className="font-medium text-text-primary">
          Connected Players
          <span className="ml-2 text-sm text-text-muted font-normal">
            ({connectedPeers.length})
          </span>
        </h2>

        {players.length === 0 ? (
          <p className="text-text-muted text-sm animate-pulse">
            Waiting for players to join...
          </p>
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-mono text-text-secondary">
                  {p.id.slice(0, 8)}
                </span>
                <span
                  className={
                    p.status === "connected"
                      ? "text-brand-green"
                      : "text-text-muted animate-pulse"
                  }
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isHost ? (
        <Button onClick={room.start} disabled={!canStart}>
          Start Test
        </Button>
      ) : (
        <p className="text-text-muted text-sm animate-pulse">
          Waiting for host to start test...
        </p>
      )}

      <Button variant="ghost" onClick={onLeave}>
        Cancel
      </Button>
    </div>
  );
}
