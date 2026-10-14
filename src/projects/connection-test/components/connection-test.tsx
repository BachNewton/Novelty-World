"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Activity } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useRoom, type Player, type RoomStatus } from "@/shared/lib/peer";
import { useProfile } from "@/shared/lib/profile";
import { useRoomList } from "@/shared/lib/room-list";
import { cn } from "@/shared/lib/utils";
import { addSample, openListing, parsePingMessage, roundTripSince, summarise, type PingMessage } from "../logic";

/** How often each player pings: the host every guest, a guest its host. */
const PING_MS = 1000;

const STATUS_LABEL: Record<RoomStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Could not reach the relay",
  "not-found": "Room not found",
  disconnected: "The host left",
};

/** Hosts or joins a room on the relay and shows each player's round trip through it. */
export function ConnectionTest() {
  const profile = useProfile();
  const [roundTrips, setRoundTrips] = useState<Record<string, number[]>>({});

  function record(peerId: string, sentAt: number) {
    const ms = roundTripSince(sentAt);
    setRoundTrips((all) => ({ ...all, [peerId]: addSample(all[peerId] ?? [], ms) }));
  }

  const room = useRoom<PingMessage, PingMessage>({
    game: "connection-test",
    profile,
    onGuestMessage(from, data) {
      const message = parsePingMessage(data);
      if (message === null) throw new Error(`connection test: malformed message from ${from.name}`);
      if (message.kind === "ping") room.sendTo(from.peerId, { kind: "pong", sentAt: message.sentAt });
      else record(from.peerId, message.sentAt);
    },
    onHostMessage(data) {
      const message = parsePingMessage(data);
      if (message === null) throw new Error("connection test: malformed message from the host");
      const host = room.players.at(0);
      if (message.kind === "ping") room.sendToHost({ kind: "pong", sentAt: message.sentAt });
      else if (host !== undefined) record(host.peerId, message.sentAt);
    },
    onGuestLeft(player) {
      setRoundTrips(({ [player.peerId]: _, ...rest }) => rest);
    },
  });

  const openRooms = useRoomList({
    game: "connection-test",
    listing: openListing({
      role: room.role,
      status: room.status,
      code: room.code,
      hostName: profile.name,
      players: room.players.length,
    }),
  });

  const ping = useEffectEvent(() => {
    const message: PingMessage = { kind: "ping", sentAt: performance.now() };
    if (room.role === "host") room.broadcast(message);
    else room.sendToHost(message);
  });
  const connected = room.status === "connected";
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(ping, PING_MS);
    return () => clearInterval(timer);
  }, [connected]);

  function leave() {
    room.leave();
    setRoundTrips({});
  }

  if (room.code === null || room.status === "not-found") {
    return (
      <GameLobby
        icon={<Activity size={32} />}
        title="Connection Test"
        subtitle="Host a room on one device, join it from another, and see how fast messages get through."
        onCreate={room.create}
        createLabel="Host a room"
        openRooms={{ list: openRooms, onJoin: room.join }}
        notice={room.status === "not-found" ? "That room has closed. Pick another!" : null}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-bold">Connection Test</h1>
        <p className="text-text-secondary">
          {room.role === "host" ? "You're hosting. Open this tool on another device and join your room." : "You joined room"}
        </p>
        <p data-testid="room-code" className="font-mono text-5xl font-bold tracking-widest text-brand-green">
          {room.code}
        </p>
        <p
          data-testid="room-status"
          className={cn(
            "mx-auto w-fit rounded-full border-2 px-3 py-0.5 text-sm font-bold",
            connected ? "border-brand-green text-brand-green" : "border-brand-pink text-brand-pink",
          )}
        >
          {STATUS_LABEL[room.status]}
        </p>
      </header>

      <Card className="divide-y divide-border-default">
        {room.players.map((player) => (
          <PlayerRow
            key={player.peerId}
            player={player}
            isSelf={player.peerId === room.selfId}
            isHost={player.peerId === room.players[0].peerId}
            roundTrips={roundTrips[player.peerId] ?? []}
          />
        ))}
        {room.players.length < 2 && (
          <p className="p-4 text-center text-sm text-text-muted">Waiting for someone to join…</p>
        )}
      </Card>

      <p className="text-center text-sm text-text-muted">
        A round trip is a message there and back through the relay, measured once a second.
        {room.role === "guest" && " Guests are measured to the host only."}
      </p>

      <Button variant="ghost" onClick={leave}>
        Leave
      </Button>
    </div>
  );
}

function PlayerRow({
  player,
  isSelf,
  isHost,
  roundTrips,
}: {
  player: Player;
  isSelf: boolean;
  isHost: boolean;
  roundTrips: readonly number[];
}) {
  const summary = summarise(roundTrips);
  return (
    <div data-testid="player-row" className="flex flex-wrap items-center justify-between gap-2 p-4">
      <div>
        <span className="font-bold">{player.name}</span>
        <span className="text-sm text-text-muted">
          {isHost ? " · host" : " · guest"}
          {isSelf && " · you"}
        </span>
      </div>
      {summary !== null ? (
        <div data-testid="round-trip" className="text-right font-mono text-sm">
          <span className="text-lg font-bold text-text-primary">{Math.round(summary.last)} ms</span>
          <span className="block text-text-muted">
            median {Math.round(summary.median)} · best {Math.round(summary.best)}
          </span>
        </div>
      ) : (
        !isSelf && <span className="text-sm text-text-muted">—</span>
      )}
    </div>
  );
}
