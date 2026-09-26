"use client";

import { useEffect, useState } from "react";
import { useFamilyTreeStore } from "../store";
import type { SolvePhase } from "../solver-progress";

const PHASE_LABEL: Record<SolvePhase, string> = {
  preparing: "Preparing the solver",
  presolve: "Simplifying the problem",
  search: "Searching for the fewest crossings",
  placing: "Placing people",
};

// Floating card over the canvas: live solve progress while optimizing, or
// the reason the last optimize failed. No percentage — branch and bound
// can't know how much search is left (see solver-progress-notes.md).
export function OptimizeStatus() {
  const optimizing = useFamilyTreeStore((s) => s.optimizing);
  const error = useFamilyTreeStore((s) => s.optimizeError);
  const dismissError = useFamilyTreeStore((s) => s.dismissOptimizeError);

  if (optimizing) return <SolveProgressCard />;
  if (error === null) return null;
  return (
    <div
      role="alert"
      className="absolute left-3 top-3 z-10 w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-brand-pink bg-surface-elevated p-3 shadow-lg"
    >
      <p className="text-sm font-semibold text-brand-pink">Optimize failed</p>
      <p className="mt-1 break-words text-xs text-text-secondary">{error}</p>
      <button
        type="button"
        onClick={dismissError}
        className="mt-2 text-xs font-medium text-text-primary underline underline-offset-2 hover:text-brand-blue"
      >
        Dismiss
      </button>
    </div>
  );
}

function SolveProgressCard() {
  const progress = useFamilyTreeStore((s) => s.solveProgress);
  const startedAt = useFamilyTreeStore((s) => s.solveStartedAt);
  const lastUpdateAt = useFamilyTreeStore((s) => s.solveLastUpdateAt);

  // Re-render every second so the elapsed and last-update clocks tick
  // between worker messages.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { clearInterval(timer); };
  }, []);

  const elapsed = seconds(now - startedAt);
  const sinceUpdate = seconds(now - lastUpdateAt);

  return (
    <div
      aria-live="polite"
      className="absolute left-3 top-3 z-10 w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-border-hover bg-surface-elevated p-3 shadow-lg"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span
          className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-orange"
          aria-hidden
        />
        {PHASE_LABEL[progress.phase]}…
      </p>
      {progress.best !== null || progress.bound !== null ? (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-text-muted">Best so far</dt>
            <dd className="text-base font-semibold text-brand-blue">
              {progress.best === null ? "—" : crossings(progress.best)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">At least</dt>
            <dd className="text-base font-semibold text-brand-green">
              {progress.bound === null ? "—" : crossings(progress.bound)}
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-2 text-xs text-text-muted">
        {elapsed}s elapsed · last update {sinceUpdate}s ago
      </p>
    </div>
  );
}

function crossings(n: number): string {
  return `${n} crossing${n === 1 ? "" : "s"}`;
}

function seconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}
