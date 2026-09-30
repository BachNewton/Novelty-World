"use client";

import type { ReactNode } from "react";
import type { Player, RoomStatus } from "@/shared/lib/peer";
import { useEuchreStore } from "../store";
import type { BidAction, Card, PlayerIndex, Team } from "../types";
import { GameTable } from "./game-table";
import { Button } from "@/shared/components/ui/button";

interface GameSessionProps {
  status: RoomStatus;
  isHost: boolean;
  roomCode: string;
  players: readonly Player[];
  myPlayerId: string;
  onSelectTeam: (team: Team) => void;
  onStart: () => void;
  onBid: (action: BidAction) => void;
  onCardClick: (card: Card) => void;
  onNextHand: () => void;
  onPlayAgain: () => void;
  onRejoin: () => void;
  onLeave: () => void;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Euchre</h1>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team selection screen
// ---------------------------------------------------------------------------

interface TeamSelectionProps {
  players: readonly Player[];
  myPlayerId: string;
  isHost: boolean;
  roomCode: string;
  onSelectTeam: (team: Team) => void;
  onStart: () => void;
  onLeave: () => void;
}

function TeamColumn({
  team,
  players,
  myPlayerId,
  onSelectTeam,
}: {
  team: Team;
  players: readonly Player[];
  myPlayerId: string;
  onSelectTeam: (team: Team) => void;
}) {
  const teams = useEuchreStore((s) => s.teams);
  const members = teams
    .filter((t) => t.team === team)
    .map((t) => players.find((p) => p.id === t.playerId))
    .filter((p): p is Player => p !== undefined);
  const mine = teams.find((t) => t.playerId === myPlayerId)?.team === team;

  return (
    <div className="flex-1 space-y-3">
      <h2 className={`text-center font-medium ${team === "A" ? "text-brand-orange" : "text-brand-blue"}`}>
        Team {team}
      </h2>
      <div className="min-h-[5rem] space-y-2">
        {members.map((p) => (
          <div key={p.id} className="rounded-md bg-surface-elevated px-3 py-2 text-center text-sm">
            {p.name}
            {p.id === myPlayerId && " (you)"}
          </div>
        ))}
      </div>
      <Button variant={mine ? "primary" : "ghost"} className="w-full text-sm" onClick={() => onSelectTeam(team)}>
        {mine ? `On Team ${team}` : `Join Team ${team}`}
      </Button>
    </div>
  );
}

function TeamSelection({ players, myPlayerId, isHost, roomCode, onSelectTeam, onStart, onLeave }: TeamSelectionProps) {
  const teams = useEuchreStore((s) => s.teams);
  const count = (team: Team) => teams.filter((t) => t.team === team).length;
  const canStart = count("A") === 2 && count("B") === 2;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Pick Teams</h1>
      <p className="text-sm text-text-muted">
        Share room code{" "}
        <span data-testid="room-code" className="font-mono tracking-widest text-brand-orange">
          {roomCode}
        </span>{" "}
        · {players.length}/4 players
      </p>

      <div className="flex w-full max-w-md gap-6">
        <TeamColumn team="A" players={players} myPlayerId={myPlayerId} onSelectTeam={onSelectTeam} />
        <TeamColumn team="B" players={players} myPlayerId={myPlayerId} onSelectTeam={onSelectTeam} />
      </div>

      {isHost ? (
        <Button onClick={onStart} disabled={!canStart}>
          {canStart ? "Start Game" : "Waiting for 2 per team..."}
        </Button>
      ) : (
        <p className="animate-pulse text-sm text-text-muted">Waiting for host to start...</p>
      )}

      <Button variant="ghost" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main game session
// ---------------------------------------------------------------------------

const SEATS: PlayerIndex[] = [0, 1, 2, 3];

export function EuchreGameSession(props: GameSessionProps) {
  const { status, isHost, roomCode, players, myPlayerId, onRejoin, onLeave } = props;
  const game = useEuchreStore((s) => s.game);
  const myPlayer = useEuchreStore((s) => s.myPlayer);
  const seats = useEuchreStore((s) => s.seats);

  if (status === "disconnected" || status === "offline") {
    return (
      <Screen>
        <p className="font-medium text-brand-pink">
          {status === "disconnected" ? "Lost the connection to the host" : "Could not reach the game server"}
        </p>
        <div className="flex gap-3">
          <Button onClick={onRejoin}>Rejoin</Button>
          <Button variant="ghost" onClick={onLeave}>
            Back to Lobby
          </Button>
        </div>
      </Screen>
    );
  }

  if (status !== "connected") {
    return (
      <Screen>
        <p className="animate-pulse text-sm text-text-muted">Connecting to room...</p>
        <Button variant="ghost" onClick={onLeave}>
          Cancel
        </Button>
      </Screen>
    );
  }

  if (game === null || myPlayer === null || seats === null) {
    return (
      <TeamSelection
        players={players}
        myPlayerId={myPlayerId}
        isHost={isHost}
        roomCode={roomCode}
        onSelectTeam={props.onSelectTeam}
        onStart={props.onStart}
        onLeave={onLeave}
      />
    );
  }

  const seatOf = (i: PlayerIndex) => seats.find((s) => s.seatIndex === i);
  const playerNames = Object.fromEntries(
    SEATS.map((i) => [i, seatOf(i)?.name ?? `Player ${i}`]),
  ) as Record<PlayerIndex, string>;
  const seatConnected = Object.fromEntries(
    SEATS.map((i) => [i, players.some((p) => p.id === seatOf(i)?.playerId)]),
  ) as Record<PlayerIndex, boolean>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Euchre</h1>
        <Button variant="ghost" className="text-xs" onClick={onLeave}>
          Leave game
        </Button>
      </div>

      <GameTable
        playerNames={playerNames}
        seatConnected={seatConnected}
        isAuthority={isHost}
        onBid={props.onBid}
        onCardClick={props.onCardClick}
        onNextHand={props.onNextHand}
        onPlayAgain={props.onPlayAgain}
        onLeave={onLeave}
      />
    </div>
  );
}
