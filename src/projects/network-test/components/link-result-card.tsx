"use client";

import { Card } from "@/shared/components/ui/card";
import { formatMs, formatBytesPerSec } from "../logic";
import type { LinkTestResult } from "../types";

interface LinkResultCardProps {
  result: LinkTestResult;
}

function pingColor(avg: number): string {
  if (avg < 50) return "text-brand-green";
  if (avg < 150) return "text-yellow-400";
  return "text-red-400";
}

function throughputColor(bps: number): string {
  if (bps >= 100 * 1024) return "text-brand-green";
  if (bps >= 10 * 1024) return "text-yellow-400";
  return "text-red-400";
}

function orderColor(outOfOrder: number): string {
  return outOfOrder === 0 ? "text-brand-green" : "text-red-400";
}

function lossColor(pct: number): string {
  if (pct === 0) return "text-brand-green";
  if (pct < 5) return "text-yellow-400";
  return "text-red-400";
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={className ?? "text-text-primary"}>{value}</span>
    </div>
  );
}

export function LinkResultCard({ result }: LinkResultCardProps) {
  const { ping, throughput, ordering, loss, playerNameA, playerNameB } = result;

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-mono text-sm tracking-widest text-brand-orange">
        {playerNameA} ↔ {playerNameB}
      </h3>

      {/* Ping */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Ping / RTT
        </h4>
        <Stat label="Avg" value={formatMs(ping.avg)} className={pingColor(ping.avg)} />
        <Stat label="Min" value={formatMs(ping.min)} />
        <Stat label="Max" value={formatMs(ping.max)} />
        <Stat label="Median" value={formatMs(ping.median)} />
        <Stat label="Jitter" value={formatMs(ping.jitter)} />
      </div>

      {/* Throughput */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Throughput
        </h4>
        <Stat
          label={`${playerNameA} → ${playerNameB}`}
          value={formatBytesPerSec(throughput.downBytesPerSec)}
          className={throughputColor(throughput.downBytesPerSec)}
        />
        <Stat
          label={`${playerNameB} → ${playerNameA}`}
          value={formatBytesPerSec(throughput.upBytesPerSec)}
          className={throughputColor(throughput.upBytesPerSec)}
        />
      </div>

      {/* Ordering */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Ordering
        </h4>
        <Stat
          label="Out of order"
          value={String(ordering.outOfOrder)}
          className={orderColor(ordering.outOfOrder)}
        />
        <Stat label="Received" value={`${ordering.totalReceived}/${ordering.totalSent}`} />
      </div>

      {/* Loss */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Message Loss
        </h4>
        <Stat
          label="Loss"
          value={`${loss.lossPercent.toFixed(1)}%`}
          className={lossColor(loss.lossPercent)}
        />
        <Stat label="Received" value={`${loss.totalReceived}/${loss.totalSent}`} />
      </div>
    </Card>
  );
}
