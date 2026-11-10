"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { watchWindows } from "../client";
import {
  byHourAndDay,
  currentStatus,
  dayStrips,
  durationMs,
  summarize,
  timeline,
  type SpotWindow,
  type Status,
} from "../logic";

const DAY_MS = 86_400_000;
const PERIODS = [1, 7, 30, 90];
/** The clock the status and the open window's length read from. */
const TICK_MS = 15_000;
const RECENT = 20;
/** Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const STATUS_LOOK: Record<Status, { label: string; dot: string; text: string }> = {
  up: { label: "Free", dot: "bg-brand-green", text: "text-brand-green" },
  down: { label: "Busy", dot: "bg-brand-pink", text: "text-brand-pink" },
  unknown: { label: "Not checked", dot: "bg-text-muted", text: "text-text-muted" },
};

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes.toString()}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toString()}h ${(minutes % 60).toString()}m`;
  return `${Math.floor(hours / 24).toString()}d ${(hours % 24).toString()}h`;
}

const time = (iso: string | number) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
const when = (iso: string) => `${dayLabel(Date.parse(iso))} ${time(iso)}`;

function mergeWindow(held: SpotWindow[], next: SpotWindow): SpotWindow[] {
  return [...held.filter((w) => w.id !== next.id), next].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
}

/** When the shared GPU machine takes SSH connections, and for how long. */
export function SpotAccess() {
  const root = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(7);
  const [windows, setWindows] = useState<SpotWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  usePadNavigation(root);

  useEffect(
    () => watchWindows(Date.now() - days * DAY_MS, {
      onWindows: (all) => {
        setWindows(all);
        setError(null);
      },
      onWindow: (w) => setWindows((held) => mergeWindow(held ?? [], w)),
      onError: setError,
    }),
    [days],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const all = useMemo(() => windows ?? [], [windows]);
  const from = now - days * DAY_MS;
  const latest = all.at(-1);
  const status = currentStatus(latest, now);
  const look = STATUS_LOOK[status];
  const summary = summarize(all, from, now);
  const strips = dayStrips(all, days, now);
  const grid = byHourAndDay(all, from, now);
  const recent = timeline(all, RECENT);

  return (
    <div ref={root} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-surface-elevated p-2 text-brand-blue">
          <Cpu size={28} aria-hidden />
        </span>
        <h1 className="text-3xl font-bold">
          Spot <span className="text-brand-green">Access</span>
        </h1>
        <div className="ml-auto flex flex-col items-end">
          <span className={`flex items-center gap-2 text-xl font-bold ${look.text}`}>
            <span className={`size-3 rounded-full ${look.dot} ${status === "up" ? "animate-pulse" : ""}`} aria-hidden />
            {look.label}
          </span>
          {latest !== undefined && (
            <span className="text-xs text-text-muted">
              {status === "unknown"
                ? `last checked ${when(latest.ended_at)}`
                : `for ${formatDuration(now - Date.parse(latest.started_at))}`}
            </span>
          )}
        </div>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-md border-2 border-brand-pink px-3 py-2 text-sm text-brand-pink">
          {error}
        </p>
      )}

      <nav className="flex gap-2" aria-label="Period">
        {PERIODS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setWindows(null);
              setDays(d);
            }}
            aria-pressed={d === days}
            className={`flex-1 rounded-md border-2 px-3 py-1.5 text-sm font-bold ${
              d === days ? "border-brand-blue bg-surface-elevated text-text-primary" : "border-border-default text-text-secondary hover:border-border-hover"
            }`}
          >
            {d === 1 ? "24h" : `${d.toString()}d`}
          </button>
        ))}
      </nav>

      {windows === null && error === null && <p className="py-12 text-center text-text-muted">Connecting…</p>}
      {windows?.length === 0 && <p className="py-12 text-center text-text-muted">No checks in this period yet.</p>}

      {all.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Free"
              value={summary.observedMs > 0 ? `${Math.round((100 * summary.upMs) / summary.observedMs).toString()}%` : "–"}
              hint={`of the ${formatDuration(summary.observedMs)} checked`}
            />
            <Tile label="Free windows" value={summary.upCount.toString()} />
            <Tile label="Average" value={summary.upCount > 0 ? formatDuration(summary.averageUpMs) : "–"} />
            <Tile label="Longest" value={summary.upCount > 0 ? formatDuration(summary.longestUpMs) : "–"} />
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="text-lg font-bold">Timeline</h2>
            <Legend />
            <div className="ml-14 flex justify-between text-[10px] text-text-muted" aria-hidden>
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h}>{h.toString().padStart(2, "0")}</span>
              ))}
            </div>
            {strips.map((strip, i) => (
              <div key={strip.day} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-xs text-text-secondary">{dayLabel(strip.day)}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-surface-elevated">
                  {strip.segments.map((s) => (
                    <span
                      key={s.window.id}
                      className={`absolute inset-y-0 ${s.up ? "bg-brand-green" : "bg-brand-pink/40"}`}
                      style={{ left: `${(s.start * 100).toString()}%`, width: `${((s.end - s.start) * 100).toString()}%` }}
                      title={`${s.up ? "Free" : "Busy"} ${time(s.window.started_at)}–${time(s.window.ended_at)} (${formatDuration(durationMs(s.window))})`}
                    />
                  ))}
                  {i === 0 && (
                    <span
                      className="absolute inset-y-0 w-0.5 bg-text-primary"
                      style={{ left: `${(((now - strip.day) / DAY_MS) * 100).toString()}%` }}
                      title="Now"
                    />
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="text-lg font-bold">Usually free</h2>
            <div className="flex flex-col gap-0.5">
              {WEEK.map((d) => (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right text-xs text-text-secondary">
                    {new Date(2026, 10, 1 + d).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <div className="grid flex-1 grid-cols-24 gap-px">
                    {grid[d].map((cell, h) => {
                      const share = cell.observedMs > 0 ? cell.upMs / cell.observedMs : null;
                      const label = `${h.toString().padStart(2, "0")}:00 ${share === null ? "not checked" : `free ${Math.round(share * 100).toString()}%`}`;
                      return (
                        <span key={h} className="relative aspect-square rounded-[2px] bg-surface-elevated" title={label} aria-label={label}>
                          {share !== null && <span className="absolute inset-0 rounded-[2px] bg-brand-green" style={{ opacity: 0.1 + 0.9 * share }} />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="ml-14 flex justify-between text-[10px] text-text-muted" aria-hidden>
                {[0, 6, 12, 18, 24].map((h) => (
                  <span key={h}>{h.toString().padStart(2, "0")}</span>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="text-lg font-bold">Recent</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {recent.map((entry) =>
                entry.kind === "gap" ? (
                  <li key={`gap-${entry.startedAt}`} className="flex items-center gap-2 px-2 text-text-muted">
                    <span className="size-2.5 rounded-full border border-text-muted" aria-hidden />
                    <span className="flex-1">Not checked</span>
                    <span>{formatDuration(Date.parse(entry.endedAt) - Date.parse(entry.startedAt))}</span>
                  </li>
                ) : (
                  <li key={entry.window.id} className="flex items-center gap-2 rounded-md bg-surface-secondary px-2 py-1">
                    <span className={`size-2.5 rounded-full ${entry.window.up ? "bg-brand-green" : "bg-brand-pink"}`} aria-label={entry.window.up ? "Free" : "Busy"} />
                    <span className="flex-1 text-text-secondary">
                      {when(entry.window.started_at)} – {time(entry.window.ended_at)}
                    </span>
                    <span className="font-bold">{formatDuration(durationMs(entry.window))}</span>
                  </li>
                ),
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col rounded-md bg-surface-secondary px-3 py-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {hint !== undefined && <span className="text-[10px] text-text-muted">{hint}</span>}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-text-secondary">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-brand-green" aria-hidden /> Free
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-brand-pink/40" aria-hidden /> Busy
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-surface-elevated" aria-hidden /> Not checked
      </span>
    </div>
  );
}
