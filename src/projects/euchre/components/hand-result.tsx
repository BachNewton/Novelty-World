"use client";

import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import type { HandResult, Team } from "../types";

interface HandResultProps {
  result: HandResult;
  myTeam: Team;
  onNextHand: () => void;
  /** When false, show "Waiting..." instead of the button. */
  isAuthority?: boolean;
}

export function HandResultDisplay({
  result,
  myTeam,
  onNextHand,
  isAuthority = true,
}: HandResultProps) {
  const myTeamScored = result.scoringTeam === myTeam;

  return (
    <Card className="p-5 text-center space-y-3 max-w-xs">
      <h2
        className={cn(
          "text-lg font-bold",
          myTeamScored ? "text-brand-green" : "text-brand-pink",
        )}
      >
        {myTeamScored ? "Your team scored!" : "Opponents scored!"}
      </h2>

      <div className="text-sm text-text-secondary space-y-1">
        <p>
          Makers (Team {result.makerTeam}): {result.makerTricksWon} tricks
        </p>
        <p>Defenders: {result.defenderTricksWon} tricks</p>
        {result.euchred && (
          <p className="text-brand-pink font-medium">Euchred!</p>
        )}
        {result.march && (
          <p className="text-brand-green font-medium">March!</p>
        )}
        {result.wentAlone && (
          <p className="text-brand-blue font-medium">Went alone</p>
        )}
      </div>

      <div className="text-xl font-bold text-brand-orange">
        +{result.points} to Team {result.scoringTeam}
      </div>

      {isAuthority ? (
        <Button onClick={onNextHand}>Next Hand</Button>
      ) : (
        <p className="text-sm text-text-muted animate-pulse">
          Waiting for next hand...
        </p>
      )}
    </Card>
  );
}
