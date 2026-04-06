"use client";

import { cn } from "@/shared/lib/utils";
import type { Card } from "../types";
import { PlayingCard } from "./playing-card";

export type SeatPosition = "bottom" | "top" | "left" | "right";

interface PlayerHandProps {
  cards: Card[];
  /** Cards the player is allowed to play (highlighted). Null = no interaction. */
  validPlays?: Card[] | null;
  onCardClick?: (card: Card) => void;
  /** Where this hand sits relative to the local player. */
  position: SeatPosition;
  /** Show cards face-down (opponent hands). */
  faceDown?: boolean;
  /** This player is the current actor. */
  isActive?: boolean;
  label?: string;
  trickCount?: number;
}

function isCardInList(card: Card, list: Card[]): boolean {
  return list.some((c) => c.suit === card.suit && c.rank === card.rank);
}

export function PlayerHand({
  cards,
  validPlays,
  onCardClick,
  position,
  faceDown,
  isActive,
  label,
  trickCount,
}: PlayerHandProps) {
  const isSide = position === "left" || position === "right";
  const cardSize = position === "bottom" ? "md" : "sm";

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Player label */}
      {label && (
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "font-medium",
              isActive ? "text-brand-green" : "text-text-secondary",
            )}
          >
            {label}
          </span>
          {trickCount != null && (
            <span className="text-text-muted text-xs">
              {trickCount} {trickCount === 1 ? "trick" : "tricks"}
            </span>
          )}
        </div>
      )}

      {/* Cards */}
      <div
        className={cn(
          "flex",
          // Side players: horizontal on mobile, vertical on desktop
          isSide && "flex-row -space-x-4 md:flex-col md:space-x-0 md:-space-y-10",
          // Top/bottom: always horizontal
          !isSide && "flex-row",
          position === "top" && "-space-x-4",
          position === "bottom" && "-space-x-2",
        )}
      >
        {cards.map((card, i) => {
          const isValid = validPlays ? isCardInList(card, validPlays) : false;
          return (
            <PlayingCard
              key={`${card.suit}-${card.rank}-${i}`}
              card={card}
              faceDown={faceDown}
              size={cardSize}
              highlighted={isValid}
              disabled={validPlays != null && !isValid}
              onClick={
                onCardClick && isValid ? () => onCardClick(card) : undefined
              }
            />
          );
        })}
        {cards.length === 0 && (
          <div className="text-text-muted text-xs italic">No cards</div>
        )}
      </div>
    </div>
  );
}
