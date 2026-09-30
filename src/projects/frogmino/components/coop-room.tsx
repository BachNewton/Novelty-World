"use client";

import type { ReactNode } from "react";
import { Crown, PartyPopper } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type { Player, RoomStatus } from "@/shared/lib/peer";
import { cn } from "@/shared/lib/utils";
import { COOP_CAPACITY, type HostSeat } from "../coop";

interface CoopRoomProps {
  status: RoomStatus;
  isHost: boolean;
  selfId: string | null;
  players: readonly Player[];
  seat: HostSeat;
  notice: string | null;
  onStart: () => void;
  onLeave: () => void;
}

const STATUS_LABEL: Record<RoomStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Can't reach the game server",
  "not-found": "Game not found",
  disconnected: "The host left",
};

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <h1 className="text-3xl font-bold text-brand-green">Frogmino co-op</h1>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: RoomStatus }) {
  const tone =
    status === "connected"
      ? "border-brand-green text-brand-green"
      : status === "connecting" || status === "reconnecting"
        ? "animate-pulse border-brand-blue text-brand-blue"
        : "border-brand-pink text-brand-pink";
  return (
    <span data-testid="room-status" className={cn("rounded-full border-2 px-3 py-0.5 text-sm font-bold", tone)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PlayerList({ players, selfId }: { players: readonly Player[]; selfId: string | null }) {
  const empty = Math.max(0, COOP_CAPACITY - players.length);
  return (
    <Card className="w-full max-w-sm p-4">
      <ul aria-label="Players" className="space-y-2 text-left">
        {players.map((player, i) => (
          <li
            key={player.peerId}
            className="flex items-center gap-3 rounded-md border-2 border-brand-green/60 bg-surface-tertiary px-3 py-2"
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-brand-green" />
            <span className="min-w-0 flex-1 truncate font-bold text-text-primary">
              {player.name}
              {player.peerId === selfId && <span className="font-normal text-text-secondary"> (you)</span>}
            </span>
            {i === 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-brand-orange">
                <Crown size={14} aria-hidden /> Host
              </span>
            )}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li
            key={`empty-${i}`}
            className="animate-pulse rounded-md border-2 border-dashed border-border-hover px-3 py-2 text-text-muted"
          >
            Waiting for a partner…
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Players in the room, as this side sees them: the host shows only its
 * partner, not a guest it is turning away. */
function roomPlayers(players: readonly Player[], isHost: boolean, seat: HostSeat): readonly Player[] {
  if (isHost) return players.filter((p, i) => i === 0 || p.peerId === seat.partnerPeerId);
  return players.slice(0, COOP_CAPACITY);
}

export function CoopRoom({ status, isHost, selfId, players, seat, notice, onStart, onLeave }: CoopRoomProps) {
  if (status === "disconnected" || status === "offline") {
    return (
      <Screen>
        <p className="text-lg font-bold text-brand-pink">
          {status === "disconnected" ? "The host left the game" : STATUS_LABEL.offline}
        </p>
        <Button onClick={onLeave}>Back to lobby</Button>
      </Screen>
    );
  }

  const shown = roomPlayers(players, isHost, seat);

  if (seat.phase.kind === "started") {
    return (
      <Screen>
        <Card className="w-full max-w-sm space-y-3 border-2 border-brand-green p-6">
          <PartyPopper size={40} className="mx-auto text-brand-orange" aria-hidden />
          <p className="text-xl font-bold text-text-primary">Co-op play is coming soon: you&apos;re connected!</p>
          <p className="text-sm text-text-secondary">
            Course <span data-testid="course-seed" className="font-mono text-brand-blue">{seat.phase.seed}</span>
          </p>
        </Card>
        <PlayerList players={shown} selfId={selfId} />
        <Button onClick={onLeave}>Back to lobby</Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBadge status={status} />
      {notice && <p className="font-bold text-brand-pink">{notice}</p>}
      <PlayerList players={shown} selfId={selfId} />
      {status === "connected" &&
        (isHost ? (
          <Button onClick={onStart} disabled={seat.partnerPeerId === null} className="px-8 py-3 text-lg font-bold">
            Start
          </Button>
        ) : (
          <p className="animate-pulse text-text-secondary">Waiting for the host to start…</p>
        ))}
      <Button variant="ghost" onClick={onLeave}>
        Leave
      </Button>
    </Screen>
  );
}
