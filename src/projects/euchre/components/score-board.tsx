"use client";

import { cn } from "@/shared/lib/utils";

interface ScoreBoardProps {
  scores: [number, number];
  /** Trick counts for the current hand: [teamA, teamB]. */
  trickCounts?: [number, number];
  /** Which team the local player is on, for highlighting. */
  myTeam?: "A" | "B";
}

export function ScoreBoard({ scores, trickCounts, myTeam }: ScoreBoardProps) {
  return (
    <div className="flex items-center gap-4 rounded-md bg-surface-secondary border border-border-default px-4 py-2 text-sm">
      <TeamScore
        label="Team A"
        score={scores[0]}
        tricks={trickCounts?.[0]}
        isMyTeam={myTeam === "A"}
      />
      <div className="text-text-muted">&ndash;</div>
      <TeamScore
        label="Team B"
        score={scores[1]}
        tricks={trickCounts?.[1]}
        isMyTeam={myTeam === "B"}
      />
    </div>
  );
}

function TeamScore({
  label,
  score,
  tricks,
  isMyTeam,
}: {
  label: string;
  score: number;
  tricks?: number;
  isMyTeam: boolean;
}) {
  return (
    <div className="flex flex-col items-center min-w-[4rem]">
      <span
        className={cn(
          "text-xs",
          isMyTeam ? "text-brand-orange font-medium" : "text-text-muted",
        )}
      >
        {label}
        {isMyTeam && " (you)"}
      </span>
      <span className="text-lg font-bold text-text-primary">{score}</span>
      {tricks != null && (
        <span className="text-xs text-text-muted">
          {tricks} {tricks === 1 ? "trick" : "tricks"}
        </span>
      )}
    </div>
  );
}
