/** Cell value: null = empty */
export type CellValue = "X" | "O" | null;

/** 3x3 board as a flat 9-element tuple (row-major: 0-2 top, 3-5 mid, 6-8 bot) */
export type Board = [
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
];

export type Player = "X" | "O";

export type GamePhase = "playing" | "finished";

export type GameResult = { winner: Player } | { draw: true };

/** Game-only state (no connection/lifecycle — owned by the shared peer room) */
export interface GameState {
  board: Board;
  currentTurn: Player;
  phase: GamePhase;
  result: GameResult | null;
  myPlayer: Player | null;
  /** Indices of the 3 winning cells, for highlighting */
  winLine: number[] | null;
}

// --- Wire messages ---

/** Host → guest: the authoritative board */
export interface StateUpdate {
  board: Board;
  currentTurn: Player;
  phase: GamePhase;
  result: GameResult | null;
  winLine: number[] | null;
}

/** Host → guest. `start` begins a round on a fresh board. */
export type HostMessage =
  | { kind: "start"; hostPlayer: Player }
  | { kind: "state"; update: StateUpdate };

/** Guest → host. */
export type GuestMessage = { kind: "move"; cellIndex: number } | { kind: "play-again" };
