import type { Board, Player, GameState, GameResult } from "./types";

/** All possible winning lines (indices into the 9-cell board) */
export const WIN_LINES: readonly number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],             // diagonals
];

const EMPTY_BOARD: Board = [
  null, null, null,
  null, null, null,
  null, null, null,
];

/** Create a fresh initial game state */
export function createInitialState(): GameState {
  return {
    board: [...EMPTY_BOARD] as Board,
    currentTurn: "X",
    phase: "lobby",
    result: null,
    myPlayer: null,
    roomCode: null,
    winLine: null,
  };
}

/** Check if a player has won. Returns the winning line or null. */
export function checkWinner(
  board: Board,
  player: Player,
): number[] | null {
  for (const line of WIN_LINES) {
    if (line.every((i) => board[i] === player)) {
      return line;
    }
  }
  return null;
}

/** Check if the board is full (draw if no winner) */
export function checkDraw(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

/**
 * Validate and apply a move. Returns the new state and whether the move was valid.
 * Pure function — no mutations.
 */
export function applyMove(
  state: GameState,
  cellIndex: number,
  player: Player,
): { valid: boolean; state: GameState } {
  if (state.phase !== "playing") return { valid: false, state };
  if (player !== state.currentTurn) return { valid: false, state };
  if (cellIndex < 0 || cellIndex > 8) return { valid: false, state };
  if (state.board[cellIndex] !== null) return { valid: false, state };

  const newBoard = [...state.board] as Board;
  newBoard[cellIndex] = player;

  // Check for win
  const winLine = checkWinner(newBoard, player);
  if (winLine) {
    return {
      valid: true,
      state: {
        ...state,
        board: newBoard,
        phase: "finished",
        result: { winner: player },
        winLine,
      },
    };
  }

  // Check for draw
  if (checkDraw(newBoard)) {
    return {
      valid: true,
      state: {
        ...state,
        board: newBoard,
        phase: "finished",
        result: { draw: true },
        winLine: null,
      },
    };
  }

  // Continue — switch turns
  return {
    valid: true,
    state: {
      ...state,
      board: newBoard,
      currentTurn: player === "X" ? "O" : "X",
    },
  };
}

/** Reset just the board for a new round, keeping connection info */
export function resetBoard(state: GameState): GameState {
  return {
    ...state,
    board: [...EMPTY_BOARD] as Board,
    currentTurn: "X",
    phase: "playing",
    result: null,
    winLine: null,
  };
}

/** Extract the fields sent over the wire as a state update */
export function toStateUpdate(
  state: GameState,
): Pick<GameState, "board" | "currentTurn" | "phase" | "result" | "winLine"> {
  return {
    board: state.board,
    currentTurn: state.currentTurn,
    phase: state.phase,
    result: state.result,
    winLine: state.winLine,
  };
}
