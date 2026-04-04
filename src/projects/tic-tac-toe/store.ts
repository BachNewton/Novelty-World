"use client";

import { create } from "zustand";
import type { Board, Player, GamePhase, GameResult, GameState } from "./types";
import {
  createInitialState,
  applyMove as logicApplyMove,
  resetBoard as logicResetBoard,
  toStateUpdate,
} from "./logic";

interface TicTacToeActions {
  setRoomCode: (code: string) => void;
  setMyPlayer: (player: Player) => void;
  setPhase: (phase: GamePhase) => void;

  /** Host: validate and apply a move. Returns true if valid. */
  applyMove: (cellIndex: number, player: Player) => boolean;

  /** Guest: apply authoritative state from host */
  applyStateUpdate: (update: {
    board: Board;
    currentTurn: Player;
    phase: GamePhase;
    result: GameResult | null;
    winLine: number[] | null;
  }) => void;

  /** Reset board for a new round (keeps connection info) */
  resetGame: () => void;

  /** Full reset back to lobby */
  resetToLobby: () => void;

  /** Get the wire-format state update (for host to send) */
  getStateUpdate: () => ReturnType<typeof toStateUpdate>;
}

export type TicTacToeStore = GameState & TicTacToeActions;

export const useTicTacToeStore = create<TicTacToeStore>((set, get) => ({
  ...createInitialState(),

  setRoomCode: (code) => set({ roomCode: code }),
  setMyPlayer: (player) => set({ myPlayer: player }),
  setPhase: (phase) => set({ phase }),

  applyMove: (cellIndex, player) => {
    const result = logicApplyMove(get(), cellIndex, player);
    if (result.valid) {
      set(result.state);
    }
    return result.valid;
  },

  applyStateUpdate: (update) => set(update),

  resetGame: () => set(logicResetBoard(get())),

  resetToLobby: () => set(createInitialState()),

  getStateUpdate: () => toStateUpdate(get()),
}));
