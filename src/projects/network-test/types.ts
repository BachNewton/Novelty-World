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

  // Adaptive throughput
  TP_ROUND_START: "tp-round-start",
  TP_ROUND_DATA: "tp-round-data",
  TP_ROUND_ACK: "tp-round-ack",
  TP_UPLOAD_START: "tp-upload-start",

  // Ordering
  ORDER_SEQ: "order-seq",
  ORDER_REPORT: "order-report",

  // Packet loss
  LOSS_BURST: "loss-burst",
  LOSS_REPORT: "loss-report",

  // Progress (host → all)
  PROGRESS: "progress",

  // Mesh coordination
  PAIR_TEST_START: "pair-test-start",
  PAIR_TEST_DONE: "pair-test-done",

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
  currentLinkId: string | null;
  currentNameA: string | null;
  currentNameB: string | null;
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

// --- Adaptive throughput payloads ---

export interface TpRoundStartPayload {
  roundIndex: number;
  totalBytes: number;
}

export interface TpRoundDataPayload {
  roundIndex: number;
  chunk: string;
  isFinal: boolean;
}

export interface TpRoundAckPayload {
  roundIndex: number;
  bytesReceived: number;
  elapsedMs: number;
}

/** Initiator tells target to begin sending upload rounds back */
export interface TpUploadStartPayload {
  rounds: [number, number][]; // the round definitions the target should use
}

// --- Ordering payloads ---

export interface OrderSeqPayload {
  seq: number;
}

export interface OrderReportPayload {
  received: number[];
  outOfOrder: number;
}

// --- Loss payloads ---

export interface LossBurstPayload {
  seq: number;
  total: number;
}

export interface LossReportPayload {
  received: number;
  total: number;
}

// --- Mesh coordination payloads ---

export interface PairTestStartPayload {
  targetPeerId: string;
  phase: TestPhase;
}

export interface PairTestDonePayload {
  linkId: string;
  phase: TestPhase;
  pingResult?: PingResult;
  throughputResult?: ThroughputResult;
  orderingResult?: OrderingResult;
  lossResult?: LossResult;
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

export interface ThroughputMeasurement {
  bytes: number;
  elapsedMs: number;
  bytesPerSec: number;
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

export interface LinkTestResult {
  linkId: string;
  peerA: string;
  peerB: string;
  playerNameA: string;
  playerNameB: string;
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

// Adaptive throughput (Cloudflare-style)
export const THROUGHPUT_MAX_CHUNK_SIZE = 64 * 1024; // 64 KB per DataChannel message
export const THROUGHPUT_EARLY_STOP_MS = 1_000;      // stop escalating when a round exceeds 1s
export const THROUGHPUT_MIN_SAMPLE_MS = 10;          // exclude samples under 10ms

/** Download round definitions: [totalBytes, repetitions] */
export const THROUGHPUT_DOWN_ROUNDS: [number, number][] = [
  [100 * 1024, 1],          // 100KB x1
  [100 * 1024, 9],          // 100KB x9
  [1024 * 1024, 8],         // 1MB x8
  [10 * 1024 * 1024, 6],    // 10MB x6
  [25 * 1024 * 1024, 4],    // 25MB x4
];

/** Upload round definitions: [totalBytes, repetitions] */
export const THROUGHPUT_UP_ROUNDS: [number, number][] = [
  [100 * 1024, 8],          // 100KB x8
  [1024 * 1024, 6],         // 1MB x6
  [10 * 1024 * 1024, 4],    // 10MB x4
  [25 * 1024 * 1024, 4],    // 25MB x4
  [50 * 1024 * 1024, 3],    // 50MB x3
];

export const ORDER_COUNT = 100;
export const LOSS_COUNT = 200;
export const LOSS_WAIT_MS = 2_000;
