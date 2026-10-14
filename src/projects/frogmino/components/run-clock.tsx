"use client";

import { Medal as MedalIcon } from "lucide-react";
import { useStore } from "zustand";
import { cn } from "@/shared/lib/utils";
import { formatTime, medalFor, MEDALS, type Medal, type MedalTimes } from "../medals";
import { runTime } from "../run";
import type { Session } from "../session";
import { toTicks } from "../ticks";

// The run's clock on screen: the live timer while the team plays, and the
// result on the done screen, its time, the medal it earned and the three
// times to beat.

export const MEDAL_NAMES: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };
export const MEDAL_TEXT: Record<Medal, string> = {
  gold: "text-frogmino-medal-gold",
  silver: "text-frogmino-medal-silver",
  bronze: "text-frogmino-medal-bronze",
};
const MEDAL_BORDER: Record<Medal, string> = {
  gold: "border-frogmino-medal-gold",
  silver: "border-frogmino-medal-silver",
  bronze: "border-frogmino-medal-bronze",
};

// A tenth of a second is as fine as a running timer is read; the result
// shows hundredths.
const TENTH = 10;

// The time so far, at the top of the screen between the title and the mute
// button, with the best medal still in reach beside it. It shows no touch
// zone's hint and takes no taps.
export function RunTimer({ session }: { session: Session }) {
  const tenths = useStore(session.store, (s) => Math.floor(runTime(s.run) / TENTH));
  const inReach = useStore(session.store, (s) => medalFor(runTime(s.run), s.course.medals));
  return (
    <p
      data-testid="frogmino-timer"
      data-medal={inReach ?? "none"}
      className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-secondary/80 px-3 py-1 font-mono text-base font-bold tabular-nums text-text-primary"
    >
      <MedalIcon aria-hidden className={cn("h-4 w-4", inReach === null ? "text-text-muted" : MEDAL_TEXT[inReach])} />
      {formatTime(tenths * TENTH, true)}
    </p>
  );
}

// The finished run: its time, the medal earned, and each medal's time, the
// earned one picked out.
export function RunResult({ time, medals }: { time: number; medals: MedalTimes }) {
  const earned = medalFor(time, medals);
  return (
    <div
      data-testid="frogmino-result"
      data-medal={earned ?? "none"}
      data-time={time}
      className={cn(
        "flex w-full max-w-72 flex-col items-center gap-2 rounded-xl border-2 bg-surface-secondary/90 px-5 py-4 text-center",
        earned === null ? "border-border-hover" : MEDAL_BORDER[earned],
      )}
    >
      <p className={cn("flex items-center gap-2 text-2xl font-bold", earned === null ? "text-text-secondary" : MEDAL_TEXT[earned])}>
        <MedalIcon aria-hidden className="h-7 w-7" />
        {earned === null ? "No medal" : MEDAL_NAMES[earned]}
      </p>
      <p className="font-mono text-3xl font-bold tabular-nums text-text-primary">{formatTime(time)}</p>
      <dl className="grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-0.5 text-sm">
        {MEDALS.map((medal) => (
          <div key={medal} className={cn("contents", medal === earned ? "font-bold text-text-primary" : "text-text-secondary")}>
            <MedalIcon aria-hidden className={cn("h-4 w-4", MEDAL_TEXT[medal])} />
            <dt className="text-left">{MEDAL_NAMES[medal]}</dt>
            <dd className="font-mono tabular-nums">{formatTime(toTicks(medals[medal]))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The session's finished run, as `RunResult` shows it.
export function SessionResult({ session }: { session: Session }) {
  const time = useStore(session.store, (s) => runTime(s.run));
  const medals = useStore(session.store, (s) => s.course.medals);
  return <RunResult time={time} medals={medals} />;
}
