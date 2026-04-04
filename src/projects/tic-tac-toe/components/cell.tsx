"use client";

import { cn } from "@/shared/lib/utils";
import type { CellValue } from "../types";

interface CellProps {
  value: CellValue;
  isWinning: boolean;
  isClickable: boolean;
  onClick: () => void;
}

export function Cell({ value, isWinning, isClickable, onClick }: CellProps) {
  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        "aspect-square rounded-lg border-2 text-4xl font-bold transition-all duration-150",
        "flex items-center justify-center",
        "bg-surface-secondary border-border-default",
        isClickable &&
          "hover:border-brand-orange/60 hover:bg-surface-tertiary cursor-pointer",
        !isClickable && !value && "cursor-default",
        isWinning && "border-brand-green bg-brand-green/10",
        value === "X" && "text-brand-orange",
        value === "O" && "text-brand-blue",
      )}
    >
      {value}
    </button>
  );
}
