import type {
  PingResult,
  ThroughputMeasurement,
  ThroughputResult,
  OrderingResult,
  LossResult,
  LinkTestResult,
} from "./types";
import { THROUGHPUT_MAX_CHUNK_SIZE, THROUGHPUT_MIN_SAMPLE_MS } from "./types";

// ---------------------------------------------------------------------------
// Link utilities
// ---------------------------------------------------------------------------

/** Canonical link ID for a pair of peers (sorted so order doesn't matter). */
export function makeLinkId(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** Split a link ID back into the two peer IDs. */
export function parseLinkId(linkId: string): [string, string] {
  const [a, b] = linkId.split("::");
  return [a, b];
}

/** Generate all unique peer pairs from a list of peer IDs. */
export function getAllLinks(
  peerIds: string[],
): Array<{ linkId: string; peerA: string; peerB: string }> {
  const links: Array<{ linkId: string; peerA: string; peerB: string }> = [];
  for (let i = 0; i < peerIds.length; i++) {
    for (let j = i + 1; j < peerIds.length; j++) {
      const peerA = peerIds[i] < peerIds[j] ? peerIds[i] : peerIds[j];
      const peerB = peerIds[i] < peerIds[j] ? peerIds[j] : peerIds[i];
      links.push({ linkId: makeLinkId(peerA, peerB), peerA, peerB });
    }
  }
  return links;
}

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

/** Compute 90th percentile bandwidth from adaptive throughput measurements. */
export function computeAdaptiveThroughput(
  measurements: ThroughputMeasurement[],
): { bytesPerSec: number; totalBytes: number; totalMs: number } {
  const qualifying = measurements.filter(
    (m) => m.elapsedMs >= THROUGHPUT_MIN_SAMPLE_MS,
  );

  if (qualifying.length === 0) {
    return { bytesPerSec: 0, totalBytes: 0, totalMs: 0 };
  }

  const sorted = [...qualifying].sort((a, b) => a.bytesPerSec - b.bytesPerSec);
  const p90Index = Math.floor(sorted.length * 0.9);
  const bytesPerSec = sorted[Math.min(p90Index, sorted.length - 1)].bytesPerSec;

  const totalBytes = qualifying.reduce((sum, m) => sum + m.bytes, 0);
  const totalMs = qualifying.reduce((sum, m) => sum + m.elapsedMs, 0);

  return { bytesPerSec, totalBytes, totalMs };
}

export function computeAdaptiveThroughputResult(
  downMeasurements: ThroughputMeasurement[],
  upMeasurements: ThroughputMeasurement[],
): ThroughputResult {
  const down = computeAdaptiveThroughput(downMeasurements);
  const up = computeAdaptiveThroughput(upMeasurements);
  return {
    downBytesPerSec: down.bytesPerSec,
    upBytesPerSec: up.bytesPerSec,
    downTotalBytes: down.totalBytes,
    upTotalBytes: up.totalBytes,
    downDurationMs: down.totalMs,
    upDurationMs: up.totalMs,
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

export function aggregateLinkResult(
  linkId: string,
  peerA: string,
  peerB: string,
  playerNameA: string,
  playerNameB: string,
  ping: PingResult,
  throughput: ThroughputResult,
  ordering: OrderingResult,
  loss: LossResult,
): LinkTestResult {
  return { linkId, peerA, peerB, playerNameA, playerNameB, ping, throughput, ordering, loss };
}

// ---------------------------------------------------------------------------
// Padding chunk generator
// ---------------------------------------------------------------------------

const _chunkCache = new Map<number, string>();

/** Generate a padding string of exactly `bytes` length (cached per size). */
export function generatePadding(bytes: number): string {
  let cached = _chunkCache.get(bytes);
  if (!cached) {
    cached = "X".repeat(bytes);
    _chunkCache.set(bytes, cached);
  }
  return cached;
}

/** Generate the standard max-size chunk (convenience wrapper). */
export function generatePaddingChunk(): string {
  return generatePadding(THROUGHPUT_MAX_CHUNK_SIZE);
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

/** Format a player label as "Name (abcd1234)" for disambiguation. */
export function formatPlayer(name: string, playerId: string): string {
  return `${name} (${playerId.slice(0, 8)})`;
}
