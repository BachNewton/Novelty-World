import { cn } from "@/shared/lib/utils";
import { BotBadge } from "../online/bot-picker";
import { BOT_IDS, RANKS, rankOf } from "../online/seat-bots";
import { RankInsignia } from "./insignia";
import { DISPLAY, DISPLAY_FONT, PANEL, RISK_THEME } from "./theme";

const SIZES = ["text-xs", "text-sm", "text-base", "text-xl", "text-5xl"] as const;

/** Risk's `?insignia` page: every rank's insignia at the sizes it is shown, on the lobby's
 *  surface and on the war room's panel, and the lobby's bot badges at a phone's and a desktop's
 *  width, to judge the set by eye. */
export function RiskInsigniaLab() {
  const seated = new Set(BOT_IDS.map(rankOf));
  return (
    <main style={RISK_THEME} className={cn(DISPLAY_FONT.variable, "min-h-[100dvh] bg-surface-primary px-4 py-6 sm:px-8")}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text-primary">Risk ranks</h1>
          <p className="text-sm text-text-secondary">
            Every rank on the bots&apos; ladder, weakest first, at extra small, small, base and extra large text, and large. Ranks a seated bot holds now are marked
            ●. The drawings are <code>components/insignia.tsx</code>.
          </p>
        </header>
        <ul aria-label="Ranks" className="grid gap-2 md:grid-cols-2">
          {RANKS.map((rank, i) => (
            <li key={rank} className="flex flex-col gap-2 rounded-md border border-border-default bg-surface-secondary px-3 py-2">
              <span className="text-sm text-text-primary">
                <span className="tabular-nums text-text-muted">{(i + 1).toString()}.</span> {rank} {seated.has(rank) && <span aria-label="held by a seated bot">●</span>}
              </span>
              <span className="flex flex-wrap items-end justify-between gap-3">
                <span className="flex items-end gap-3">
                  {SIZES.map((size) => (
                    <RankInsignia key={size} rank={rank} className={size} />
                  ))}
                </span>
                <span className={cn(PANEL, "flex items-center gap-3 whitespace-nowrap px-2 py-1 text-(--rk-text)")}>
                  <RankInsignia rank={rank} className="text-sm" />
                  <RankInsignia rank={rank} title="always" className={cn(DISPLAY, "text-sm")} />
                </span>
              </span>
            </li>
          ))}
        </ul>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-text-primary">The lobby&apos;s bot badges</h2>
          <p className="text-sm text-text-secondary">
            At a table&apos;s seat on a 375-wide phone (the row less its bot mark and remove button), where the title gives way, and in the bot picker, where it is spelled out.
          </p>
          <div className="flex flex-wrap items-start gap-6">
            {[249, 343].map((width) => (
              <ul key={width} aria-label={`Badges ${width.toString()}px wide`} className="space-y-2">
                {[...BOT_IDS].reverse().map((bot) => (
                  <li key={bot} className="flex min-h-11 rounded-md border border-border-default bg-surface-tertiary px-3 py-2" style={{ width }}>
                    <BotBadge bot={bot} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
