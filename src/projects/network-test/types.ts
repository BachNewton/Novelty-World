// ---------------------------------------------------------------------------
// Network Test Tool — types and message protocol
// ---------------------------------------------------------------------------

/** Phases the test tool moves through (separate from room phase) */
export type TestPhase =
  | "idle"
  | "ping"
  | "throughput"
  | "ordering"
  | "loss"
  | "done";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export const MSG = {
  START_TEST: "start-test",
  START_PHASE: "start-phase",

  // Ping / RTT
  PING: "ping",
  PONG: "pong",

  // Throughput
  THROUGHPUT_START: "tp-start",
  THROUGHPUT_DATA: "tp-data",
  THROUGHPUT_DONE: "tp-done",
  THROUGHPUT_ACK: "tp-ack",

  // Ordering
  ORDER_SEQ: "order-seq",
  ORDER_REPORT: "order-report",

  // Packet loss
  LOSS_BURST: "loss-burst",
  LOSS_REPORT: "loss-report",

  // Progress (host → all)
  PROGRESS: "progress",

  // Results
  FINAL_RESULTS: "final-results",
} as const;

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface StartPhasePayload {
  phase: TestPhase;
}

export interface ProgressPayload {
  currentPeerId: string | null;
  currentTest: string;
  overallPercent: number;
}

export interface PingPayload {
  seq: number;
  sendTime: number; // performance.now() — sender-local, used for RTT
}

export interface PongPayload {
  seq: number;
  sendTime: number; // echoed from ping
}

export interface ThroughputStartPayload {
  direction: "down" | "up";
}

export interface ThroughputDataPayload {
  chunk: string; // padding data
}

export interface ThroughputAckPayload {
  bytesReceived: number;
  elapsedMs: number;
}

export interface OrderSeqPayload {
  seq: number;
}

export interface OrderReportPayload {
  received: number[];
  outOfOrder: number;
}

export interface LossBurstPayload {
  seq: number;
  total: number;
}

export interface LossReportPayload {
  received: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Result structures
// ---------------------------------------------------------------------------

export interface PingResult {
  samples: number[];
  min: number;
  max: number;
  avg: number;
  median: number;
  jitter: number; // stddev of RTT
}

export interface ThroughputResult {
  downBytesPerSec: number;
  upBytesPerSec: number;
  downTotalBytes: number;
  upTotalBytes: number;
  downDurationMs: number;
  upDurationMs: number;
}

export interface OrderingResult {
  totalSent: number;
  totalReceived: number;
  outOfOrder: number;
  inOrder: boolean;
}

export interface LossResult {
  totalSent: number;
  totalReceived: number;
  lossCount: number;
  lossPercent: number;
}

export interface PeerTestResult {
  peerId: string;
  ping: PingResult;
  throughput: ThroughputResult;
  ordering: OrderingResult;
  loss: LossResult;
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

export const PING_COUNT = 20;
export const PING_INTERVAL_MS = 50;
export const THROUGHPUT_DURATION_MS = 5_000;
export const THROUGHPUT_CHUNK_SIZE = 64 * 1024; // 64 KB
export const THROUGHPUT_BATCH_PER_TICK = 10; // chunks sent per event-loop yield
export const THROUGHPUT_IDLE_MS = 1_000; // receiver reports after this idle gap
export const ORDER_COUNT = 100;
export const LOSS_COUNT = 200;
export const LOSS_WAIT_MS = 2_000;
