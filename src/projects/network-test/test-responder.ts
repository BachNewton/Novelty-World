// ---------------------------------------------------------------------------
// Test responders — passive handlers installed on every peer
// ---------------------------------------------------------------------------

import type { MessageHandler } from "@/shared/lib/multiplayer";
import { useNetworkTestStore } from "./store";
import { makeLinkId, generatePadding } from "./logic";
import {
  MSG,
  THROUGHPUT_MAX_CHUNK_SIZE,
  THROUGHPUT_EARLY_STOP_MS,
} from "./types";
import type {
  PingPayload,
  PongPayload,
  TpRoundStartPayload,
  TpRoundDataPayload,
  TpRoundAckPayload,
  TpUploadStartPayload,
  OrderSeqPayload,
  OrderReportPayload,
  LossBurstPayload,
  LossReportPayload,
  PairTestStartPayload,
  PairTestDonePayload,
  StartPhasePayload,
  PingResult,
  ThroughputResult,
  OrderingResult,
  LossResult,
} from "./types";
import type { TestContext } from "./test-runner";
import {
  runPingTest,
  runAdaptiveThroughput,
  runOrderingTest,
  runLossTest,
} from "./test-runner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResponderContext {
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  onMessage: <T>(type: string, handler: MessageHandler<T>) => () => void;
  localPeerId: string;
}

// ---------------------------------------------------------------------------
// Helper: run adaptive throughput rounds as sender (for upload phase)
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendUploadRounds(
  ctx: ResponderContext,
  targetPeerId: string,
  rounds: [number, number][],
): Promise<void> {
  let roundIndex = 0;

  for (const [totalBytes, repetitions] of rounds) {
    let exceededThreshold = false;

    for (let rep = 0; rep < repetitions; rep++) {
      const currentRound = roundIndex;

      // Set up ACK listener
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
        if (i % 10 === 9) await delay(0);
      }

      if (remainder > 0) {
        ctx.sendTo<TpRoundDataPayload>(targetPeerId, MSG.TP_ROUND_DATA, {
          roundIndex: currentRound,
          chunk: generatePadding(remainder),
          isFinal: true,
        });
      }

      if (totalChunks === 0) {
        ctx.sendTo<TpRoundDataPayload>(targetPeerId, MSG.TP_ROUND_DATA, {
          roundIndex: currentRound,
          chunk: "",
          isFinal: true,
        });
      }

      // Wait for ACK
      const ack = await Promise.race([
        ackPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
      ]);

      if (!ack) break; // timeout — stop

      if (ack.elapsedMs > THROUGHPUT_EARLY_STOP_MS) {
        exceededThreshold = true;
      }

      roundIndex++;
    }

    if (exceededThreshold) break;
  }
}

// ---------------------------------------------------------------------------
// Install all passive responders
// ---------------------------------------------------------------------------

export function installTestResponders(ctx: ResponderContext): () => void {
  const unsubs: Array<() => void> = [];

  // --- PING → PONG (sendTo instead of broadcast) ---
  unsubs.push(
    ctx.onMessage<PingPayload>(MSG.PING, (msg) => {
      ctx.sendTo<PongPayload>(msg.from, MSG.PONG, {
        seq: msg.payload.seq,
        sendTime: msg.payload.sendTime,
      });
    }),
  );

  // --- Adaptive throughput: receive download rounds ---
  unsubs.push(
    ctx.onMessage<TpRoundStartPayload>(MSG.TP_ROUND_START, () => {
      useNetworkTestStore.getState().recordTpRoundStart();
    }),
  );

  unsubs.push(
    ctx.onMessage<TpRoundDataPayload>(MSG.TP_ROUND_DATA, (msg) => {
      useNetworkTestStore.getState().recordTpRoundData(msg.payload.chunk.length);

      if (msg.payload.isFinal) {
        // Re-read state after the synchronous update
        const { tpRoundStartTime, tpRoundBytesReceived } =
          useNetworkTestStore.getState().peerSideData;
        const elapsedMs = performance.now() - tpRoundStartTime;

        ctx.sendTo<TpRoundAckPayload>(msg.from, MSG.TP_ROUND_ACK, {
          roundIndex: msg.payload.roundIndex,
          bytesReceived: tpRoundBytesReceived,
          elapsedMs,
        });
      }
    }),
  );

  // --- Adaptive throughput: handle upload start (target becomes sender) ---
  unsubs.push(
    ctx.onMessage<TpUploadStartPayload>(MSG.TP_UPLOAD_START, (msg) => {
      // Fire and forget — send upload rounds back to the initiator
      sendUploadRounds(ctx, msg.from, msg.payload.rounds);
    }),
  );

  // --- Ordering: record sequence numbers ---
  unsubs.push(
    ctx.onMessage<OrderSeqPayload>(MSG.ORDER_SEQ, (msg) => {
      useNetworkTestStore.getState().recordOrderSeq(msg.payload.seq);
    }),
  );

  // --- Ordering: send report when requested ---
  unsubs.push(
    ctx.onMessage(MSG.ORDER_REPORT, (msg) => {
      // Ignore actual reports (with received field) — only respond to requests
      if (!msg.payload || typeof (msg.payload as OrderReportPayload).received !== "undefined") return;

      const { orderReceived } = useNetworkTestStore.getState().peerSideData;
      let outOfOrder = 0;
      for (let i = 1; i < orderReceived.length; i++) {
        if (orderReceived[i] < orderReceived[i - 1]) outOfOrder++;
      }
      ctx.sendTo<OrderReportPayload>(msg.from, MSG.ORDER_REPORT, {
        received: orderReceived,
        outOfOrder,
      });

      // Reset so the next link test starts fresh
      useNetworkTestStore.getState().resetPeerSideData();
    }),
  );

  // --- Loss: count bursts ---
  unsubs.push(
    ctx.onMessage<LossBurstPayload>(MSG.LOSS_BURST, (msg) => {
      useNetworkTestStore.getState().recordLossBurst(msg.payload.total);
    }),
  );

  // --- Loss: send report when requested ---
  unsubs.push(
    ctx.onMessage(MSG.LOSS_REPORT, (msg) => {
      // Ignore actual reports (with received field) — only respond to requests
      if (!msg.payload || typeof (msg.payload as LossReportPayload).received !== "undefined") return;

      const { lossReceived, lossTotal } = useNetworkTestStore.getState().peerSideData;
      ctx.sendTo<LossReportPayload>(msg.from, MSG.LOSS_REPORT, {
        received: lossReceived,
        total: lossTotal,
      });

      // Reset so the next link test starts fresh
      useNetworkTestStore.getState().resetPeerSideData();
    }),
  );

  // --- Phase announcements ---
  unsubs.push(
    ctx.onMessage<StartPhasePayload>(MSG.START_PHASE, (msg) => {
      useNetworkTestStore.getState().setTestPhase(msg.payload.phase);
    }),
  );

  // --- PAIR_TEST_START: delegated test from host ---
  unsubs.push(
    ctx.onMessage<PairTestStartPayload>(MSG.PAIR_TEST_START, async (msg) => {
      const { targetPeerId, phase } = msg.payload;
      const linkId = makeLinkId(ctx.localPeerId, targetPeerId);

      // Reset peer-side data before the target-side responder needs it
      useNetworkTestStore.getState().resetPeerSideData();

      const testCtx: TestContext = {
        sendTo: ctx.sendTo,
        onMessage: ctx.onMessage,
        isAborted: () => false,
      };

      const result: PairTestDonePayload = { linkId, phase };

      try {
        switch (phase) {
          case "ping":
            result.pingResult = await runPingTest(testCtx, targetPeerId);
            break;
          case "throughput":
            result.throughputResult = await runAdaptiveThroughput(
              testCtx,
              targetPeerId,
            );
            break;
          case "ordering":
            result.orderingResult = await runOrderingTest(
              testCtx,
              targetPeerId,
            );
            break;
          case "loss":
            result.lossResult = await runLossTest(testCtx, targetPeerId);
            break;
        }
      } catch (err) {
        console.error(`[NetworkTest] Delegated ${phase} test failed:`, err);
      }

      // Report back to host
      ctx.sendTo<PairTestDonePayload>(msg.from, MSG.PAIR_TEST_DONE, result);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
