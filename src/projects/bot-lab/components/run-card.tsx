"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Cpu,
  Crown,
  Gauge,
  Hourglass,
  MemoryStick,
  Play,
  Square,
  Timer,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import type { PairVerdict } from "@/shared/lib/bot-lab/gauntlet";
import {
  runState,
  sprtNeedle,
  winShare,
  type LiveResult,
  type LiveRow,
  type LiveSprt,
  type LiveStep,
  type RunState,
} from "@/shared/lib/bot-lab/live-row";
import type { RunRecord } from "@/shared/lib/bot-lab/run-log";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { elapsedMs, formatDuration, formatElo, percent } from "../logic";

const STATE: Record<RunState, { icon: LucideIcon; label: string; text: string; bar: string }> = {
  running: { icon: Play, label: "Running", text: "text-brand-green", bar: "bg-brand-green" },
  done: { icon: CircleCheck, label: "Done", text: "text-brand-blue", bar: "bg-brand-blue" },
  stopped: { icon: Square, label: "Stopped", text: "text-brand-orange", bar: "bg-brand-orange" },
  failed: { icon: CircleX, label: "Failed", text: "text-brand-pink", bar: "bg-brand-pink" },
  lost: { icon: Unplug, label: "Lost: its heartbeat stopped", text: "text-text-muted", bar: "bg-text-muted" },
};

const VERDICT: Record<PairVerdict, { mark: string; label: string; text: string }> = {
  better: { mark: "✓", label: "Better", text: "text-brand-green" },
  worse: { mark: "✗", label: "Worse", text: "text-brand-pink" },
  even: { mark: "=", label: "Even", text: "text-brand-blue" },
  inconclusive: { mark: "≈", label: "Inconclusive: ran out of games", text: "text-text-muted" },
};

/** One run: live ones open, ended ones folded to their header until tapped. */
export function RunCard({ row, now }: { row: LiveRow; now: number }) {
  const state = runState(row, now);
  const [open, setOpen] = useState(false);
  const shown = state === "running" || open;
  const crown = row.result?.crown;

  const header = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
      <div className="flex items-center gap-2">
        <StateBadge state={state} />
        <span className="font-bold capitalize">{row.game}</span>
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-bold text-brand-orange">
          {row.tool.replace(/^[^:]*:/, "")}
        </span>
        {crown && <CrownMark accepted={crown.accepted} />}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-sm tabular-nums text-text-secondary">
          <Timer size={14} aria-label="Elapsed" />
          {formatDuration(elapsedMs(row, state, now))}
        </span>
      </div>
      <BotChips bots={row.bots} candidate={crown?.candidate} />
    </div>
  );

  return (
    <Card className={cn("flex flex-col gap-3 p-3 sm:p-4", state === "running" && "border-brand-green/50")}>
      {state === "running" ? (
        header
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="-m-1 flex items-start gap-2 rounded-md p-1 hover:bg-surface-elevated"
        >
          {header}
          <ChevronDown size={20} aria-hidden className={cn("mt-0.5 shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
        </button>
      )}
      {shown && <RunBody row={row} state={state} now={now} />}
    </Card>
  );
}

function RunBody({ row, state, now }: { row: LiveRow; state: RunState; now: number }) {
  const { progress, result } = row;
  return (
    <>
      <ProgressLine row={row} state={state} now={now} />
      {progress.steps.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-default rounded-md bg-surface-primary/60">
          {progress.steps.map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
        </ul>
      )}
      {result && <Result result={result} />}
    </>
  );
}

function StateBadge({ state }: { state: RunState }) {
  const { icon: Icon, label, text } = STATE[state];
  return (
    <span title={label} className={cn("shrink-0", text, state === "running" && "animate-pulse")}>
      <Icon size={18} aria-label={label} fill={state === "running" ? "currentColor" : "none"} />
    </span>
  );
}

function CrownMark({ accepted }: { accepted: boolean }) {
  const label = accepted ? "Crowned: the new champion" : "Not crowned";
  return (
    <span title={label} className={cn("relative shrink-0", accepted ? "text-brand-orange" : "text-text-muted")}>
      <Crown size={18} aria-label={label} fill={accepted ? "currentColor" : "none"} />
      {!accepted && <span aria-hidden className="absolute inset-0 m-auto h-0.5 w-5 -rotate-45 rounded bg-brand-pink" />}
    </span>
  );
}

function BotChips({ bots, candidate }: { bots: readonly string[]; candidate?: string }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Bots">
      {bots.map((bot) => (
        <li
          key={bot}
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-xs",
            bot === candidate ? "border-brand-pink text-brand-pink" : "border-border-hover text-text-secondary",
          )}
          title={bot === candidate ? "The candidate" : undefined}
        >
          {bot}
        </li>
      ))}
    </ul>
  );
}

function ProgressLine({ row, state, now }: { row: LiveRow; state: RunState; now: number }) {
  const { fraction, eta, gamesPerSecond, games } = row.progress;
  const left = state === "running" && eta !== null ? Date.parse(eta) - now : null;
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.round(100 * fraction)}
        className="h-3 overflow-hidden rounded-full bg-surface-elevated"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", STATE[state].bar)}
          style={{ width: `${(100 * (fraction ?? 0)).toFixed(1)}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-text-secondary">
        {fraction !== null && <span className="font-bold text-text-primary">{percent(fraction)}</span>}
        {left !== null && (
          <span className="flex items-center gap-1" title="Estimated time left">
            <Hourglass size={14} aria-label="Estimated time left" />~{formatDuration(left)}
          </span>
        )}
        <span className="flex items-center gap-1" title="Games per second">
          <Gauge size={14} aria-label="Games per second" />
          {gamesPerSecond.toFixed(1)}/s
        </span>
        <span title="Games played">{games.toLocaleString()} games</span>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: LiveStep }) {
  const share = step.record ? winShare(step.record) : null;
  return (
    <li className="flex flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center gap-2">
        {step.pairing ? <Seats {...step.pairing} /> : <span className="font-bold">{step.table}</span>}
        {step.pairing && <span className="text-xs text-text-muted">{step.table}</span>}
        {step.games !== undefined && !step.record && (
          <span className="text-xs tabular-nums text-text-muted">{step.games.toLocaleString()} games</span>
        )}
        <span className="ml-auto">
          <StepMark step={step} />
        </span>
      </div>
      {step.record && (
        <div className="flex items-center gap-3">
          <ShareBar share={share} par={step.record.par} />
          {step.sprt && <Needle sprt={step.sprt} />}
        </div>
      )}
    </li>
  );
}

/** The table's seats as dots: the measured bot's filled, its opponent's hollow. */
function Seats({ bot, against, seats, players }: { bot: string; against: string; seats: number; players: number }) {
  const label = `${seats.toString()} ${bot} against ${(players - seats).toString()} ${against}`;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={label}>
      <span className="flex shrink-0 gap-0.5" role="img" aria-label={label}>
        {Array.from({ length: players }, (_, i) => (
          <span
            key={i}
            className={cn("size-2.5 rounded-full border-2", i < seats ? "border-brand-pink bg-brand-pink" : "border-brand-blue")}
          />
        ))}
      </span>
      <span className="truncate font-mono text-sm">
        <span className="text-brand-pink">{bot}</span>
        <span className="text-text-muted"> vs </span>
        <span className="text-brand-blue">{against}</span>
      </span>
    </span>
  );
}

function StepMark({ step }: { step: LiveStep }) {
  if (!step.done) {
    return <span className="block size-3 animate-pulse rounded-full bg-brand-green" role="img" aria-label="Playing" title="Playing" />;
  }
  if (step.verdict) {
    const v = VERDICT[step.verdict];
    return (
      <span className={cn("text-lg font-bold", v.text)} role="img" aria-label={v.label} title={v.label}>
        {v.mark}
      </span>
    );
  }
  if (step.check !== undefined) {
    const v = step.check ? VERDICT.better : VERDICT.worse;
    const label = step.check ? "Passed" : "Failed";
    return (
      <span className={cn("text-lg font-bold", v.text)} role="img" aria-label={label} title={label}>
        {v.mark}
      </span>
    );
  }
  return <CircleCheck size={16} className="text-brand-blue" aria-label="Played" />;
}

/** The measured bot's share of the decisive games, against a tick at its par. */
function ShareBar({ share, par }: { share: number | null; par: number }) {
  const label = share === null ? `No decisive games yet; par ${percent(par)}` : `Won ${percent(share)} against a par of ${percent(par)}`;
  return (
    <div className="relative h-4 min-w-0 flex-1 rounded bg-surface-elevated" role="img" aria-label={label} title={label}>
      {share !== null && (
        <div
          className={cn("h-full rounded transition-[width] duration-500", share >= par ? "bg-brand-green" : "bg-brand-pink")}
          style={{ width: `${(100 * share).toFixed(1)}%` }}
        />
      )}
      <div className="absolute -inset-y-1 w-0.5 rounded bg-text-primary" style={{ left: `${(100 * par).toFixed(1)}%` }} />
      {share !== null && (
        <span className="absolute inset-y-0 right-1 flex items-center text-[10px] font-bold tabular-nums text-text-primary">
          {percent(share)}
        </span>
      )}
    </div>
  );
}

/** The SPRT as a needle between its regression bound (✗) and its improvement bound (✓);
 *  the middle lights as both tests near a confident tie. */
function Needle({ sprt }: { sprt: LiveSprt }) {
  const { position, even } = sprtNeedle(sprt);
  const lean = position > 0.5 ? "better" : position < 0.5 ? "worse" : null;
  const label =
    lean === null
      ? `Evidence leans neither way; ${percent(even)} of the way to even`
      : `Evidence ${percent(Math.abs(position - 0.5) * 2)} of the way to ${lean}; ${percent(even)} of the way to even`;
  return (
    <div className="flex shrink-0 items-center gap-1 text-xs font-bold" role="img" aria-label={label} title={label}>
      <span className="text-brand-pink" aria-hidden>
        ✗
      </span>
      <div className="relative h-4 w-20 sm:w-28">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-elevated" />
        <div
          className="absolute top-1/2 left-1/2 size-3 -translate-1/2 rounded-full bg-brand-blue"
          style={{ opacity: 0.15 + 0.85 * even }}
        />
        <div
          className="absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-text-primary transition-[left] duration-500"
          style={{ left: `${(100 * position).toFixed(1)}%` }}
        />
      </div>
      <span className="text-brand-green" aria-hidden>
        ✓
      </span>
    </div>
  );
}

function Result({ result }: { result: LiveResult }) {
  return (
    <div className="flex flex-col gap-3">
      {result.error !== undefined && (
        <p className="rounded-md border-2 border-brand-pink px-3 py-2 font-mono text-sm text-brand-pink">{result.error}</p>
      )}
      {result.crown && <CrownVerdict crown={result.crown} />}
      {result.elo && <Ladder anchor={result.elo.anchor} ratings={result.elo.ratings} champion={result.crown?.champion} />}
      {result.errors !== undefined && result.errors > 0 && (
        <p className="text-sm font-bold text-brand-pink" role="alert">
          ⚠ {result.errors} games threw
        </p>
      )}
      {result.record && <RecordLine record={result.record} />}
    </div>
  );
}

function CrownVerdict({ crown }: { crown: NonNullable<LiveResult["crown"]> }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border-2 px-3 py-2",
        crown.accepted ? "border-brand-orange" : "border-border-hover",
      )}
    >
      <span className="flex items-center gap-2 font-bold">
        <CrownMark accepted={crown.accepted} />
        <span className="font-mono">{crown.candidate}</span>
      </span>
      <Gate ok={crown.improvesVsBase} label={`Beats its base, ${crown.base}`}>
        <span className="text-text-muted">vs</span> <span className="font-mono">{crown.base}</span>
      </Gate>
      <Gate ok={crown.regressions.length === 0} label={crown.regressions.length === 0 ? "Worse than no one" : `Worse than ${crown.regressions.join(", ")}`}>
        <span className="text-text-muted">worse than</span>{" "}
        <span className="font-mono">{crown.regressions.length === 0 ? "none" : crown.regressions.join(", ")}</span>
      </Gate>
    </div>
  );
}

function Gate({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  const v = ok ? VERDICT.better : VERDICT.worse;
  return (
    <span className="flex items-center gap-1 text-sm" title={label}>
      <span className={cn("font-bold", v.text)} role="img" aria-label={ok ? "Yes" : "No"}>
        {v.mark}
      </span>
      {children}
    </span>
  );
}

/** Ratings best first, each a bar from the lowest to its rating. */
function Ladder({ anchor, ratings, champion }: { anchor: string; ratings: Record<string, number>; champion?: string }) {
  const entries = Object.entries(ratings).sort((a, b) => b[1] - a[1]);
  const values = entries.map(([, e]) => e);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  return (
    <ol className="flex flex-col gap-1" aria-label={`Elo ladder, ${anchor} at 0`}>
      {entries.map(([bot, elo]) => (
        <li key={bot} className="flex items-center gap-2 text-sm">
          <span className={cn("w-24 shrink-0 truncate font-mono", bot === anchor ? "text-brand-blue" : "text-text-primary")} title={bot === anchor ? `${bot}, the anchor at 0` : bot}>
            {bot === champion && <Crown size={12} className="mr-1 inline text-brand-orange" aria-label="Champion" />}
            {bot}
          </span>
          <div className="h-3 min-w-0 flex-1 rounded bg-surface-elevated">
            <div className="h-full rounded bg-brand-orange" style={{ width: `${(4 + (96 * (elo - low)) / span).toFixed(1)}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">{formatElo(elo)}</span>
        </li>
      ))}
    </ol>
  );
}

function RecordLine({ record }: { record: RunRecord }) {
  const cpu = `CPU: mean ${percent(record.cpu.mean)}, peak ${percent(record.cpu.peak)} of the machine (whole machine ${percent(record.machineCpu.mean)})`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-text-secondary">
      <span className="flex items-center gap-1" title={cpu}>
        <Cpu size={14} aria-label="CPU" />
        <span className="relative h-2 w-16 rounded bg-surface-elevated" role="img" aria-label={cpu}>
          <span className="absolute inset-y-0 left-0 rounded bg-brand-blue" style={{ width: `${(100 * record.cpu.mean).toFixed(1)}%` }} />
          <span className="absolute -inset-y-0.5 w-0.5 bg-brand-pink" style={{ left: `${(100 * record.cpu.peak).toFixed(1)}%` }} />
        </span>
        {percent(record.cpu.mean)}
      </span>
      <span className="flex items-center gap-1" title="Peak memory">
        <MemoryStick size={14} aria-label="Peak memory" />
        {record.peakMemoryMiB.toLocaleString()} MiB
      </span>
      <span title={`${record.machine.cpu}, ${record.machine.logicalCores.toString()} logical cores`}>
        {record.workers}/{record.machine.logicalCores} cores
      </span>
      <span title={`Commit ${record.commit}${record.dirty ? " with uncommitted changes" : ""}`} className="font-mono">
        {record.commit}
        {record.dirty && "*"}
      </span>
    </div>
  );
}
