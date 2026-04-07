"use client";

import { useEffect } from "react";
import { useWorldRoom } from "@/shared/lib/multiplayer";
import { useProfile } from "@/shared/lib/profile";
import { WorldView } from "./world-view";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";

const ROOM_CODE = "OPEN";

export function OpenWorldTest() {
  const profile = useProfile();
  const room = useWorldRoom({ game: "open-world-test", profile });
  const { phase, join } = room;

  // Auto-join the shared room on mount
  useEffect(() => {
    if (phase === "lobby") {
      join(ROOM_CODE);
    }
  }, [phase, join]);

  if (phase === "lobby") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-secondary">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 p-6">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Open World Test</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">
            Room: {room.roomCode}
          </span>
          <Link href="/">
            <Button
              variant="secondary"
              onClick={() => room.leave()}
            >
              Leave
            </Button>
          </Link>
        </div>
      </div>

      {phase === "disconnected" && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
          Connection lost — waiting for peers to reconnect...
        </div>
      )}

      {phase === "failed" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Connection failed.{" "}
          <button
            className="underline hover:text-red-300"
            onClick={() => {
              room.leave();
              join(ROOM_CODE);
            }}
          >
            Retry
          </button>
        </div>
      )}

      <WorldView playerRoster={room.playerRoster} selfId={room.playerId} />
    </div>
  );
}
