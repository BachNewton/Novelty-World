"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// A level from 0 to 1 as a slider, shown by its icon rather than a caption.
// The game's keys are ignored while a text field or slider has the focus, so
// the slider lets go of it once the pointer that moved it lifts.
export function LevelSlider({
  icon: Icon,
  label,
  value,
  onChange,
  readout = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (value: number) => void;
  // Shows the level as a percentage beside it, for the dev pages.
  readout?: boolean;
  className?: string;
}) {
  return (
    <label title={label} className={cn("flex items-center gap-2 text-text-secondary", className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
        className="w-28 accent-brand-green"
      />
      {readout && <span className="w-10 font-mono text-xs text-text-muted">{Math.round(value * 100)}%</span>}
    </label>
  );
}
