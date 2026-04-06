"use client";

import { cn } from "@/shared/lib/utils";
import type { Card, TrickCard, Suit, PlayerIndex } from "../types";
import { PlayingCard } from "./playing-card";

interface TrickAreaProps {
  /** Cards played so far in the current trick. */
  currentTrick: TrickCard[];
  /** Trump suit (shown as indicator). */
  trumpSuit: Suit | null;
  /** The face-up card during bidding round 1. */
  upCard?: Card | null;
  /** Map from PlayerIndex → seat position for layout. */
  seatOf: (player: PlayerIndex) => "bottom" | "top" | "left" | "right";
}

const SEAT_POSITIONS = {
  bottom: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1",
  top: "top-0 left-1/2 -translate-x-1/2 -translate-y-1",
  left: "left-0 top-1/2 -translate-y-1/2 -translate-x-1",
  right: "right-0 top-1/2 -translate-y-1/2 translate-x-1",
};

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

export function TrickArea({
  currentTrick,
  trumpSuit,
  upCard,
  seatOf,
}: TrickAreaProps) {
  return (
    <div className="relative w-48 h-36 sm:w-56 sm:h-40">
      {/* Trump indicator */}
      {trumpSuit && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-text-muted flex items-center gap-1">
          Trump:
          <span
            className={cn(
              "font-bold text-sm",
              trumpSuit === "hearts" || trumpSuit === "diamonds"
                ? "text-red-400"
                : "text-text-primary",
            )}
          >
            {SUIT_SYMBOL[trumpSuit]}
          </span>
        </div>
      )}

      {/* Up card (bidding round 1) */}
      {upCard && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <PlayingCard card={upCard} size="md" />
        </div>
      )}

      {/* Trick cards positioned by seat */}
      {currentTrick.map((tc) => {
        const seat = seatOf(tc.player);
        return (
          <div
            key={`${tc.card.suit}-${tc.card.rank}`}
            className={cn("absolute transition-all duration-300", SEAT_POSITIONS[seat])}
          >
            <PlayingCard card={tc.card} size="sm" />
          </div>
        );
      })}

      {/* Empty state */}
      {currentTrick.length === 0 && !upCard && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-24 rounded-lg border-2 border-dashed border-border-default/50" />
        </div>
      )}
    </div>
  );
}
