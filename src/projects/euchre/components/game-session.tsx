"use client";

import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import type { LobbyRoomState, PlayerInfo, ConnectionState } from "@/shared/lib/multiplayer";
import { useEuchreStore } from "../store";
import {
  MSG,
  type PlayerIndex,
  type Card,
  type BidAction,
  type Team,
  type GameStartPayload,
  type BidPayload,
  type DiscardPayload,
  type PlayCardPayload,
  type StateUpdatePayload,
  type PlayAgainAcceptedPayload,
  type TeamSelectPayload,
  type TeamUpdatePayload,
  type TeamAssignment,
  type SeatAssignment,
} from "../types";
import { GameTable } from "./game-table";
import { Button } from "@/shared/components/ui/button";

interface GameSessionProps {
  room: LobbyRoomState;
  onLeave: () => void;
}

// ---------------------------------------------------------------------------
// Team selection screen
// ---------------------------------------------------------------------------

interface TeamSelectionProps {
  roster: PlayerInfo[];
  assignments: TeamAssignment[];
  myPlayerId: string;
  isHost: boolean;
  canStart: boolean;
  onSelectTeam: (team: Team) => void;
  onStart: () => void;
  onLeave: () => void;
  roomCode: string | null;
}

function TeamSelection({
  roster,
  assignments,
  myPlayerId,
  isHost,
  canStart,
  onSelectTeam,
  onStart,
  onLeave,
  roomCode,
}: TeamSelectionProps) {
  const getTeamPlayers = (team: Team) =>
    assignments
      .filter((a) => a.team === team)
      .map((a) => roster.find((r) => r.playerId === a.playerId))
      .filter(Boolean) as PlayerInfo[];

  const myTeam = assignments.find((a) => a.playerId === myPlayerId)?.team;

  const teamA = getTeamPlayers("A");
  const teamB = getTeamPlayers("B");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Pick Teams</h1>
      {roomCode && (
        <p className="text-sm text-text-muted">
          Room{" "}
          <span className="font-mono text-brand-orange tracking-widest">
            {roomCode}
          </span>
        </p>
      )}

      <div className="flex gap-6 w-full max-w-md">
        {/* Team A */}
        <div className="flex-1 space-y-3">
          <h2 className="text-center font-medium text-brand-orange">Team A</h2>
          <div className="space-y-2 min-h-[5rem]">
            {teamA.map((p) => (
              <div
                key={p.playerId}
                className="rounded-md bg-surface-elevated px-3 py-2 text-sm text-center"
              >
                {p.playerName}
                {p.playerId === myPlayerId && " (you)"}
              </div>
            ))}
          </div>
          <Button
            variant={myTeam === "A" ? "primary" : "ghost"}
            className="w-full text-sm"
            onClick={() => onSelectTeam("A")}
          >
            {myTeam === "A" ? "On Team A" : "Join Team A"}
          </Button>
        </div>

        {/* Team B */}
        <div className="flex-1 space-y-3">
          <h2 className="text-center font-medium text-brand-blue">Team B</h2>
          <div className="space-y-2 min-h-[5rem]">
            {teamB.map((p) => (
              <div
                key={p.playerId}
                className="rounded-md bg-surface-elevated px-3 py-2 text-sm text-center"
              >
                {p.playerName}
                {p.playerId === myPlayerId && " (you)"}
              </div>
            ))}
          </div>
          <Button
            variant={myTeam === "B" ? "primary" : "ghost"}
            className="w-full text-sm"
            onClick={() => onSelectTeam("B")}
          >
            {myTeam === "B" ? "On Team B" : "Join Team B"}
          </Button>
        </div>
      </div>

      {isHost && (
        <Button onClick={onStart} disabled={!canStart}>
          {canStart ? "Start Game" : "Waiting for 2 per team..."}
        </Button>
      )}
      {!isHost && (
        <p className="text-sm text-text-muted animate-pulse">
          Waiting for host to start...
        </p>
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

export function EuchreGameSession({ room, onLeave }: GameSessionProps) {
  const { phase: roomPhase, isHost, roomCode, playerRoster, send, sendTo, onMessage } = room;

  // Store actions
  const startGame = useEuchreStore((s) => s.startGame);
  const setMyPlayer = useEuchreStore((s) => s.setMyPlayer);
  const bid = useEuchreStore((s) => s.bid);
  const dealerDiscard = useEuchreStore((s) => s.dealerDiscard);
  const playCard = useEuchreStore((s) => s.playCard);
  const nextHand = useEuchreStore((s) => s.nextHand);
  const applyStateUpdate = useEuchreStore((s) => s.applyStateUpdate);
  const game = useEuchreStore((s) => s.game);
  const myPlayer = useEuchreStore((s) => s.myPlayer);

  // Seat assignment: playerId -> PlayerIndex.
  // Real state, not a ref: rendering derives mySeat/playerNames/playerStatuses
  // from this, so it must trigger re-renders on change. `null` means unassigned.
  const [seatMap, setSeatMap] = useState<Map<string, PlayerIndex> | null>(null);

  // Team selection state. Host is pre-assigned to Team A via lazy initializer
  // so we don't have to setState-in-effect to establish the invariant.
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>(() =>
    room.isHost ? [{ playerId: room.playerId, team: "A" }] : [],
  );

  // ---------------------------------------------------------------------------
  // Authority: connected player with the lowest seat index
  // ---------------------------------------------------------------------------

  const mySeat = seatMap?.get(room.playerId) ?? null;

  const isAuthority = useMemo(() => {
    if (!seatMap) return isHost; // Before seats assigned, host is authority
    const connectedSeats = playerRoster
      .filter((p) => p.status === "connected")
      .map((p) => seatMap.get(p.playerId))
      .filter((s): s is PlayerIndex => s !== undefined)
      .sort((a, b) => a - b);
    return connectedSeats.length > 0 && connectedSeats[0] === mySeat;
  }, [seatMap, playerRoster, mySeat, isHost]);

  // Broadcast state when becoming authority (migration ground truth)
  const prevAuthorityRef = useRef(false);
  useEffect(() => {
    if (isAuthority && !prevAuthorityRef.current && game && seatMap) {
      send<StateUpdatePayload>(MSG.STATE_UPDATE, { gameState: game });
    }
    prevAuthorityRef.current = isAuthority;
  }, [isAuthority, game, seatMap, send]);

  // ---------------------------------------------------------------------------
  // Player names derived from roster + seat map
  // ---------------------------------------------------------------------------

  const playerNames = useMemo(() => {
    const names: Record<PlayerIndex, string> = { 0: "", 1: "", 2: "", 3: "" };
    if (!seatMap) return names;
    for (const [playerId, seat] of seatMap.entries()) {
      const entry = playerRoster.find((p) => p.playerId === playerId);
      names[seat] = entry?.playerName ?? `Player ${seat}`;
    }
    return names;
  }, [playerRoster, seatMap]);

  // Player connection statuses by seat
  const playerStatuses = useMemo(() => {
    const statuses: Record<PlayerIndex, ConnectionState> = {
      0: "connected",
      1: "connected",
      2: "connected",
      3: "connected",
    };
    if (!seatMap) return statuses;
    for (const [playerId, seat] of seatMap.entries()) {
      if (playerId === room.playerId) continue; // Self is always connected
      const entry = playerRoster.find((p) => p.playerId === playerId);
      statuses[seat] = (entry?.status ?? "disconnected") as ConnectionState;
    }
    return statuses;
  }, [playerRoster, seatMap, room.playerId]);

  // ---------------------------------------------------------------------------
  // Team selection message handlers
  // ---------------------------------------------------------------------------

  // Authority: handle TEAM_SELECT requests
  useEffect(() => {
    if (!isAuthority || roomPhase !== "ready") return;
    return onMessage<TeamSelectPayload>(MSG.TEAM_SELECT, (msg) => {
      const fromPlayer = playerRoster.find((p) => p.peerId === msg.from);
      if (!fromPlayer) return;

      const updated = teamAssignments.filter((a) => a.playerId !== fromPlayer.playerId);
      updated.push({ playerId: fromPlayer.playerId, team: msg.payload.team });
      setTeamAssignments(updated);
      send<TeamUpdatePayload>(MSG.TEAM_UPDATE, { assignments: updated });
    });
  }, [isAuthority, roomPhase, onMessage, playerRoster, teamAssignments, send]);

  // All: handle TEAM_UPDATE broadcasts
  useEffect(() => {
    if (roomPhase !== "ready") return;
    return onMessage<TeamUpdatePayload>(MSG.TEAM_UPDATE, (msg) => {
      setTeamAssignments(msg.payload.assignments);
    });
  }, [roomPhase, onMessage]);

  // Host: broadcast the initial team assignment once peers are ready.
  // The assignment itself is set in the useState initializer above; this
  // effect is purely the side effect of telling peers about it. Subsequent
  // changes are broadcast by the select handlers, so we guard with a ref
  // to run exactly once.
  const didBroadcastInitialTeamRef = useRef(false);
  useEffect(() => {
    if (didBroadcastInitialTeamRef.current) return;
    if (!isHost || roomPhase !== "ready" || game) return;
    didBroadcastInitialTeamRef.current = true;
    send<TeamUpdatePayload>(MSG.TEAM_UPDATE, { assignments: teamAssignments });
  }, [isHost, roomPhase, game, teamAssignments, send]);

  const handleSelectTeam = useCallback(
    (team: Team) => {
      if (isAuthority) {
        // Authority applies directly
        const updated = teamAssignments.filter((a) => a.playerId !== room.playerId);
        updated.push({ playerId: room.playerId, team });
        setTeamAssignments(updated);
        send<TeamUpdatePayload>(MSG.TEAM_UPDATE, { assignments: updated });
      } else {
        send<TeamSelectPayload>(MSG.TEAM_SELECT, { team });
      }
    },
    [isAuthority, room.playerId, teamAssignments, send],
  );

  // ---------------------------------------------------------------------------
  // Game start (authority clicks "Start Game" after teams are set)
  // ---------------------------------------------------------------------------

  const handleStartGame = useCallback(() => {
    if (!isAuthority) return;

    // Build seat assignments from team choices
    // Team A -> seats 0, 2; Team B -> seats 1, 3
    const teamAPlayers = teamAssignments.filter((a) => a.team === "A");
    const teamBPlayers = teamAssignments.filter((a) => a.team === "B");

    const assignments: SeatAssignment[] = [
      { playerId: teamAPlayers[0].playerId, seatIndex: 0 as PlayerIndex },
      { playerId: teamBPlayers[0].playerId, seatIndex: 1 as PlayerIndex },
      { playerId: teamAPlayers[1].playerId, seatIndex: 2 as PlayerIndex },
      { playerId: teamBPlayers[1].playerId, seatIndex: 3 as PlayerIndex },
    ];

    // Populate seat map
    const newMap = new Map<string, PlayerIndex>();
    for (const a of assignments) {
      newMap.set(a.playerId, a.seatIndex);
    }
    setSeatMap(newMap);

    // Set local player
    const mySeatIdx = newMap.get(room.playerId)!;
    setMyPlayer(mySeatIdx);

    // Start game with random dealer
    const dealer = (Math.floor(Math.random() * 4)) as PlayerIndex;
    startGame(dealer);

    const gameState = useEuchreStore.getState().game!;
    send<GameStartPayload>(MSG.GAME_START, {
      seatAssignments: assignments,
      gameState,
    });
  }, [isAuthority, teamAssignments, room.playerId, setMyPlayer, startGame, send]);

  // ---------------------------------------------------------------------------
  // GAME_START listener (all players)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (roomPhase !== "ready") return;
    return onMessage<GameStartPayload>(MSG.GAME_START, (msg) => {
      const { seatAssignments, gameState } = msg.payload;

      // Build seat map
      const newMap = new Map<string, PlayerIndex>();
      for (const a of seatAssignments) {
        newMap.set(a.playerId, a.seatIndex);
      }
      setSeatMap(newMap);

      // Set local player
      const mySeatIdx = newMap.get(room.playerId);
      if (mySeatIdx !== undefined) {
        setMyPlayer(mySeatIdx);
      }

      applyStateUpdate(gameState);
    });
  }, [roomPhase, onMessage, room.playerId, setMyPlayer, applyStateUpdate]);

  // ---------------------------------------------------------------------------
  // Authority: incoming action handlers
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthority || !seatMap) return;

    const unsubs = [
      onMessage<BidPayload>(MSG.BID, (msg) => {
        const store = useEuchreStore.getState();
        const valid = store.bid(msg.payload.player, msg.payload.action);
        if (valid) {
          send<StateUpdatePayload>(MSG.STATE_UPDATE, {
            gameState: useEuchreStore.getState().game!,
          });
        }
      }),
      onMessage<DiscardPayload>(MSG.DISCARD, (msg) => {
        const store = useEuchreStore.getState();
        const valid = store.dealerDiscard(msg.payload.card);
        if (valid) {
          send<StateUpdatePayload>(MSG.STATE_UPDATE, {
            gameState: useEuchreStore.getState().game!,
          });
        }
      }),
      onMessage<PlayCardPayload>(MSG.PLAY_CARD, (msg) => {
        const store = useEuchreStore.getState();
        const valid = store.playCard(msg.payload.player, msg.payload.card);
        if (valid) {
          send<StateUpdatePayload>(MSG.STATE_UPDATE, {
            gameState: useEuchreStore.getState().game!,
          });
        }
      }),
      onMessage(MSG.NEXT_HAND, () => {
        const store = useEuchreStore.getState();
        store.nextHand();
        send<StateUpdatePayload>(MSG.STATE_UPDATE, {
          gameState: useEuchreStore.getState().game!,
        });
      }),
      onMessage(MSG.PLAY_AGAIN_REQUEST, () => {
        const store = useEuchreStore.getState();
        const dealer = (Math.floor(Math.random() * 4)) as PlayerIndex;
        store.startGame(dealer);
        send<PlayAgainAcceptedPayload>(MSG.PLAY_AGAIN_ACCEPTED, {
          gameState: useEuchreStore.getState().game!,
        });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [isAuthority, seatMap, onMessage, send]);

  // ---------------------------------------------------------------------------
  // Non-authority: state sync
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isAuthority) return;
    return onMessage<StateUpdatePayload>(MSG.STATE_UPDATE, (msg) => {
      useEuchreStore.getState().applyStateUpdate(msg.payload.gameState);
    });
  }, [isAuthority, onMessage]);

  useEffect(() => {
    if (isAuthority) return;
    return onMessage<PlayAgainAcceptedPayload>(MSG.PLAY_AGAIN_ACCEPTED, (msg) => {
      useEuchreStore.getState().applyStateUpdate(msg.payload.gameState);
    });
  }, [isAuthority, onMessage]);

  // ---------------------------------------------------------------------------
  // Reconnection: push state to reconnected players
  // ---------------------------------------------------------------------------

  const prevRosterRef = useRef<PlayerInfo[]>([]);

  useEffect(() => {
    if (!isAuthority || !seatMap) return;

    const prev = prevRosterRef.current;
    for (const player of playerRoster) {
      const prevEntry = prev.find((p) => p.playerId === player.playerId);
      if (
        prevEntry?.status !== "connected" &&
        player.status === "connected" &&
        player.playerId !== room.playerId
      ) {
        // Player just reconnected — send them seat assignments + current state
        const seatAssignments = Array.from(seatMap.entries()).map(
          ([playerId, seatIndex]) => ({ playerId, seatIndex }),
        );
        const currentGame = useEuchreStore.getState().game;
        if (currentGame) {
          sendTo<GameStartPayload>(player.peerId, MSG.GAME_START, {
            seatAssignments,
            gameState: currentGame,
          });
        }
      }
    }
    prevRosterRef.current = [...playerRoster];
  }, [isAuthority, seatMap, playerRoster, room.playerId, sendTo]);

  // ---------------------------------------------------------------------------
  // Action routing callbacks (passed to GameTable)
  // ---------------------------------------------------------------------------

  const handleBid = useCallback(
    (action: BidAction) => {
      if (mySeat === null) return;
      if (isAuthority) {
        const valid = bid(mySeat, action);
        if (valid) {
          send<StateUpdatePayload>(MSG.STATE_UPDATE, {
            gameState: useEuchreStore.getState().game!,
          });
        }
      } else {
        send<BidPayload>(MSG.BID, { player: mySeat, action });
      }
    },
    [isAuthority, mySeat, bid, send],
  );

  const handleCardClick = useCallback(
    (card: Card) => {
      if (mySeat === null) return;
      const g = useEuchreStore.getState().game;
      if (!g) return;

      if (g.phase === "dealer-discard" && g.dealer === mySeat) {
        if (isAuthority) {
          const valid = dealerDiscard(card);
          if (valid) {
            send<StateUpdatePayload>(MSG.STATE_UPDATE, {
              gameState: useEuchreStore.getState().game!,
            });
          }
        } else {
          send<DiscardPayload>(MSG.DISCARD, { card });
        }
      } else if (g.phase === "playing" && g.currentPlayer === mySeat) {
        if (isAuthority) {
          const valid = playCard(mySeat, card);
          if (valid) {
            send<StateUpdatePayload>(MSG.STATE_UPDATE, {
              gameState: useEuchreStore.getState().game!,
            });
          }
        } else {
          send<PlayCardPayload>(MSG.PLAY_CARD, { player: mySeat, card });
        }
      }
    },
    [isAuthority, mySeat, dealerDiscard, playCard, send],
  );

  const handleNextHand = useCallback(() => {
    if (isAuthority) {
      nextHand();
      send<StateUpdatePayload>(MSG.STATE_UPDATE, {
        gameState: useEuchreStore.getState().game!,
      });
    } else {
      send(MSG.NEXT_HAND, {});
    }
  }, [isAuthority, nextHand, send]);

  const handlePlayAgain = useCallback(() => {
    if (isAuthority) {
      const dealer = (Math.floor(Math.random() * 4)) as PlayerIndex;
      startGame(dealer);
      send<PlayAgainAcceptedPayload>(MSG.PLAY_AGAIN_ACCEPTED, {
        gameState: useEuchreStore.getState().game!,
      });
    } else {
      send(MSG.PLAY_AGAIN_REQUEST, {});
    }
  }, [isAuthority, startGame, send]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // All peers disconnected
  if (roomPhase === "disconnected") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Euchre</h1>
        <p className="text-brand-pink font-medium">All players disconnected</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Connection failed
  if (roomPhase === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Euchre</h1>
        <p className="text-red-400 font-medium">Connection failed</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Waiting / connecting
  if (roomPhase !== "ready") {
    const connectedCount = room.players.filter((p) => p.status === "connected").length;
    const totalNeeded = 3; // 3 guests for 4-player Euchre

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Euchre</h1>
        {roomCode && (
          <>
            <p className="text-text-secondary">Share this code with friends:</p>
            <p className="text-4xl font-bold font-mono tracking-widest text-brand-orange">
              {roomCode}
            </p>
          </>
        )}
        <p className="text-text-muted text-sm animate-pulse">
          {connectedCount < totalNeeded
            ? `Waiting for players... (${connectedCount + 1}/4)`
            : "Starting game..."}
        </p>
        <Button variant="ghost" onClick={onLeave}>
          Cancel
        </Button>
      </div>
    );
  }

  // Room ready but no game yet → team selection
  if (!game || myPlayer === null) {
    const teamACount = teamAssignments.filter((a) => a.team === "A").length;
    const teamBCount = teamAssignments.filter((a) => a.team === "B").length;
    const canStart = teamACount === 2 && teamBCount === 2;

    return (
      <TeamSelection
        roster={playerRoster}
        assignments={teamAssignments}
        myPlayerId={room.playerId}
        isHost={isHost}
        canStart={canStart}
        onSelectTeam={handleSelectTeam}
        onStart={handleStartGame}
        onLeave={onLeave}
        roomCode={roomCode}
      />
    );
  }

  // Active game
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
        playerStatuses={playerStatuses}
        isAuthority={isAuthority}
        onBid={handleBid}
        onCardClick={handleCardClick}
        onNextHand={handleNextHand}
        onPlayAgain={handlePlayAgain}
        onLeave={onLeave}
      />
    </div>
  );
}
