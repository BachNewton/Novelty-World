"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useGameRoom } from "@/shared/lib/multiplayer";
import type { GameRoom } from "@/shared/lib/multiplayer";

/**
 * Test harness page for the multiplayer framework.
 * Used by Playwright e2e tests — not a user-facing page.
 *
 * Each browser context loads this page. The test clicks buttons
 * to drive the flow: create room → join room → verify ready → send messages.
 *
 * URL params:
 *   ?players=N — set maxPlayers (default: 2)
 */
export default function TestMultiplayerPage() {
  const searchParams = useSearchParams();
  const maxPlayers = Number(searchParams.get("players")) || 2;
  const room = useGameRoom({ game: "test", maxPlayers });

  return (
    <div data-testid="test-multiplayer">
      {room.phase === "lobby" ? (
        <Lobby room={room} />
      ) : (
        <Session room={room} />
      )}
    </div>
  );
}

function Lobby({ room }: { room: GameRoom }) {
  const { rooms, createRoom, joinRoom } = room;

  return (
    <div>
      <button data-testid="create-room" onClick={createRoom}>
        Create Room
      </button>
      <div data-testid="room-count">{rooms.length}</div>
      <div data-testid="room-list">
        {rooms.map((r) => (
          <button
            key={r.roomCode}
            data-testid="join-room"
            data-room-code={r.roomCode}
            onClick={() => joinRoom(r.roomCode)}
          >
            {r.roomCode}
          </button>
        ))}
      </div>
    </div>
  );
}

function Session({ room }: { room: GameRoom }) {
  const { roomCode, isHost, phase, players, send, onMessage } = room;
  const [messages, setMessages] = useState<string[]>([]);

  // Listen for ping messages
  useEffect(() => {
    return onMessage<{ text: string }>("ping", (msg) => {
      setMessages((prev) => [...prev, `received:${msg.payload.text}`]);
    });
  }, [onMessage]);

  const handleSendPing = useCallback(() => {
    send("ping", { text: "hello" });
    setMessages((prev) => [...prev, "sent:hello"]);
  }, [send]);

  return (
    <div data-testid="session">
      <div data-testid="room-code">{roomCode}</div>
      <div data-testid="role">{isHost ? "host" : "guest"}</div>
      <div data-testid="phase">{phase}</div>
      <div data-testid="peer-count">{players.length}</div>
      <div data-testid="is-ready">{String(phase === "ready")}</div>
      <button data-testid="send-ping" onClick={handleSendPing}>
        Send Ping
      </button>
      <div data-testid="messages">{JSON.stringify(messages)}</div>
    </div>
  );
}
