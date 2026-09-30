"use client";

import { useState } from "react";
import { useRoom } from "@/shared/lib/peer";
import { useProfile } from "@/shared/lib/profile";
import { useTicTacToeStore } from "../store";
import { randomPlayer } from "../logic";
import type { GuestMessage, HostMessage, Player } from "../types";
import { Lobby } from "./lobby";
import { GameSession } from "./game-session";

function otherPlayer(p: Player): Player {
  return p === "X" ? "O" : "X";
}

/**
 * Two players: the host and the first guest. The host owns the board,
 * applies moves (its own and the guest's) and sends the result back.
 */
export function TicTacToe() {
  const profile = useProfile();
  const [opponentLeft, setOpponentLeft] = useState(false);

  const room = useRoom<HostMessage, GuestMessage>({
    game: "tic-tac-toe",
    profile,
    onGuestJoined(player) {
      // Only the first guest plays; anyone after them waits unseated.
      if (useTicTacToeStore.getState().myPlayer !== null) return;
      setOpponentLeft(false);
      startRound(player.peerId);
    },
    onGuestLeft() {
      setOpponentLeft(true);
      useTicTacToeStore.getState().reset();
    },
    onGuestMessage(_from, message) {
      const store = useTicTacToeStore.getState();
      if (store.myPlayer === null) return;
      switch (message.kind) {
        case "move":
          if (store.applyMove(message.cellIndex, otherPlayer(store.myPlayer))) broadcastState();
          break;
        case "play-again":
          startRound();
          break;
      }
    },
    onHostMessage(message) {
      const store = useTicTacToeStore.getState();
      switch (message.kind) {
        case "start":
          store.resetGame();
          store.setMyPlayer(otherPlayer(message.hostPlayer));
          break;
        case "state":
          store.applyStateUpdate(message.update);
          break;
      }
    },
  });

  /** Host: a fresh board with sides drawn at random. */
  function startRound(toPeerId?: string) {
    const store = useTicTacToeStore.getState();
    const hostPlayer = randomPlayer();
    store.resetGame();
    store.setMyPlayer(hostPlayer);
    if (toPeerId === undefined) room.broadcast({ kind: "start", hostPlayer });
    else room.sendTo(toPeerId, { kind: "start", hostPlayer });
  }

  function broadcastState() {
    room.broadcast({ kind: "state", update: useTicTacToeStore.getState().getStateUpdate() });
  }

  function handleCellClick(cellIndex: number) {
    const state = useTicTacToeStore.getState();
    if (state.phase !== "playing" || state.currentTurn !== state.myPlayer || state.board[cellIndex] !== null) return;
    if (room.role === "host") {
      if (state.applyMove(cellIndex, state.myPlayer)) broadcastState();
    } else {
      room.sendToHost({ kind: "move", cellIndex });
    }
  }

  function handlePlayAgain() {
    if (room.role === "host") startRound();
    else room.sendToHost({ kind: "play-again" });
  }

  function handleLeave() {
    room.leave();
    setOpponentLeft(false);
    useTicTacToeStore.getState().reset();
  }

  if (room.code === null || room.status === "not-found") {
    return (
      <Lobby
        onCreate={room.create}
        onJoin={room.join}
        notice={room.status === "not-found" ? `No room with code ${room.code}` : null}
      />
    );
  }

  return (
    <GameSession
      status={room.status}
      isHost={room.role === "host"}
      roomCode={room.code}
      opponentLeft={opponentLeft}
      onCellClick={handleCellClick}
      onPlayAgain={handlePlayAgain}
      onLeave={handleLeave}
    />
  );
}
