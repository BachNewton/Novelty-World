"use client";

import { Button } from "@/shared/components/ui/button";
import { useNetworkTestStore } from "../store";
import { PeerResultCard } from "./peer-result-card";

interface TestResultsProps {
  isHost: boolean;
  onRunAgain: () => void;
  onLeave: () => void;
}

export function TestResults({ isHost, onRunAgain, onLeave }: TestResultsProps) {
  const results = useNetworkTestStore((s) => s.results);

  if (!results || results.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Network Test</h1>
        <p className="text-text-muted">No results available.</p>
        <Button onClick={onLeave}>Leave</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Test Results</h1>
      <p className="text-text-secondary text-sm">
        {results.length} peer{results.length !== 1 ? "s" : ""} tested
      </p>

      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
        {results.map((r) => (
          <PeerResultCard key={r.peerId} result={r} />
        ))}
      </div>

      <div className="flex gap-3">
        {isHost && <Button onClick={onRunAgain}>Run Again</Button>}
        <Button variant="ghost" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  );
}
