"use client";

import { Heart } from "lucide-react";

interface LivesDisplayProps {
  lives: number;
  maxLives: number;
}

export function LivesDisplay({ lives, maxLives }: LivesDisplayProps) {
  return (
    <div className="flex gap-1">
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
