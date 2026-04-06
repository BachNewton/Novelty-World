"use client";

import { cn } from "@/shared/lib/utils";
import type { Card, Suit } from "../types";

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const RANK_LABEL: Record<string, string> = {
  "9": "9",
  "10": "10",
  jack: "J",
  queen: "Q",
  king: "K",
  ace: "A",
};

function suitColor(suit: Suit): string {
  return suit === "hearts" || suit === "diamonds"
    ? "text-red-400"
    : "text-text-primary";
}

interface PlayingCardProps {
  card: Card;
  faceDown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  size?: "sm" | "md";
}

export function PlayingCard({
  card,
  faceDown,
  onClick,
  disabled,
  highlighted,
  selected,
  size = "md",
}: PlayingCardProps) {
  const isClickable = !!onClick && !disabled;

  if (faceDown) {
    return (
      <div
        className={cn(
          "rounded-lg border-2 border-border-default bg-brand-orange/20",
          "flex items-center justify-center select-none",
          size === "md" ? "h-24 w-16" : "h-16 w-11",
        )}
      >
        <span className="text-brand-orange/40 text-lg">&#9830;</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "rounded-lg border-2 bg-surface-secondary flex flex-col items-center justify-center gap-0.5 select-none transition-all",
        size === "md" ? "h-24 w-16 text-base" : "h-16 w-11 text-xs",
        suitColor(card.suit),
        // Default border
        "border-border-default",
        // Highlighted = valid play
        highlighted &&
          "border-brand-green/70 shadow-[0_0_8px_rgba(34,197,94,0.3)]",
        // Selected (e.g. discard phase)
        selected && "border-brand-orange ring-2 ring-brand-orange/40 -translate-y-2",
        // Clickable hover
        isClickable &&
          "cursor-pointer hover:border-border-hover hover:-translate-y-1",
        // Disabled dim
        disabled && "opacity-40 cursor-default",
      )}
    >
      <span className="font-bold leading-none">
        {RANK_LABEL[card.rank]}
      </span>
      <span className="leading-none text-lg">
        {SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}
