"use client";

import { useEffect, useCallback, useRef } from "react";
import { usePeer, useLobby } from "@/shared/lib/webrtc";
import type { PeerRole } from "@/shared/lib/webrtc";
import { useTicTacToeStore } from "../store";
import { MSG } from "../types";
import type { MoveRequest, StateUpdate, PlayAgainAccepted } from "../types";
import { Board } from "./board";
import { GameStatus } from "./game-status";
import { ConnectionStatus } from "./connection-status";
import { Button } from "@/shared/components/ui/button";

interface GameSessionProps {
  roomCode: string;
  role: PeerRole;
}

export function GameSession({ roomCode, role }: GameSessionProps) {
  const {
    isConnected,
    connectionState,
    peers,
    send,
    onMessage,
    disconnect,
  } = usePeer(roomCode, role, { maxPeers: 1 });

  const { advertise } = useLobby({ game: "tic-tac-toe" });
  const unadvertiseRef = useRef<(() => void) | null>(null);

  const phase = useTicTacToeStore((s) => s.phase);
  const applyMove = useTicTacToeStore((s) => s.applyMove);
  const setPhase = useTicTacToeStore((s) => s.setPhase);
  const resetGame = useTicTacToeStore((s) => s.resetGame);
  const resetToLobby = useTicTacToeStore((s) => s.resetToLobby);

  // Host: advertise room in lobby while waiting
  useEffect(() => {
    if (role !== "host") return;
    if (phase !== "waiting") return;

    unadvertiseRef.current = advertise({
      roomCode,
      game: "tic-tac-toe",
      playerCount: 1,
      maxPlayers: 2,
      createdAt: Date.now(),
    });

    return () => {
      unadvertiseRef.current?.();
      unadvertiseRef.current = null;
    };
  }, [role, phase, roomCode, advertise]);

  // When WebRTC connects, transition to playing (and stop advertising)
  useEffect(() => {
    if (isConnected && phase === "waiting") {
      setPhase("playing");
      unadvertiseRef.current?.();
      unadvertiseRef.current = null;
    }
  }, [isConnected, phase, setPhase]);

  // HOST: listen for move requests from guest
  useEffect(() => {
    if (role !== "host") return;
    return onMessage<MoveRequest>(MSG.MOVE_REQUEST, (msg) => {
      const valid = useTicTacToeStore.getState().applyMove(msg.payload.cellIndex, "O");
      if (valid) {
        send<StateUpdate>(
          MSG.STATE_UPDATE,
          useTicTacToeStore.getState().getStateUpdate(),
        );
      }
    });
  }, [role, onMessage, send]);

  // GUEST: listen for state updates from host
  useEffect(() => {
    if (role !== "guest") return;
    return onMessage<StateUpdate>(MSG.STATE_UPDATE, (msg) => {
      useTicTacToeStore.getState().applyStateUpdate(msg.payload);
    });
  }, [role, onMessage]);

  // HOST: listen for play-again requests
  useEffect(() => {
    if (role !== "host") return;
    return onMessage(MSG.PLAY_AGAIN_REQUEST, () => {
      useTicTacToeStore.getState().resetGame();
      send<PlayAgainAccepted>(MSG.PLAY_AGAIN_ACCEPTED, {
        board: useTicTacToeStore.getState().board,
        currentTurn: useTicTacToeStore.getState().currentTurn,
      });
    });
  }, [role, onMessage, send]);

  // GUEST: listen for play-again accepted
  useEffect(() => {
    if (role !== "guest") return;
    return onMessage<PlayAgainAccepted>(
      MSG.PLAY_AGAIN_ACCEPTED,
      (msg) => {
        useTicTacToeStore.getState().applyStateUpdate({
          ...msg.payload,
          phase: "playing",
          result: null,
          winLine: null,
        });
      },
    );
  }, [role, onMessage]);

  const handleCellClick = useCallback(
    (cellIndex: number) => {
      const state = useTicTacToeStore.getState();
      if (
        state.phase !== "playing" ||
        state.currentTurn !== state.myPlayer ||
        state.board[cellIndex] !== null
      )
        return;

      if (role === "host") {
        const valid = applyMove(cellIndex, "X");
        if (valid) {
          send<StateUpdate>(
            MSG.STATE_UPDATE,
            useTicTacToeStore.getState().getStateUpdate(),
          );
        }
      } else {
        send<MoveRequest>(MSG.MOVE_REQUEST, { cellIndex });
      }
    },
    [role, applyMove, send],
  );

  const handlePlayAgain = useCallback(() => {
    if (role === "host") {
      resetGame();
      send<PlayAgainAccepted>(MSG.PLAY_AGAIN_ACCEPTED, {
        board: useTicTacToeStore.getState().board,
        currentTurn: useTicTacToeStore.getState().currentTurn,
      });
    } else {
      send(MSG.PLAY_AGAIN_REQUEST, {});
    }
  }, [role, resetGame, send]);

  const handleLeave = useCallback(() => {
    disconnect();
    resetToLobby();
  }, [disconnect, resetToLobby]);

  // Track if we've ever been connected so we don't show "disconnected" during initial handshake
  const wasConnectedRef = useRef(false);
  if (isConnected) wasConnectedRef.current = true;

  // Opponent disconnected (only after we were connected at least once)
  const peerDisconnected =
    wasConnectedRef.current &&
    peers.length > 0 &&
    peers.every((p) => !p.connected);

  if (peerDisconnected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <p className="text-brand-pink font-medium">Opponent disconnected</p>
        <Button onClick={handleLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Connection failed
  if (connectionState === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <p className="text-red-400 font-medium">Connection failed</p>
        <p className="text-text-muted text-sm">
          Could not connect to the other player.
        </p>
        <Button onClick={handleLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Waiting for connection
  if (!isConnected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <ConnectionStatus state={connectionState} />
        {role === "host" && (
          <>
            <p className="text-text-secondary">
              Share this code with your opponent:
            </p>
            <p className="text-4xl font-bold font-mono tracking-widest text-brand-orange">
              {roomCode}
            </p>
            <p className="text-text-muted text-sm animate-pulse">
              Waiting for opponent...
            </p>
          </>
        )}
        {role === "guest" && (
          <p className="text-text-muted text-sm animate-pulse">
            Connecting to room...
          </p>
        )}
        <Button variant="ghost" onClick={handleLeave}>
          Cancel
        </Button>
      </div>
    );
  }

  // Game is active
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <GameStatus onPlayAgain={handlePlayAgain} onLeave={handleLeave} />
      <Board onCellClick={handleCellClick} />
    </div>
  );
}
