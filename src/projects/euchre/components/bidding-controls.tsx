"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { Suit, BidAction } from "../types";

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const ALL_SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

interface BiddingControlsProps {
  /** "bidding-round-1" or "bidding-round-2" */
  round: 1 | 2;
  /** The up card's suit (round 1 context). */
  upCardSuit?: Suit;
  /** Suit turned down in round 1 (cannot pick in round 2). */
  turnedDownSuit?: Suit | null;
  /** Whether the current player can pass (false = stick-the-dealer). */
  canPass: boolean;
  /** Whether it's this client's turn to bid. */
  isMyTurn: boolean;
  onBid: (action: BidAction) => void;
}

export function BiddingControls({
  round,
  upCardSuit,
  turnedDownSuit,
  canPass,
  isMyTurn,
  onBid,
}: BiddingControlsProps) {
  const [alone, setAlone] = useState(false);

  if (!isMyTurn) {
    return (
      <div className="text-text-muted text-sm animate-pulse">
        Waiting for bid...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Alone toggle */}
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={alone}
          onChange={(e) => setAlone(e.target.checked)}
          className="accent-brand-orange"
        />
        Go alone
      </label>

      {round === 1 ? (
        /* Round 1: Order up or pass */
        <div className="flex gap-3">
          <Button
            onClick={() => onBid({ type: "order-up", alone })}
          >
            Order Up {upCardSuit && SUIT_SYMBOL[upCardSuit]}
          </Button>
          {canPass && (
            <Button variant="secondary" onClick={() => onBid({ type: "pass" })}>
              Pass
            </Button>
          )}
        </div>
      ) : (
        /* Round 2: Pick a suit or pass */
        <div className="flex flex-col items-center gap-3">
          <div className="text-sm text-text-secondary">Name trump:</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {ALL_SUITS.filter((s) => s !== turnedDownSuit).map((suit) => (
              <button
                key={suit}
                type="button"
                onClick={() => onBid({ type: "call", suit, alone })}
                className={cn(
                  "flex items-center gap-1 rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm font-medium transition-colors",
                  "hover:border-brand-orange hover:text-brand-orange cursor-pointer",
                  suit === "hearts" || suit === "diamonds"
                    ? "text-red-400"
                    : "text-text-primary",
                )}
              >
                <span className="text-lg">{SUIT_SYMBOL[suit]}</span>
                <span className="capitalize">{suit}</span>
              </button>
            ))}
          </div>
          {canPass && (
            <Button variant="secondary" onClick={() => onBid({ type: "pass" })}>
              Pass
            </Button>
          )}
          {!canPass && (
            <div className="text-xs text-brand-orange">
              Stick the dealer &mdash; you must call a suit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
