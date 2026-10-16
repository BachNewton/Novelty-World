"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { BOT_IDS, eloOf, fullName, rankOf, strength, type BotId } from "./seat-bots";

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

/** A bot's rank and name over its version, beside its strength among the seatable bots
 *  as bars over its measured Elo (a dash for a bot that never wins). */
export function BotBadge({ bot }: { bot: BotId }) {
  const elo = eloOf(bot);
  const eloLabel = elo === null ? "Never wins, so it has no Elo" : `Elo ${Math.round(elo).toString()} (Greedy is 1000)`;
  return (
    <span className="flex min-w-0 items-center gap-2 text-left leading-tight">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{rankOf(bot)}</span>
        <span className="truncate text-xs text-text-secondary">{fullName(bot)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-0.5">
        <StrengthBars bot={bot} />
        <span role="img" aria-label={eloLabel} title={eloLabel} className="text-xs tabular-nums text-text-secondary">
          {elo === null ? "–" : Math.round(elo).toString()}
        </span>
      </span>
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
