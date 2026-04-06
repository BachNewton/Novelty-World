"use client";

import { useState, useEffect, useRef } from "react";
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
  const [elapsed, setElapsed] = useState(0);
  const phaseStartRef = useRef(Date.now());

  // Reset elapsed timer when phase changes
  useEffect(() => {
    phaseStartRef.current = Date.now();
    setElapsed(0);
  }, [testPhase]);

  // Tick elapsed every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - phaseStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [testPhase]);

  const phaseLabel = PHASE_LABELS[testPhase] ?? testPhase;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Network Test</h1>

      <div className="w-full max-w-sm space-y-5">
        {/* Phase name */}
        <p className="text-lg font-medium text-brand-orange">
          {phaseLabel}
        </p>

        {/* Animated activity indicator */}
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-brand-orange"
              style={{
                animation: "pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Detail from host + elapsed timer */}
        <div className="space-y-1">
          {progress.currentTest && (
            <p className="text-sm text-text-secondary">{progress.currentTest}</p>
          )}
          <p className="text-sm text-text-muted font-mono">{elapsed}s elapsed</p>
        </div>

        {/* Progress bar — fills when host broadcasts arrive */}
        {progress.overallPercent > 0 && (
          <div className="space-y-1">
            <div className="w-full rounded-full bg-surface-elevated h-2">
              <div
                className="h-2 rounded-full bg-brand-orange transition-all duration-500"
                style={{ width: `${Math.min(progress.overallPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              {Math.round(progress.overallPercent)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
