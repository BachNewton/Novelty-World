"use client";

import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import type { Team } from "../types";

interface GameOverProps {
  scores: [number, number];
  myTeam: Team;
  onPlayAgain?: () => void;
  onLeave?: () => void;
}

export function GameOver({ scores, myTeam, onPlayAgain, onLeave }: GameOverProps) {
  const winnerIdx = scores[0] >= 10 ? 0 : 1;
  const winnerTeam: Team = winnerIdx === 0 ? "A" : "B";
  const iWon = myTeam === winnerTeam;

  return (
    <Card className="p-6 text-center space-y-4 max-w-sm">
      <h2
        className={cn(
          "text-2xl font-bold",
          iWon ? "text-brand-green" : "text-brand-pink",
        )}
      >
        {iWon ? "You Win!" : "You Lose"}
      </h2>

      <p className="text-text-secondary">
        Team {winnerTeam} wins with {scores[winnerIdx]} points
      </p>

      <div className="flex justify-center gap-6 text-sm">
        <div>
          <div className={cn("font-medium", myTeam === "A" ? "text-brand-orange" : "text-text-secondary")}>
            Team A
          </div>
          <div className="text-2xl font-bold">{scores[0]}</div>
        </div>
        <div className="text-text-muted self-center">&ndash;</div>
        <div>
          <div className={cn("font-medium", myTeam === "B" ? "text-brand-orange" : "text-text-secondary")}>
            Team B
          </div>
          <div className="text-2xl font-bold">{scores[1]}</div>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        {onPlayAgain && <Button onClick={onPlayAgain}>Play Again</Button>}
        {onLeave && (
          <Button variant="ghost" onClick={onLeave}>
            Leave
          </Button>
        )}
      </div>
    </Card>
  );
}
