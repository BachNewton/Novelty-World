import type {
  PingResult,
  ThroughputResult,
  OrderingResult,
  LossResult,
  PeerTestResult,
} from "./types";
import { THROUGHPUT_CHUNK_SIZE } from "./types";

// ---------------------------------------------------------------------------
// Stat helpers
// ---------------------------------------------------------------------------

export function computePingStats(samples: number[]): PingResult {
  if (samples.length === 0) {
    return { samples: [], min: 0, max: 0, avg: 0, median: 0, jitter: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const variance =
    samples.reduce((sum, val) => sum + (val - avg) ** 2, 0) / samples.length;
  const jitter = Math.sqrt(variance);

  return { samples, min, max, avg, median, jitter };
}

export function computeThroughputResult(
  down: { bytes: number; ms: number },
  up: { bytes: number; ms: number },
): ThroughputResult {
  return {
    downBytesPerSec: down.ms > 0 ? (down.bytes / down.ms) * 1000 : 0,
    upBytesPerSec: up.ms > 0 ? (up.bytes / up.ms) * 1000 : 0,
    downTotalBytes: down.bytes,
    upTotalBytes: up.bytes,
    downDurationMs: down.ms,
    upDurationMs: up.ms,
  };
}

export function computeOrderingResult(
  totalSent: number,
  received: number[],
  outOfOrder: number,
): OrderingResult {
  return {
    totalSent,
    totalReceived: received.length,
    outOfOrder,
    inOrder: outOfOrder === 0,
  };
}

export function computeLossResult(
  totalSent: number,
  totalReceived: number,
): LossResult {
  const lossCount = totalSent - totalReceived;
  return {
    totalSent,
    totalReceived,
    lossCount,
    lossPercent: totalSent > 0 ? (lossCount / totalSent) * 100 : 0,
  };
}

export function aggregatePeerResult(
  peerId: string,
  ping: PingResult,
  throughput: ThroughputResult,
  ordering: OrderingResult,
  loss: LossResult,
): PeerTestResult {
  return { peerId, ping, throughput, ordering, loss };
}

// ---------------------------------------------------------------------------
// Throughput chunk generator
// ---------------------------------------------------------------------------

let _cachedChunk: string | null = null;

/** Generate a padding string of THROUGHPUT_CHUNK_SIZE bytes (cached). */
export function generatePaddingChunk(): string {
  if (!_cachedChunk) {
    _cachedChunk = "X".repeat(THROUGHPUT_CHUNK_SIZE);
  }
  return _cachedChunk;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatBytesPerSec(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

export function formatMs(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}
