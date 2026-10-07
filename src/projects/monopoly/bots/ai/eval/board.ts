import { freshGame } from "../../../mocks";
import type { AuctionState, GameState, PendingTrade, Player, TurnState } from "../../../types";
import { currentTurnNumber, withAiSeat } from "../seat";

// Builders for hand-made positions: a fresh four-seat game where every seat is
// played by the AI version under test, edited into the position a scenario
// needs. The seat whose decision is measured is always `AI`.

export const AI = "p2";
export const RIVAL = "p3";
export const OTHER = "p4";
export const FOURTH = "p1";

/** Board positions by name (see `data.ts` SPACES). */
export const SQ = {
  mediterranean: 1,
  baltic: 3,
  reading: 5,
  oriental: 6,
  vermont: 8,
  connecticut: 9,
  stCharles: 11,
  electric: 12,
  states: 13,
  virginia: 14,
  pennRR: 15,
  stJames: 16,
  tennessee: 18,
  newYork: 19,
  kentucky: 21,
  indiana: 23,
  illinois: 24,
  bAndO: 25,
  atlantic: 26,
  ventnor: 27,
  water: 28,
  marvin: 29,
  pacific: 31,
  northCarolina: 32,
  pennsylvaniaAve: 34,
  shortLine: 35,
  park: 37,
  boardwalk: 39,
} as const;

/** A fresh four-seat game with every seat played by `strategy`, its AI
 *  bookkeeping empty. */
export function table(strategy: string, seed = "scenario"): GameState {
  const game = freshGame(seed, undefined, 4);
  return { ...game, players: game.players.map((p) => ({ ...p, botStrategy: strategy })), ai: {} };
}

export function withTurn(state: GameState, patch: Partial<TurnState>): GameState {
  return { ...state, turn: { ...state.turn, ...patch } };
}

export function withPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function withCash(state: GameState, cash: Readonly<Record<string, number>>): GameState {
  return { ...state, players: state.players.map((p) => (p.id in cash ? { ...p, cash: cash[p.id] } : p)) };
}

/** Give each listed seat its lots. */
export function owning(state: GameState, lots: Readonly<Record<string, readonly number[]>>): GameState {
  const ownership: Record<number, string> = { ...state.ownership };
  for (const [seat, positions] of Object.entries(lots)) for (const pos of positions) ownership[pos] = seat;
  return { ...state, ownership };
}

/** Set development levels (1–4 houses, 5 a hotel). */
export function built(state: GameState, levels: Readonly<Record<number, number>>): GameState {
  return { ...state, houses: { ...state.houses, ...levels } };
}

export function mortgaging(state: GameState, positions: readonly number[]): GameState {
  const mortgaged: Record<number, boolean> = { ...state.mortgaged };
  for (const pos of positions) mortgaged[pos] = true;
  return { ...state, mortgaged };
}

/** Turn-group `turn` of the game: a later turn reads as mid or late game in
 *  the AI's prompt. Empty groups, so the log stays quiet. */
export function atTurn(state: GameState, turn: number): GameState {
  const players = state.players.map((p) => p.id);
  const turns = Array.from({ length: turn }, (_, i) => ({ turn: i + 1, playerId: players[i % players.length], events: [] }));
  return { ...state, turns };
}

/** The AI seat at its own turn start, with the turn-start question already
 *  asked this turn-group, so it owes only the decision the scenario sets up. */
export function quietTurnStart(state: GameState): GameState {
  return withAiSeat(state, AI, { turnStart: { turn: currentTurnNumber(state), fingerprint: "" } });
}

/** The AI seat has landed on an unowned lot it can afford. */
export function landed(state: GameState, position: number): GameState {
  return quietTurnStart(
    withTurn(withPlayer(state, AI, { position }), { playerId: AI, phase: "buy-decision", pendingBuy: position }),
  );
}

/** An auction on `position`, opened on `opener`'s landing, with every seat
 *  still in and the AI not yet asked. */
export function auctioning(state: GameState, position: number, patch: Partial<AuctionState> = {}, opener = FOURTH): GameState {
  const auction: AuctionState = {
    position,
    active: state.players.map((p) => p.id),
    highBid: 0,
    leaderId: null,
    bids: {},
    resume: { kind: "landing" },
    ...patch,
  };
  return withTurn(state, { playerId: opener, phase: "auction", auction });
}

/** A trade `proposer` has put to the table, waiting on the AI's vote. */
export function offered(
  state: GameState,
  proposer: string,
  terms: Pick<PendingTrade, "propertyTo" | "cashDelta"> & Partial<Pick<PendingTrade, "gojfTo">>,
): GameState {
  const parties = new Set<string>([proposer, AI, ...Object.keys(terms.cashDelta)]);
  for (const owner of Object.values(terms.propertyTo)) parties.add(owner);
  for (const pos of Object.keys(terms.propertyTo).map(Number)) {
    if (pos in state.ownership) parties.add(state.ownership[pos]);
  }
  const approvals: Record<string, boolean> = {};
  for (const party of parties) approvals[party] = party === proposer;
  const pendingTrade: PendingTrade = {
    id: "t-scenario",
    proposerId: proposer,
    gojfTo: {},
    ...terms,
    approvals,
  };
  return withTurn(state, { playerId: proposer, phase: "trade-pending", pendingTrade });
}

/** The AI seat at its own pre-roll, owing its turn-start question. */
export function turnStart(state: GameState): GameState {
  return withTurn(state, { playerId: AI, phase: "pre-roll" });
}

/** The AI seat in jail at the start of its turn (`jailTurns` failed rolls so
 *  far), its turn-start question already asked. */
export function jailed(state: GameState, jailTurns: number): GameState {
  return quietTurnStart(
    withTurn(withPlayer(state, AI, { inJail: true, jailTurns, position: 10 }), {
      playerId: AI,
      phase: "jail-decision",
    }),
  );
}

/** The AI seat below zero after a charge, owing its debt plan. */
export function inDebt(state: GameState, cash: number): GameState {
  return quietTurnStart(
    withTurn(withCash(state, { [AI]: cash }), { playerId: AI, phase: "must-raise-cash", raiseCash: "after-landing" }),
  );
}
