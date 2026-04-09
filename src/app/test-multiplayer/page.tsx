"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLobbyRoom } from "@/shared/lib/multiplayer";
import { useWorldRoom } from "@/shared/lib/multiplayer";
import type { LobbyRoomState, WorldRoomState, LobbyRoom } from "@/shared/lib/multiplayer";
import { setClientOverride } from "@/shared/lib/supabase/client";
import { createMockSupabaseClient } from "@/shared/lib/supabase/mock-client";

// Use local BroadcastChannel mock instead of Supabase Realtime for tests.
// Eliminates rate limits and external service dependency.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.has("local")) {
    setClientOverride(createMockSupabaseClient());
  }
}

/**
 * Test harness page for the multiplayer framework.
 * Used by Playwright e2e tests — not a user-facing page.
 *
 * Each browser context loads this page. The test clicks buttons
 * to drive the flow: create room → join room → verify ready → send messages.
 *
 * URL params:
 *   ?mode=world    — use useWorldRoom (default: useLobbyRoom)
 *   ?game=xxx      — lobby channel name (default: "test"); use unique values for test isolation
 *   ?playerId=xxx  — use a fixed player ID instead of generating one (for reconnection tests)
 *   ?join=ROOMCODE — auto-join this room on mount (skip lobby)
 */
export default function TestMultiplayerPage() {
  return (
    <Suspense>
      <TestMultiplayerContent />
    </Suspense>
  );
}

function TestMultiplayerContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const playerId = searchParams.get("playerId");
  const autoJoin = searchParams.get("join");
  const game = searchParams.get("game") ?? "test";

  if (mode === "world") {
    return <WorldRoomTest playerId={playerId} autoJoin={autoJoin} game={game} />;
  }
  return <LobbyRoomTest playerId={playerId} autoJoin={autoJoin} game={game} />;
}

// --- Lobby Room Test ---

interface TestProps {
  playerId: string | null;
  autoJoin: string | null;
  game: string;
}

function LobbyRoomTest({ playerId, autoJoin, game }: TestProps) {
  const profile = useMemo(
    () => ({ id: playerId ?? crypto.randomUUID(), name: "Test Player" }),
    [playerId],
  );
  const room = useLobbyRoom({ game, profile });

  // Auto-join a room on mount (for reconnection tests)
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoin && !autoJoinedRef.current && room.phase === "lobby") {
      autoJoinedRef.current = true;
      room.joinRoom(autoJoin);
    }
  }, [autoJoin, room]);

  if (room.phase === "lobby" && !autoJoin) {
    return (
      <div data-testid="test-multiplayer">
        <SharedLobby rooms={room.rooms} createRoom={room.createRoom} joinRoom={room.joinRoom} />
      </div>
    );
  }

  if (room.phase === "lobby") {
    // Auto-join triggered but hasn't taken effect yet
    return (
      <div data-testid="test-multiplayer">
        <div data-testid="session">
          <div data-testid="phase">connecting</div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="test-multiplayer">
      <LobbySession room={room} />
    </div>
  );
}

function LobbySession({ room }: { room: LobbyRoomState }) {
  const { roomCode, isHost, phase, players, playerId, playerRoster, send, onMessage, onPlayerLeave, start } = room;
  const [messages, setMessages] = useState<string[]>([]);
  const [leftPlayers, setLeftPlayers] = useState<string[]>([]);

  useEffect(() => {
    return onMessage<{ text: string }>("ping", (msg) => {
      setMessages((prev) => [...prev, `received:${msg.payload.text}`]);
    });
  }, [onMessage]);

  useEffect(() => {
    return onPlayerLeave((peerId) => {
      setLeftPlayers((prev) => [...prev, peerId]);
    });
  }, [onPlayerLeave]);

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
      <div data-testid="player-statuses">
        {players.map((p) => (
          <span key={p.id} data-testid="player-status">{p.status}</span>
        ))}
      </div>
      <div data-testid="is-ready">{String(phase === "ready")}</div>
      <div data-testid="player-id">{playerId}</div>
      <div data-testid="roster-count">{playerRoster.length}</div>
      <div data-testid="roster">
        {playerRoster.map((p) => (
          <span key={p.playerId} data-testid="roster-entry" data-player-id={p.playerId}>
            {p.playerName}:{p.status}
          </span>
        ))}
      </div>
      {phase === "waiting" && isHost && (
        <button data-testid="start-game" onClick={start}>Start</button>
      )}
      <button data-testid="send-ping" onClick={handleSendPing}>
        Send Ping
      </button>
      <div data-testid="messages">{JSON.stringify(messages)}</div>
      <div data-testid="left-players">{JSON.stringify(leftPlayers)}</div>
      <div data-testid="left-count">{leftPlayers.length}</div>
    </div>
  );
}

// --- World Room Test ---

function WorldRoomTest({ playerId, autoJoin, game }: TestProps) {
  const profile = useMemo(
    () => ({ id: playerId ?? crypto.randomUUID(), name: "Test Player" }),
    [playerId],
  );
  const room = useWorldRoom({ game, profile });

  // Auto-join a room on mount (for reconnection tests)
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoin && !autoJoinedRef.current && room.phase === "lobby") {
      autoJoinedRef.current = true;
      room.join(autoJoin);
    }
  }, [autoJoin, room]);

  if (room.phase === "lobby" && !autoJoin) {
    return (
      <div data-testid="test-multiplayer">
        <SharedLobby rooms={room.rooms} createRoom={room.create} joinRoom={room.join} />
      </div>
    );
  }

  if (room.phase === "lobby") {
    return (
      <div data-testid="test-multiplayer">
        <div data-testid="session">
          <div data-testid="phase">connecting</div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="test-multiplayer">
      <WorldSession room={room} />
    </div>
  );
}

function WorldSession({ room }: { room: WorldRoomState }) {
  const { roomCode, phase, playerId, playerRoster, send, onMessage, onPlayerJoin, onPlayerLeave } = room;
  const [messages, setMessages] = useState<string[]>([]);
  const [leftPlayers, setLeftPlayers] = useState<string[]>([]);
  const [joinedPlayers, setJoinedPlayers] = useState<string[]>([]);

  useEffect(() => {
    return onMessage<{ text: string }>("ping", (msg) => {
      setMessages((prev) => [...prev, `received:${msg.payload.text}`]);
    });
  }, [onMessage]);

  useEffect(() => {
    return onPlayerLeave((peerId) => {
      setLeftPlayers((prev) => [...prev, peerId]);
    });
  }, [onPlayerLeave]);

  useEffect(() => {
    return onPlayerJoin((player) => {
      setJoinedPlayers((prev) => [...prev, player.playerId]);
    });
  }, [onPlayerJoin]);

  const handleSendPing = useCallback(() => {
    send("ping", { text: "hello" });
    setMessages((prev) => [...prev, "sent:hello"]);
  }, [send]);

  return (
    <div data-testid="session">
      <div data-testid="room-code">{roomCode}</div>
      <div data-testid="phase">{phase}</div>
      <div data-testid="player-id">{playerId}</div>
      <div data-testid="roster-count">{playerRoster.length}</div>
      <div data-testid="roster">
        {playerRoster.map((p) => (
          <span key={p.playerId} data-testid="roster-entry" data-player-id={p.playerId}>
            {p.playerName}:{p.status}
          </span>
        ))}
      </div>
      <button data-testid="send-ping" onClick={handleSendPing}>
        Send Ping
      </button>
      <div data-testid="messages">{JSON.stringify(messages)}</div>
      <div data-testid="left-players">{JSON.stringify(leftPlayers)}</div>
      <div data-testid="left-count">{leftPlayers.length}</div>
      <div data-testid="joined-players">{JSON.stringify(joinedPlayers)}</div>
      <div data-testid="joined-count">{joinedPlayers.length}</div>
    </div>
  );
}

// --- Shared Lobby UI ---

function SharedLobby({ rooms, createRoom, joinRoom }: {
  rooms: LobbyRoom[];
  createRoom: () => void;
  joinRoom: (code: string) => void;
}) {
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
