"use client";

import { useRef } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { cn } from "@/shared/lib/utils";
import { RankInsignia } from "../components/insignia";
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

/** A bot's rank insignia beside its title over its name and version, and its strength among
 *  the seatable bots as bars over its measured Elo. The title gives way where the badge is narrow
 *  (a table's seat on a phone), leaving the insignia, whose tooltip names the rank. Long names
 *  wrap rather than cut off. */
export function BotBadge({ bot }: { bot: BotId }) {
  const elo = eloOf(bot);
  const eloLabel = `Elo ${Math.round(elo).toString()} (Greedy is 1000)`;
  const rank = rankOf(bot);
  return (
    <span className="@container flex min-w-0 flex-1 items-center gap-2 text-left leading-tight">
      <RankInsignia rank={rank} className="text-2xl" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span aria-hidden className="hidden text-sm font-medium @min-[16rem]:inline">
          {rank}
        </span>
        <span className="text-sm @min-[16rem]:text-xs @min-[16rem]:text-text-secondary">{fullName(bot)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-0.5">
        <StrengthBars bot={bot} />
        <span role="img" aria-label={eloLabel} title={eloLabel} className="text-xs tabular-nums text-text-secondary">
          {Math.round(elo).toString()}
        </span>
      </span>
    </span>
  );
}

const STRONGEST_FIRST = [...BOT_IDS].reverse();

/** The step of adding a bot: every seatable bot, strongest first, and a tap seats one. Its own
 *  screen, so a controller's focus can't wander to the table behind it. */
export function BotPicker({ onPick, onCancel }: { onPick: (bot: BotId) => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  return (
    <div ref={root} role="dialog" aria-label="Add a bot" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Bot aria-hidden size={28} />
        Add a bot
      </h1>
      <ul className="w-full max-w-md space-y-2">
        {STRONGEST_FIRST.map((bot, i) => (
          <li key={bot}>
            <button
              type="button"
              data-pad-start={i === 0 ? "" : undefined}
              onClick={() => onPick(bot)}
              className="flex min-h-11 w-full items-center rounded-md border border-border-default bg-surface-tertiary px-3 py-2 transition-colors hover:border-border-hover"
            >
              <BotBadge bot={bot} />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={onCancel} data-pad-back>
        Cancel
      </Button>
    </div>
  );
}
