"use client";

import { usePadConnected } from "@/shared/lib/gamepad";
import { cn } from "@/shared/lib/utils";

/** A controller button a hint names, in Xbox print. */
export type HintButton = "A" | "B" | "X" | "Y" | "LB" | "RB" | "Menu" | "View";

const GLYPH: Record<HintButton, string> = { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", Menu: "☰", View: "⧉" };
const TONE: Partial<Record<HintButton, string>> = {
  A: "bg-brand-green text-surface-primary",
  B: "bg-brand-pink text-surface-primary",
  X: "bg-brand-blue text-surface-primary",
  Y: "bg-brand-orange text-surface-primary",
};

/** A screen's controller buttons and what they do, shown only while a
 *  controller is connected. */
export function PadHints({ hints, className }: { hints: readonly (readonly [HintButton, string])[]; className?: string }) {
  const connected = usePadConnected();
  if (!connected) return null;
  return (
    <ul aria-label="Controller buttons" data-testid="pad-hints" className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-secondary", className)}>
      {hints.map(([button, label]) => (
        <li key={button} className="flex items-center gap-1.5">
          <span
            aria-label={button}
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-bold leading-none",
              TONE[button] ?? "border border-border-hover bg-surface-elevated text-text-primary",
            )}
          >
            {GLYPH[button]}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
