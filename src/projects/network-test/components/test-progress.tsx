"use client";

import { useNetworkTestStore } from "../store";

const PHASE_LABELS: Record<string, string> = {
  ping: "Ping / RTT",
  throughput: "Throughput",
  ordering: "Message Ordering",
  loss: "Packet Loss",
};

export function TestProgress() {
  const testPhase = useNetworkTestStore((s) => s.testPhase);
  const progress = useNetworkTestStore((s) => s.progress);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Network Test</h1>

      <div className="w-full max-w-sm space-y-4">
        <p className="text-lg font-medium text-brand-orange">
          {PHASE_LABELS[testPhase] ?? testPhase}
        </p>

        <p className="text-sm text-text-secondary">{progress.currentTest}</p>

        {/* Progress bar */}
        <div className="w-full rounded-full bg-surface-elevated h-3">
          <div
            className="h-3 rounded-full bg-brand-orange transition-all duration-300"
            style={{ width: `${Math.min(progress.overallPercent, 100)}%` }}
          />
        </div>

        <p className="text-sm text-text-muted">
          {Math.round(progress.overallPercent)}%
        </p>
      </div>
    </div>
  );
}
