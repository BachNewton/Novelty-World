// ---------------------------------------------------------------------------
// Host-only test coordinator — orchestrates tests across all peer pairs
// ---------------------------------------------------------------------------

import type { MessageHandler, PlayerInfo } from "@/shared/lib/multiplayer";
import { useNetworkTestStore } from "./store";
import { getAllLinks, makeLinkId, aggregateLinkResult, computePingStats, computeAdaptiveThroughputResult, computeOrderingResult, computeLossResult, formatPlayer } from "./logic";
import { MSG, ORDER_COUNT, LOSS_COUNT } from "./types";
import type {
  TestPhase,
  StartPhasePayload,
  ProgressPayload,
  PairTestStartPayload,
  PairTestDonePayload,
  LinkTestResult,
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

interface CoordinatorContext {
  send: <T>(type: string, payload: T) => void;
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
// Main coordinator function
// ---------------------------------------------------------------------------

export async function coordinateTestSuite(
  ctx: CoordinatorContext,
  localPeerId: string,
  remotePeerIds: string[],
  playerRoster: PlayerInfo[],
): Promise<LinkTestResult[]> {
  const store = useNetworkTestStore.getState();
  store.reset();

  // Build peerId → formatted label lookup (e.g. "Kyle (a1b2c3d4)")
  const labelMap = new Map<string, string>();
  for (const p of playerRoster) {
    labelMap.set(p.peerId, formatPlayer(p.playerName, p.playerId));
  }
  const getLabel = (peerId: string) => labelMap.get(peerId) ?? peerId.slice(0, 8);

  // Enumerate all links
  const allPeerIds = [localPeerId, ...remotePeerIds];
  const links = getAllLinks(allPeerIds);
  const totalSteps = links.length * 4; // 4 test phases per link
  let completedSteps = 0;

  function updateProgress(linkIdx: number, testName: string) {
    const link = links[linkIdx];
    const progress: ProgressPayload = {
      currentLinkId: link.linkId,
      currentNameA: getLabel(link.peerA),
      currentNameB: getLabel(link.peerB),
      currentTest: testName,
      overallPercent: (completedSteps / totalSteps) * 100,
    };
    useNetworkTestStore.getState().updateProgress(progress);
    ctx.send<ProgressPayload>(MSG.PROGRESS, progress);
  }

  const testCtx: TestContext = {
    sendTo: ctx.sendTo,
    onMessage: ctx.onMessage,
    isAborted: ctx.isAborted,
  };

  const phases: TestPhase[] = ["ping", "throughput", "ordering", "loss"];

  try {
    for (const phase of phases) {
      if (ctx.isAborted()) return [];

      useNetworkTestStore.getState().setTestPhase(phase);
      ctx.send<StartPhasePayload>(MSG.START_PHASE, { phase });
      await delay(100);

      for (let li = 0; li < links.length; li++) {
        if (ctx.isAborted()) return [];

        const link = links[li];
        const hostInvolved =
          link.peerA === localPeerId || link.peerB === localPeerId;

        const nameA = getLabel(link.peerA);
        const nameB = getLabel(link.peerB);

        if (hostInvolved) {
          // Host runs the test directly
          const targetPeerId =
            link.peerA === localPeerId ? link.peerB : link.peerA;

          updateProgress(li, formatPhaseProgress(phase, nameA, nameB, "starting"));

          await runPhaseDirectly(
            testCtx,
            targetPeerId,
            link.linkId,
            phase,
            (detail) => updateProgress(li, formatPhaseProgress(phase, nameA, nameB, detail)),
          );
        } else {
          // Delegate to peerA as initiator
          updateProgress(li, formatPhaseProgress(phase, nameA, nameB, "delegating"));

          await runPhaseDelegated(
            ctx,
            link.peerA,
            link.peerB,
            link.linkId,
            phase,
          );
        }

        completedSteps++;
        updateProgress(li, formatPhaseProgress(phase, nameA, nameB, "done"));
      }
    }

    // --- AGGREGATE ---
    const finalProgress: ProgressPayload = {
      currentLinkId: null,
      currentNameA: null,
      currentNameB: null,
      currentTest: "Complete",
      overallPercent: 100,
    };
    useNetworkTestStore.getState().updateProgress(finalProgress);
    ctx.send<ProgressPayload>(MSG.PROGRESS, finalProgress);

    const results = aggregateResults(links, labelMap);

    useNetworkTestStore.getState().setResults(results);
    useNetworkTestStore.getState().setTestPhase("done");
    ctx.send<LinkTestResult[]>(MSG.FINAL_RESULTS, results);

    return results;
  } catch (err) {
    if (!ctx.isAborted()) {
      console.error("[NetworkTest] Coordinator error:", err);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Run a single test phase directly (host is one endpoint)
// ---------------------------------------------------------------------------

async function runPhaseDirectly(
  ctx: TestContext,
  targetPeerId: string,
  linkId: string,
  phase: TestPhase,
  onProgress: (detail: string) => void,
): Promise<void> {
  const store = useNetworkTestStore.getState;

  switch (phase) {
    case "ping": {
      const result = await runPingTest(ctx, targetPeerId);
      for (const sample of result.samples) {
        store().addPingSample(linkId, sample);
      }
      break;
    }
    case "throughput": {
      onProgress("measuring");
      const result = await runAdaptiveThroughput(ctx, targetPeerId);
      // Store the final computed result as a single measurement for aggregation
      if (result.downDurationMs > 0) {
        store().addThroughputMeasurement(linkId, "down", {
          bytes: result.downTotalBytes,
          elapsedMs: result.downDurationMs,
          bytesPerSec: result.downBytesPerSec,
        });
      }
      if (result.upDurationMs > 0) {
        store().addThroughputMeasurement(linkId, "up", {
          bytes: result.upTotalBytes,
          elapsedMs: result.upDurationMs,
          bytesPerSec: result.upBytesPerSec,
        });
      }
      break;
    }
    case "ordering": {
      const result = await runOrderingTest(ctx, targetPeerId);
      const received = Array.from({ length: result.totalReceived }, (_, i) => i);
      store().setOrderingResult(linkId, received, result.outOfOrder);
      break;
    }
    case "loss": {
      const result = await runLossTest(ctx, targetPeerId);
      store().setLossResult(linkId, result.totalReceived, result.totalSent);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Run a single test phase via delegation (host tells a peer to initiate)
// ---------------------------------------------------------------------------

async function runPhaseDelegated(
  ctx: CoordinatorContext,
  initiatorPeerId: string,
  targetPeerId: string,
  linkId: string,
  phase: TestPhase,
): Promise<void> {
  // Tell the initiator to run this phase against the target
  ctx.sendTo<PairTestStartPayload>(initiatorPeerId, MSG.PAIR_TEST_START, {
    targetPeerId,
    phase,
  });

  // Wait for results
  const result = await withTimeout(
    new Promise<PairTestDonePayload>((resolve) => {
      const unsub = ctx.onMessage<PairTestDonePayload>(
        MSG.PAIR_TEST_DONE,
        (msg) => {
          if (
            msg.from === initiatorPeerId &&
            msg.payload.linkId === linkId &&
            msg.payload.phase === phase
          ) {
            unsub();
            resolve(msg.payload);
          }
        },
      );
    }),
    120_000,
    `delegated ${phase} for ${linkId}`,
  );

  // Store the results
  const store = useNetworkTestStore.getState;

  if (result.pingResult) {
    for (const sample of result.pingResult.samples) {
      store().addPingSample(linkId, sample);
    }
  }

  if (result.throughputResult) {
    const tp = result.throughputResult;
    if (tp.downDurationMs > 0) {
      store().addThroughputMeasurement(linkId, "down", {
        bytes: tp.downTotalBytes,
        elapsedMs: tp.downDurationMs,
        bytesPerSec: tp.downBytesPerSec,
      });
    }
    if (tp.upDurationMs > 0) {
      store().addThroughputMeasurement(linkId, "up", {
        bytes: tp.upTotalBytes,
        elapsedMs: tp.upDurationMs,
        bytesPerSec: tp.upBytesPerSec,
      });
    }
  }

  if (result.orderingResult) {
    const ord = result.orderingResult;
    const received = Array.from({ length: ord.totalReceived }, (_, i) => i);
    store().setOrderingResult(linkId, received, ord.outOfOrder);
  }

  if (result.lossResult) {
    store().setLossResult(
      linkId,
      result.lossResult.totalReceived,
      result.lossResult.totalSent,
    );
  }
}

// ---------------------------------------------------------------------------
// Aggregate all stored raw data into LinkTestResult[]
// ---------------------------------------------------------------------------

function aggregateResults(
  links: Array<{ linkId: string; peerA: string; peerB: string }>,
  labelMap: Map<string, string>,
): LinkTestResult[] {
  const state = useNetworkTestStore.getState();

  return links.map((link) => {
    const pingRaw = state.pingRawSamples[link.linkId] ?? [];
    const tpRaw = state.throughputRaw[link.linkId] ?? {
      downMeasurements: [],
      upMeasurements: [],
    };
    const ordRaw = state.orderingRaw[link.linkId] ?? {
      received: [],
      outOfOrder: 0,
    };
    const lossData = state.lossRaw[link.linkId] ?? {
      received: 0,
      total: LOSS_COUNT,
    };

    return aggregateLinkResult(
      link.linkId,
      link.peerA,
      link.peerB,
      labelMap.get(link.peerA) ?? link.peerA.slice(0, 8),
      labelMap.get(link.peerB) ?? link.peerB.slice(0, 8),
      computePingStats(pingRaw),
      computeAdaptiveThroughputResult(
        tpRaw.downMeasurements,
        tpRaw.upMeasurements,
      ),
      computeOrderingResult(ORDER_COUNT, ordRaw.received, ordRaw.outOfOrder),
      computeLossResult(lossData.total, lossData.received),
    );
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPhaseProgress(
  phase: TestPhase,
  nameA: string,
  nameB: string,
  detail: string,
): string {
  const phaseLabels: Record<string, string> = {
    ping: "Ping",
    throughput: "Throughput",
    ordering: "Ordering",
    loss: "Loss",
  };
  const label = phaseLabels[phase] ?? phase;
  return `${label} ${nameA} ↔ ${nameB} — ${detail}`;
}
