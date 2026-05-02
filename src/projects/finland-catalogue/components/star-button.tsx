"use client";

import { Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useFavorites } from "../store";

interface StarButtonProps {
  slug: string;
  /** Visual size — 'sm' for cards, 'lg' for the detail header. */
  size?: "sm" | "lg";
  /** Optional label rendered next to the star (used on the detail page). */
  showLabel?: boolean;
  className?: string;
}

export function StarButton({
  slug,
  size = "sm",
  showLabel = false,
  className,
}: StarButtonProps) {
  const isFavorite = useFavorites((s) => s.slugs.includes(slug));
  const toggle = useFavorites((s) => s.toggle);

  const iconSize = size === "lg" ? 20 : 16;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Card wraps this button in a <Link>; prevent navigation when
        // toggling the star.
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      className={cn(
        "inline-flex items-center gap-2 rounded-full transition-colors",
        size === "sm"
          ? "bg-surface-primary/80 p-2 hover:bg-surface-elevated"
          : "border border-border-default bg-surface-secondary px-4 py-2 text-sm font-medium hover:border-border-hover",
        isFavorite ? "text-brand-orange" : "text-text-secondary",
        className,
      )}
    >
      <Star
        size={iconSize}
        fill={isFavorite ? "currentColor" : "none"}
        strokeWidth={isFavorite ? 2 : 2}
      />
      {showLabel && (
        <span>{isFavorite ? "Favorited" : "Add to favorites"}</span>
      )}
    </button>
  );
}
