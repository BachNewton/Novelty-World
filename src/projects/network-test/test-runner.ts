// ---------------------------------------------------------------------------
// Reusable test functions — callable by any peer (host or delegated initiator)
// ---------------------------------------------------------------------------

import type { MessageHandler } from "@/shared/lib/multiplayer";
import {
  MSG,
  PING_COUNT,
  PING_INTERVAL_MS,
  THROUGHPUT_MAX_CHUNK_SIZE,
  THROUGHPUT_EARLY_STOP_MS,
  THROUGHPUT_DOWN_ROUNDS,
  THROUGHPUT_UP_ROUNDS,
  ORDER_COUNT,
  LOSS_COUNT,
  LOSS_WAIT_MS,
} from "./types";
import type {
  PingPayload,
  PongPayload,
  TpRoundStartPayload,
  TpRoundDataPayload,
  TpRoundAckPayload,
  TpUploadStartPayload,
  ThroughputMeasurement,
  ThroughputResult,
  PingResult,
  OrderingResult,
  LossResult,
  OrderSeqPayload,
  OrderReportPayload,
  LossBurstPayload,
  LossReportPayload,
} from "./types";
import {
  computePingStats,
  computeAdaptiveThroughputResult,
  computeOrderingResult,
  computeLossResult,
  generatePadding,
} from "./logic";

// ---------------------------------------------------------------------------
// Test context — messaging primitives needed by all test functions
// ---------------------------------------------------------------------------

export interface TestContext {
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  onMessage: <T>(type: string, handler: MessageHandler<T>) => () => void;
  isAborted: () => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Ping test
// ---------------------------------------------------------------------------

export async function runPingTest(
  ctx: TestContext,
  targetPeerId: string,
): Promise<PingResult> {
  const samples: number[] = [];

  for (let seq = 0; seq < PING_COUNT; seq++) {
    if (ctx.isAborted()) break;

    const rtt = await withTimeout(
      new Promise<number>((resolve) => {
        const sendTime = performance.now();
        const unsub = ctx.onMessage<PongPayload>(MSG.PONG, (msg) => {
          if (msg.payload.seq === seq && msg.from === targetPeerId) {
            unsub();
            resolve(performance.now() - sendTime);
          }
        });
        ctx.sendTo<PingPayload>(targetPeerId, MSG.PING, { seq, sendTime });
      }),
      10_000,
      `ping ${seq}`,
    );

    samples.push(rtt);
    await delay(PING_INTERVAL_MS);
  }

  return computePingStats(samples);
}

// ---------------------------------------------------------------------------
// Adaptive throughput — Cloudflare-style
// ---------------------------------------------------------------------------

/**
 * Run adaptive throughput rounds in one direction (initiator sends to target).
 * Returns an array of measurements.
 */
async function runThroughputRounds(
  ctx: TestContext,
  targetPeerId: string,
  rounds: [number, number][],
): Promise<ThroughputMeasurement[]> {
  const measurements: ThroughputMeasurement[] = [];
  let roundIndex = 0;

  for (const [totalBytes, repetitions] of rounds) {
    let exceededThreshold = false;

    for (let rep = 0; rep < repetitions; rep++) {
      if (ctx.isAborted()) return measurements;

      const currentRound = roundIndex;

      // Set up ACK listener before sending any data
      const ackPromise = new Promise<TpRoundAckPayload>((resolve) => {
        const unsub = ctx.onMessage<TpRoundAckPayload>(MSG.TP_ROUND_ACK, (msg) => {
          if (
            msg.from === targetPeerId &&
            msg.payload.roundIndex === currentRound
          ) {
            unsub();
            resolve(msg.payload);
          }
        });
      });

      // Send round start
      ctx.sendTo<TpRoundStartPayload>(targetPeerId, MSG.TP_ROUND_START, {
        roundIndex: currentRound,
        totalBytes,
      });

      // Send data chunks
      const numFullChunks = Math.floor(totalBytes / THROUGHPUT_MAX_CHUNK_SIZE);
      const remainder = totalBytes % THROUGHPUT_MAX_CHUNK_SIZE;
      const totalChunks = numFullChunks + (remainder > 0 ? 1 : 0);

      for (let i = 0; i < numFullChunks; i++) {
        const isFinal = i === numFullChunks - 1 && remainder === 0;
        ctx.sendTo<TpRoundDataPayload>(targetPeerId, MSG.TP_ROUND_DATA, {
          roundIndex: currentRound,
          chunk: generatePadding(THROUGHPUT_MAX_CHUNK_SIZE),
          isFinal,
        });
        // Yield every 10 chunks to keep UI responsive
        if (i % 10 === 9) await delay(0);
      }

      if (remainder > 0) {
        ctx.sendTo<TpRoundDataPayload>(targetPeerId, MSG.TP_ROUND_DATA, {
          roundIndex: currentRound,
          chunk: generatePadding(remainder),
          isFinal: true,
        });
      }

      // Handle edge case: 0-byte round (shouldn't happen, but be safe)
      if (totalChunks === 0) {
        ctx.sendTo<TpRoundDataPayload>(targetPeerId, MSG.TP_ROUND_DATA, {
          roundIndex: currentRound,
          chunk: "",
          isFinal: true,
        });
      }

      // Wait for ACK
      const ack = await withTimeout(
        ackPromise,
        30_000,
        `tp round ${currentRound}`,
      );

      const measurement: ThroughputMeasurement = {
        bytes: ack.bytesReceived,
        elapsedMs: ack.elapsedMs,
        bytesPerSec:
          ack.elapsedMs > 0 ? (ack.bytesReceived / ack.elapsedMs) * 1000 : 0,
      };
      measurements.push(measurement);

      if (ack.elapsedMs > THROUGHPUT_EARLY_STOP_MS) {
        exceededThreshold = true;
      }

      roundIndex++;
    }

    // Early termination: don't attempt larger sizes
    if (exceededThreshold) break;
  }

  return measurements;
}

/**
 * Wait for upload rounds from a target peer (target sends data, we ACK).
 * Returns an array of measurements.
 */
async function receiveUploadRounds(
  ctx: TestContext,
  targetPeerId: string,
): Promise<ThroughputMeasurement[]> {
  const measurements: ThroughputMeasurement[] = [];

  return new Promise<ThroughputMeasurement[]>((resolve) => {
    let currentRoundStart = 0;
    let currentRoundBytes = 0;
    let currentRoundIndex = -1;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    // When we haven't received any data for 3 seconds, the upload phase is over
    const UPLOAD_IDLE_TIMEOUT = 3_000;

    function resetDoneTimer() {
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        unsubStart();
        unsubData();
        resolve(measurements);
      }, UPLOAD_IDLE_TIMEOUT);
    }

    const unsubStart = ctx.onMessage<TpRoundStartPayload>(
      MSG.TP_ROUND_START,
      (msg) => {
        if (msg.from !== targetPeerId) return;
        currentRoundIndex = msg.payload.roundIndex;
        currentRoundStart = performance.now();
        currentRoundBytes = 0;
        resetDoneTimer();
      },
    );

    const unsubData = ctx.onMessage<TpRoundDataPayload>(
      MSG.TP_ROUND_DATA,
      (msg) => {
        if (msg.from !== targetPeerId) return;
        currentRoundBytes += msg.payload.chunk.length;
        resetDoneTimer();

        if (msg.payload.isFinal) {
          const elapsedMs = performance.now() - currentRoundStart;
          const measurement: ThroughputMeasurement = {
            bytes: currentRoundBytes,
            elapsedMs,
            bytesPerSec:
              elapsedMs > 0 ? (currentRoundBytes / elapsedMs) * 1000 : 0,
          };
          measurements.push(measurement);

          // Send ACK
          ctx.sendTo<TpRoundAckPayload>(targetPeerId, MSG.TP_ROUND_ACK, {
            roundIndex: currentRoundIndex,
            bytesReceived: currentRoundBytes,
            elapsedMs,
          });
        }
      },
    );

    resetDoneTimer();
  });
}

export async function runAdaptiveThroughput(
  ctx: TestContext,
  targetPeerId: string,
): Promise<ThroughputResult> {
  // Phase 1: Download — initiator sends to target
  const downMeasurements = await runThroughputRounds(
    ctx,
    targetPeerId,
    THROUGHPUT_DOWN_ROUNDS,
  );

  if (ctx.isAborted()) {
    return computeAdaptiveThroughputResult(downMeasurements, []);
  }

  // Phase 2: Upload — tell target to send rounds back, we receive and ACK
  const uploadDone = receiveUploadRounds(ctx, targetPeerId);

  ctx.sendTo<TpUploadStartPayload>(targetPeerId, MSG.TP_UPLOAD_START, {
    rounds: THROUGHPUT_UP_ROUNDS,
  });

  const upMeasurements = await withTimeout(
    uploadDone,
    120_000,
    "throughput upload phase",
  );

  return computeAdaptiveThroughputResult(downMeasurements, upMeasurements);
}

// ---------------------------------------------------------------------------
// Ordering test
// ---------------------------------------------------------------------------

export async function runOrderingTest(
  ctx: TestContext,
  targetPeerId: string,
): Promise<OrderingResult> {
  for (let seq = 0; seq < ORDER_COUNT; seq++) {
    ctx.sendTo<OrderSeqPayload>(targetPeerId, MSG.ORDER_SEQ, { seq });
  }

  // Wait for messages to arrive, then request report
  await delay(2_000);

  const report = await withTimeout(
    new Promise<OrderReportPayload>((resolve) => {
      const unsub = ctx.onMessage<OrderReportPayload>(MSG.ORDER_REPORT, (msg) => {
        if (msg.from === targetPeerId) {
          unsub();
          resolve(msg.payload);
        }
      });
      // Request the target to send their report
      ctx.sendTo(targetPeerId, MSG.ORDER_REPORT, {});
    }),
    10_000,
    "ordering report",
  );

  return computeOrderingResult(ORDER_COUNT, report.received, report.outOfOrder);
}

// ---------------------------------------------------------------------------
// Loss test
// ---------------------------------------------------------------------------

export async function runLossTest(
  ctx: TestContext,
  targetPeerId: string,
): Promise<LossResult> {
  for (let seq = 0; seq < LOSS_COUNT; seq++) {
    ctx.sendTo<LossBurstPayload>(targetPeerId, MSG.LOSS_BURST, {
      seq,
      total: LOSS_COUNT,
    });
  }

  await delay(LOSS_WAIT_MS + 1000);

  const report = await withTimeout(
    new Promise<LossReportPayload>((resolve) => {
      const unsub = ctx.onMessage<LossReportPayload>(MSG.LOSS_REPORT, (msg) => {
        if (msg.from === targetPeerId) {
          unsub();
          resolve(msg.payload);
        }
      });
      ctx.sendTo(targetPeerId, MSG.LOSS_REPORT, {});
    }),
    10_000,
    "loss report",
  );

  return computeLossResult(report.total, report.received);
}
