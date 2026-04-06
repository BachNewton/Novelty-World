"use client";

import { useEffect, useCallback } from "react";
import type { GameRoom } from "@/shared/lib/multiplayer";
import { useTicTacToeStore } from "../store";
import { randomPlayer } from "../logic";
import { MSG } from "../types";
import type {
  Player,
  MoveRequest,
  StateUpdate,
  GameStart,
  PlayAgainAccepted,
} from "../types";
import { Board } from "./board";
import { GameStatus } from "./game-status";
import { ConnectionStatus } from "./connection-status";
import { Button } from "@/shared/components/ui/button";

interface GameSessionProps {
  room: GameRoom;
  onLeave: () => void;
}

/** Return the opposite player */
function otherPlayer(p: Player): Player {
  return p === "X" ? "O" : "X";
}

export function GameSession({ room, onLeave }: GameSessionProps) {
  const { phase: roomPhase, isHost, roomCode, send, onMessage } = room;

  const myPlayer = useTicTacToeStore((s) => s.myPlayer);
  const applyMove = useTicTacToeStore((s) => s.applyMove);

  // HOST: when room is ready, assign players and send GAME_START
  useEffect(() => {
    if (roomPhase !== "ready" || !isHost) return;

    const store = useTicTacToeStore.getState();
    // Skip if already assigned (e.g. strict mode remount)
    if (store.myPlayer) return;

    const hostPlayer = randomPlayer();
    store.setMyPlayer(hostPlayer);
    send<GameStart>(MSG.GAME_START, { hostPlayer });
  }, [roomPhase, isHost, send]);

  // GUEST: listen for GAME_START to learn player assignment
  useEffect(() => {
    if (isHost) return;
    return onMessage<GameStart>(MSG.GAME_START, (msg) => {
      const store = useTicTacToeStore.getState();
      store.setMyPlayer(otherPlayer(msg.payload.hostPlayer));
    });
  }, [isHost, onMessage]);

  // HOST: listen for move requests from guest
  useEffect(() => {
    if (!isHost) return;
    return onMessage<MoveRequest>(MSG.MOVE_REQUEST, (msg) => {
      const store = useTicTacToeStore.getState();
      const guestPlayer = otherPlayer(store.myPlayer!);
      const valid = store.applyMove(msg.payload.cellIndex, guestPlayer);
      if (valid) {
        send<StateUpdate>(
          MSG.STATE_UPDATE,
          useTicTacToeStore.getState().getStateUpdate(),
        );
      }
    });
  }, [isHost, onMessage, send]);

  // GUEST: listen for state updates from host
  useEffect(() => {
    if (isHost) return;
    return onMessage<StateUpdate>(MSG.STATE_UPDATE, (msg) => {
      useTicTacToeStore.getState().applyStateUpdate(msg.payload);
    });
  }, [isHost, onMessage]);

  // Host: reset board and broadcast new game to all peers
  const hostStartNewRound = useCallback(() => {
    const hostPlayer = randomPlayer();
    useTicTacToeStore.getState().resetGame();
    useTicTacToeStore.getState().setMyPlayer(hostPlayer);
    send<PlayAgainAccepted>(MSG.PLAY_AGAIN_ACCEPTED, {
      board: useTicTacToeStore.getState().board,
      currentTurn: useTicTacToeStore.getState().currentTurn,
      hostPlayer,
    });
  }, [send]);

  // HOST: listen for play-again requests
  useEffect(() => {
    if (!isHost) return;
    return onMessage(MSG.PLAY_AGAIN_REQUEST, () => hostStartNewRound());
  }, [isHost, onMessage, hostStartNewRound]);

  // GUEST: listen for play-again accepted
  useEffect(() => {
    if (isHost) return;
    return onMessage<PlayAgainAccepted>(
      MSG.PLAY_AGAIN_ACCEPTED,
      (msg) => {
        useTicTacToeStore.getState().setMyPlayer(
          otherPlayer(msg.payload.hostPlayer),
        );
        useTicTacToeStore.getState().applyStateUpdate({
          board: msg.payload.board,
          currentTurn: msg.payload.currentTurn,
          phase: "playing",
          result: null,
          winLine: null,
        });
      },
    );
  }, [isHost, onMessage]);

  const handleCellClick = useCallback(
    (cellIndex: number) => {
      const state = useTicTacToeStore.getState();
      if (
        state.phase !== "playing" ||
        state.currentTurn !== state.myPlayer ||
        state.board[cellIndex] !== null
      )
        return;

      if (isHost) {
        const valid = applyMove(cellIndex, state.myPlayer!);
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
    [isHost, applyMove, send],
  );

  const handlePlayAgain = useCallback(() => {
    if (isHost) {
      hostStartNewRound();
    } else {
      send(MSG.PLAY_AGAIN_REQUEST, {});
    }
  }, [isHost, send, hostStartNewRound]);

  // --- Render based on framework phase ---

  // Opponent disconnected
  if (roomPhase === "disconnected") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <p className="text-brand-pink font-medium">Opponent disconnected</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Connection failed
  if (roomPhase === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <p className="text-red-400 font-medium">Connection failed</p>
        <p className="text-text-muted text-sm">
          Could not connect to the other player.
        </p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  // Waiting / connecting / ready but no player assignment yet
  if (roomPhase !== "ready" || !myPlayer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Tic Tac Toe</h1>
        <ConnectionStatus state={roomPhase === "waiting" ? "new" : "connecting"} />
        {isHost && roomPhase === "waiting" && (
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
        {!isHost && (
          <p className="text-text-muted text-sm animate-pulse">
            Connecting to room...
          </p>
        )}
        <Button variant="ghost" onClick={onLeave}>
          Cancel
        </Button>
      </div>
    );
  }

  // Game is active
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <GameStatus onPlayAgain={handlePlayAgain} onLeave={onLeave} />
      <Board onCellClick={handleCellClick} />
    </div>
  );
}
