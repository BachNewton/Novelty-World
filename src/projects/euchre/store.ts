"use client";

import { create } from "zustand";
import type {
  Card,
  PlayerIndex,
  GameState,
  BidAction,
  SeatAssignment,
  Team,
  TeamAssignment,
} from "./types";
import {
  createGameState,
  dealHand,
  rotateDealer,
  applyBid as logicApplyBid,
  applyDealerDiscard as logicApplyDealerDiscard,
  applyPlay as logicApplyPlay,
  isGameOver,
} from "./logic";

// ============================================================
// Store types
// ============================================================

interface EuchreActions {
  /** Set this client's player index (assigned during game start handshake). */
  setMyPlayer: (player: PlayerIndex) => void;

  /** Host: start a new game with the given starting dealer. */
  startGame: (startingDealer: PlayerIndex) => void;

  /** Host: validate and apply a bid. Returns true if valid. */
  bid: (player: PlayerIndex, action: BidAction) => boolean;

  /** Host: validate and apply a dealer discard. Returns true if valid. */
  dealerDiscard: (card: Card) => boolean;

  /** Host: validate and apply a card play. Returns true if valid. */
  playCard: (player: PlayerIndex, card: Card) => boolean;

  /** Host: advance to next hand after hand-over (rotate dealer, deal). */
  nextHand: () => void;

  /** Guest: apply authoritative game state from host. */
  applyStateUpdate: (gameState: GameState) => void;

  /** Host: put a player on a team (moving them if already on one). */
  setTeam: (playerId: string, team: Team) => void;

  /** Host: take a departed player off the teams. */
  dropFromTeams: (playerId: string) => void;

  /** Guest: apply the host's teams. */
  setTeams: (teams: TeamAssignment[]) => void;

  /** Fix the seats for a game; sets this client's seat from its player id. */
  seatPlayers: (seats: SeatAssignment[], myPlayerId: string) => void;

  /** Full reset back to pre-game state. */
  reset: () => void;
}

export type EuchreStore = {
  myPlayer: PlayerIndex | null;
  game: GameState | null;
  teams: TeamAssignment[];
  /** Null until a game starts. */
  seats: SeatAssignment[] | null;
} & EuchreActions;

// ============================================================
// Store
// ============================================================

export const useEuchreStore = create<EuchreStore>((set, get) => ({
  myPlayer: null,
  game: null,
  teams: [],
  seats: null,

  setMyPlayer: (player) => set({ myPlayer: player }),

  startGame: (startingDealer) => {
    set({ game: createGameState(startingDealer) });
  },

  bid: (player, action) => {
    const { game } = get();
    if (!game) return false;

    const result = logicApplyBid(game, player, action);
    if (result.valid) {
      set({ game: result.state });
    }
    return result.valid;
  },

  dealerDiscard: (card) => {
    const { game } = get();
    if (!game) return false;

    const result = logicApplyDealerDiscard(game, card);
    if (result.valid) {
      set({ game: result.state });
    }
    return result.valid;
  },

  playCard: (player, card) => {
    const { game } = get();
    if (!game) return false;

    const result = logicApplyPlay(game, player, card);
    if (result.valid) {
      set({ game: result.state });
    }
    return result.valid;
  },

  nextHand: () => {
    const { game } = get();
    if (!game || game.phase !== "hand-over") return;

    // Apply hand result to scores
    const hr = game.handResult!;
    const scores: [number, number] = [...game.scores];
    const scoringIdx = hr.scoringTeam === "A" ? 0 : 1;
    scores[scoringIdx] += hr.points;

    // Check for game over
    const winner = isGameOver(scores);
    if (winner) {
      set({
        game: { ...game, scores, phase: "game-over", handResult: null },
      });
      return;
    }

    // Rotate dealer and deal fresh hand
    const nextDealer = rotateDealer(game.dealer);
    const nextState = dealHand({ ...game, scores, dealer: nextDealer });
    set({ game: nextState });
  },

  applyStateUpdate: (gameState) => set({ game: gameState }),

  setTeam: (playerId, team) =>
    set({ teams: [...get().teams.filter((t) => t.playerId !== playerId), { playerId, team }] }),

  dropFromTeams: (playerId) => set({ teams: get().teams.filter((t) => t.playerId !== playerId) }),

  setTeams: (teams) => set({ teams }),

  seatPlayers: (seats, myPlayerId) =>
    set({ seats, myPlayer: seats.find((s) => s.playerId === myPlayerId)?.seatIndex ?? null }),

  reset: () => set({ myPlayer: null, game: null, teams: [], seats: null }),
}));
