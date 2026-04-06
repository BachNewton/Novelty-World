"use client";

import { useTicTacToeStore } from "../store";
import { Button } from "@/shared/components/ui/button";

interface GameStatusProps {
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function GameStatus({ onPlayAgain, onLeave }: GameStatusProps) {
  const currentTurn = useTicTacToeStore((s) => s.currentTurn);
  const myPlayer = useTicTacToeStore((s) => s.myPlayer);
  const phase = useTicTacToeStore((s) => s.phase);
  const result = useTicTacToeStore((s) => s.result);

  return (
    <div className="text-center space-y-3">
      <h1 className="text-2xl font-bold">Tic Tac Toe</h1>

      {phase === "playing" && (
        <p className="text-text-secondary">
          {currentTurn === myPlayer ? (
            <span className="text-brand-green font-medium">Your turn</span>
          ) : (
            <span className="text-text-muted">Opponent&apos;s turn</span>
          )}
          {" — You are "}
          <span
            className={
              myPlayer === "X" ? "text-brand-orange" : "text-brand-blue"
            }
          >
            {myPlayer}
          </span>
        </p>
      )}

      {phase === "finished" && result && (
        <>
          {"winner" in result ? (
            <p className="text-lg font-medium">
              {result.winner === myPlayer ? (
                <span className="text-brand-green">You win!</span>
              ) : (
                <span className="text-brand-pink">You lose!</span>
              )}
            </p>
          ) : (
            <p className="text-lg font-medium text-text-secondary">
              It&apos;s a draw!
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={onPlayAgain}>Play Again</Button>
            <Button variant="ghost" onClick={onLeave}>
              Leave
            </Button>
          </div>
        </>
      )}

      {phase === "playing" && (
        <Button
          variant="ghost"
          onClick={onLeave}
          className="text-xs"
        >
          Leave game
        </Button>
      )}
    </div>
  );
}
