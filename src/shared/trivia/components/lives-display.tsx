"use client";

import { Heart } from "lucide-react";

interface LivesDisplayProps {
  lives: number;
  maxLives: number;
  /** If set, wrap the hearts into a grid with this many columns per row. */
  columns?: number;
}

export function LivesDisplay({ lives, maxLives, columns }: LivesDisplayProps) {
  const layoutClass = columns
    ? "grid gap-1"
    : "flex gap-1";
  const layoutStyle = columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : undefined;
  return (
    <div className={layoutClass} style={layoutStyle}>
      {Array.from({ length: maxLives }, (_, i) => (
        <Heart
          key={i}
          size={20}
          className={
            i < lives
              ? "fill-brand-pink text-brand-pink"
              : "text-text-muted"
          }
        />
      ))}
    </div>
  );
}
