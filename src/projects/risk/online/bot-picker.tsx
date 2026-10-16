"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { BOT_IDS, seatBot, strength, type BotId } from "./seat-bots";

/** A bot's strength among the bots a table can seat, as rising bars: the weakest lights one,
 *  the strongest all. */
export function StrengthBars({ bot }: { bot: BotId }) {
  const lit = strength(bot);
  const label = `Strength ${lit.toString()} of ${BOT_IDS.length.toString()}`;
  return (
    <span role="img" aria-label={label} title={label} className="flex h-4 shrink-0 items-end gap-0.5">
      {BOT_IDS.map((id, i) => (
        <span key={id} className={cn("w-1 rounded-sm", i < lit ? "bg-brand-orange" : "bg-border-default")} style={{ height: `${(((i + 1) / BOT_IDS.length) * 100).toString()}%` }} />
      ))}
    </span>
  );
}

/** A bot's rank and its strength. */
export function BotBadge({ bot }: { bot: BotId }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{seatBot(bot).rank}</span>
      <StrengthBars bot={bot} />
    </span>
  );
}

/**
 * Steps through the seatable bots round `children`: a weaker one to the left, a
 * stronger one to the right. At either end its arrow stays focusable but does
 * nothing, so a controller's focus isn't dropped by a button that disables itself.
 */
export function BotStepper({ bot, onChange, children }: { bot: BotId; onChange: (bot: BotId) => void; children: ReactNode }) {
  const at = BOT_IDS.indexOf(bot);
  const weaker = BOT_IDS.at(at - 1);
  const stronger = BOT_IDS.at(at + 1);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <StepButton label="A weaker bot" to={at > 0 ? weaker : undefined} onChange={onChange}>
        <ChevronLeft aria-hidden size={20} />
      </StepButton>
      {children}
      <StepButton label="A stronger bot" to={stronger} onChange={onChange}>
        <ChevronRight aria-hidden size={20} />
      </StepButton>
    </span>
  );
}

function StepButton({ label, to, onChange, children }: { label: string; to: BotId | undefined; onChange: (bot: BotId) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={to === undefined}
      onClick={() => {
        if (to) onChange(to);
      }}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors", to ? "hover:bg-surface-elevated hover:text-text-primary" : "opacity-30")}
    >
      {children}
    </button>
  );
}
