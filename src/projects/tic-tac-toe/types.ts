/** Cell value: null = empty */
export type CellValue = "X" | "O" | null;

/** 3x3 board as a flat 9-element tuple (row-major: 0-2 top, 3-5 mid, 6-8 bot) */
export type Board = [
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
];

export type Player = "X" | "O";

export type GamePhase = "lobby" | "waiting" | "playing" | "finished";

export type GameResult = { winner: Player } | { draw: true };

/** Full game state */
export interface GameState {
  board: Board;
  currentTurn: Player;
  phase: GamePhase;
  result: GameResult | null;
  myPlayer: Player | null;
  roomCode: string | null;
  /** Indices of the 3 winning cells, for highlighting */
  winLine: number[] | null;
}

// --- DataChannel message payloads ---

/** Guest → Host: request to place a mark */
export interface MoveRequest {
  cellIndex: number;
}

/** Host → Guest: authoritative state update */
export interface StateUpdate {
  board: Board;
  currentTurn: Player;
  phase: GamePhase;
  result: GameResult | null;
  winLine: number[] | null;
}

/** Either → other: request to play again */
export type PlayAgainRequest = Record<string, never>;

/** Host → Guest: new game started */
export interface PlayAgainAccepted {
  board: Board;
  currentTurn: Player;
}

/** Message type string constants */
export const MSG = {
  MOVE_REQUEST: "move-request",
  STATE_UPDATE: "state-update",
  PLAY_AGAIN_REQUEST: "play-again-request",
  PLAY_AGAIN_ACCEPTED: "play-again-accepted",
} as const;
