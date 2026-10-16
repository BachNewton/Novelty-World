"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { LiveRow } from "@/shared/lib/bot-lab/live-row";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { watchRuns } from "../client";
import { mergeRow, orderRuns } from "../logic";
import { RunCard } from "./run-card";

/** The clock the page reads elapsed times, estimated finishes and gone-quiet runs from. */
const TICK_MS = 1000;

/** Every bot-measuring run, live ones first, as their CLIs publish them. */
export function BotLab() {
  const root = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<LiveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  usePadNavigation(root);

  useEffect(
    () =>
      watchRuns({
        onRows: (all) => {
          setRows(all);
          setError(null);
        },
        onRow: (row) => setRows((held) => mergeRow(held ?? [], row)),
        onError: setError,
      }),
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { live, ended } = orderRuns(rows ?? [], now);

  return (
    <div ref={root} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <span className="rounded-md bg-surface-elevated p-2 text-brand-orange">
          <FlaskConical size={28} aria-hidden />
        </span>
        <h1 className="text-3xl font-bold">
          Bot <span className="text-brand-pink">Lab</span>
        </h1>
        <span className="ml-auto flex items-center gap-1.5 text-sm font-bold text-brand-green" title={`${live.length.toString()} running`}>
          <span className="size-2.5 animate-pulse rounded-full bg-brand-green" aria-hidden />
          <span aria-label={`${live.length.toString()} running`}>{live.length}</span>
        </span>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-md border-2 border-brand-pink px-3 py-2 text-sm text-brand-pink">
          {error}
        </p>
      )}

      {rows === null && error === null && <p className="py-12 text-center text-text-muted">Connecting…</p>}
      {rows?.length === 0 && (
        <p className="py-12 text-center text-text-muted">No runs yet. Start a gauntlet, a ratings ladder or a check, and it shows here.</p>
      )}

      {live.map((row) => (
        <RunCard key={row.id} row={row} now={now} />
      ))}
      {ended.length > 0 && live.length > 0 && <hr className="border-border-default" />}
      {ended.map((row) => (
        <RunCard key={row.id} row={row} now={now} />
      ))}
    </div>
  );
}
