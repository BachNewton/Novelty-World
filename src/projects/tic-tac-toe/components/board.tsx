"use client";

import { useTicTacToeStore } from "../store";
import { Cell } from "./cell";

interface BoardProps {
  onCellClick: (index: number) => void;
}

export function Board({ onCellClick }: BoardProps) {
  const board = useTicTacToeStore((s) => s.board);
  const winLine = useTicTacToeStore((s) => s.winLine);
  const currentTurn = useTicTacToeStore((s) => s.currentTurn);
  const myPlayer = useTicTacToeStore((s) => s.myPlayer);
  const phase = useTicTacToeStore((s) => s.phase);

  const isMyTurn = phase === "playing" && currentTurn === myPlayer;

  return (
    <div className="grid grid-cols-3 gap-2 w-[min(80vw,320px)]">
      {board.map((value, index) => (
        <Cell
          key={index}
          value={value}
          isWinning={winLine?.includes(index) ?? false}
          isClickable={isMyTurn && value === null}
          onClick={() => onCellClick(index)}
        />
      ))}
    </div>
  );
}
