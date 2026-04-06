"use client";

import { useEffect, useCallback, useRef } from "react";
import type { GameRoom } from "@/shared/lib/multiplayer";
import { useNetworkTestStore } from "../store";
import {
  computePingStats,
  computeThroughputResult,
  computeOrderingResult,
  computeLossResult,
  aggregatePeerResult,
  generatePaddingChunk,
} from "../logic";
import {
  MSG,
  PING_COUNT,
  PING_INTERVAL_MS,
  THROUGHPUT_DURATION_MS,
  THROUGHPUT_BATCH_PER_TICK,
  THROUGHPUT_IDLE_MS,
  ORDER_COUNT,
  LOSS_COUNT,
  LOSS_WAIT_MS,
} from "../types";
import type {
  PingPayload,
  PongPayload,
  ThroughputDataPayload,
  ThroughputAckPayload,
  OrderSeqPayload,
  OrderReportPayload,
  LossBurstPayload,
  LossReportPayload,
  StartPhasePayload,
  ProgressPayload,
  PeerTestResult,
} from "../types";
import { TestProgress } from "./test-progress";
import { TestResults } from "./test-results";
import { Button } from "@/shared/components/ui/button";

interface TestSessionProps {
  room: GameRoom;
  onLeave: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms),
    ),
  ]);
}

export function TestSession({ room, onLeave }: TestSessionProps) {
  const { isHost, send, sendTo, onMessage, players } = room;
  const testPhase = useNetworkTestStore((s) => s.testPhase);
  const abortRef = useRef<AbortController | null>(null);

  // -----------------------------------------------------------------------
  // GUEST: respond to test messages
  // -----------------------------------------------------------------------

  // Respond to pings
  useEffect(() => {
    return onMessage<PingPayload>(MSG.PING, (msg) => {
      send<PongPayload>(MSG.PONG, { seq: msg.payload.seq, sendTime: msg.payload.sendTime });
    });
  }, [onMessage, send]);

  // Listen for phase announcements
  useEffect(() => {
    return onMessage<StartPhasePayload>(MSG.START_PHASE, (msg) => {
      useNetworkTestStore.getState().setTestPhase(msg.payload.phase);
    });
  }, [onMessage]);

  // Listen for progress updates
  useEffect(() => {
    return onMessage<ProgressPayload>(MSG.PROGRESS, (msg) => {
      useNetworkTestStore.getState().updateProgress(msg.payload);
    });
  }, [onMessage]);

  // Guest throughput: single THROUGHPUT_START triggers the full sequence.
  // 1. Track incoming downstream data from host
  // 2. When data stops (inactivity), send downstream ACK
  // 3. Immediately start sending upstream data for THROUGHPUT_DURATION_MS
  const tpIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isHost) return;
    let tracking = false;
    let ackSent = false;

    const unsub1 = onMessage(MSG.THROUGHPUT_START, () => {
      useNetworkTestStore.getState().resetPeerSideData();
      useNetworkTestStore.getState().recordThroughputStart();
      tracking = true;
      ackSent = false;
    });

    const unsub2 = onMessage<ThroughputDataPayload>(MSG.THROUGHPUT_DATA, (msg) => {
      if (!tracking || ackSent) return;

      useNetworkTestStore.getState().recordThroughputData(msg.payload.chunk.length);

      // Reset inactivity timer
      if (tpIdleTimerRef.current) clearTimeout(tpIdleTimerRef.current);
      tpIdleTimerRef.current = setTimeout(() => {
        if (ackSent) return;
        ackSent = true;
        tracking = false;

        // Send downstream result
        const { tpStartTime, tpBytesReceived } = useNetworkTestStore.getState().peerSideData;
        send<ThroughputAckPayload>(MSG.THROUGHPUT_ACK, {
          bytesReceived: tpBytesReceived,
          elapsedMs: performance.now() - tpStartTime,
        });

        // Immediately start upstream
        const chunk = generatePaddingChunk();
        const endTime = performance.now() + THROUGHPUT_DURATION_MS;
        function sendBatch() {
          if (performance.now() >= endTime) return;
          for (let b = 0; b < THROUGHPUT_BATCH_PER_TICK && performance.now() < endTime; b++) {
            send<ThroughputDataPayload>(MSG.THROUGHPUT_DATA, { chunk });
          }
          setTimeout(sendBatch, 0);
        }
        sendBatch();
      }, THROUGHPUT_IDLE_MS);
    });

    return () => {
      unsub1();
      unsub2();
      if (tpIdleTimerRef.current) clearTimeout(tpIdleTimerRef.current);
    };
  }, [isHost, onMessage, send]);

  // Ordering: guest records sequence
  useEffect(() => {
    if (isHost) return;

    const unsub = onMessage<OrderSeqPayload>(MSG.ORDER_SEQ, (msg) => {
      useNetworkTestStore.getState().recordOrderSeq(msg.payload.seq);
    });

    return unsub;
  }, [isHost, onMessage]);

  // Ordering: guest sends report when requested (after short delay)
  useEffect(() => {
    if (isHost) return;

    return onMessage<StartPhasePayload>(MSG.START_PHASE, (msg) => {
      if (msg.payload.phase !== "ordering") return;
      // Reset ordering data for this round
      useNetworkTestStore.getState().resetPeerSideData();
    });
  }, [isHost, onMessage]);

  // Loss: guest counts bursts
  useEffect(() => {
    if (isHost) return;

    return onMessage<LossBurstPayload>(MSG.LOSS_BURST, (msg) => {
      useNetworkTestStore.getState().recordLossBurst(msg.payload.total);
    });
  }, [isHost, onMessage]);

  // Final results: guest receives
  useEffect(() => {
    return onMessage<PeerTestResult[]>(MSG.FINAL_RESULTS, (msg) => {
      const store = useNetworkTestStore.getState();
      store.setResults(msg.payload);
      store.setTestPhase("done");
    });
  }, [onMessage]);

  // -----------------------------------------------------------------------
  // HOST: run test suite
  // -----------------------------------------------------------------------

  const isAborted = () => abortRef.current?.signal.aborted === true;

  const runTestSuite = useCallback(async () => {
    const store = useNetworkTestStore.getState();
    store.reset();

    abortRef.current = new AbortController();

    const connectedPeers = players.filter((p) => p.status === "connected");
    const totalPeers = connectedPeers.length;
    const totalSteps = totalPeers * 4; // 4 test phases per peer
    let completedSteps = 0;

    function updateOverall(peerIdx: number, testName: string) {
      const progress: ProgressPayload = {
        currentPeerId: connectedPeers[peerIdx]?.id ?? null,
        currentTest: testName,
        overallPercent: (completedSteps / totalSteps) * 100,
      };
      store.updateProgress(progress);
      send<ProgressPayload>(MSG.PROGRESS, progress);
    }

    try {
      // --- PING ---
      store.setTestPhase("ping");
      send<StartPhasePayload>(MSG.START_PHASE, { phase: "ping" });
      await delay(100);

      for (let pi = 0; pi < totalPeers; pi++) {
        const peer = connectedPeers[pi];
        for (let seq = 0; seq < PING_COUNT; seq++) {
          if (isAborted()) return;

          updateOverall(pi, `Ping ${peer.id.slice(0, 8)} (${seq + 1}/${PING_COUNT})`);

          const rtt = await withTimeout(
            new Promise<number>((resolve) => {
              const sendTime = performance.now();
              const unsub = onMessage<PongPayload>(MSG.PONG, (msg) => {
                if (msg.payload.seq === seq && msg.from === peer.id) {
                  unsub();
                  resolve(performance.now() - sendTime);
                }
              });
              sendTo<PingPayload>(peer.id, MSG.PING, { seq, sendTime });
            }),
            10_000,
            `ping ${seq}`,
          );

          store.addPingSample(peer.id, rtt);
          await delay(PING_INTERVAL_MS);
        }
        completedSteps++;
      }

      // --- THROUGHPUT ---
      store.setTestPhase("throughput");
      send<StartPhasePayload>(MSG.START_PHASE, { phase: "throughput" });
      await delay(100);

      for (let pi = 0; pi < totalPeers; pi++) {
        const peer = connectedPeers[pi];
        if (isAborted()) return;

        // Register listeners BEFORE sending any data
        const downAckPromise = new Promise<ThroughputAckPayload>((resolve) => {
          const unsub = onMessage<ThroughputAckPayload>(MSG.THROUGHPUT_ACK, (msg) => {
            if (msg.from === peer.id) {
              unsub();
              resolve(msg.payload);
            }
          });
        });

        const upPromise = new Promise<{ bytes: number; ms: number }>((resolve) => {
          let upBytes = 0;
          let upStart = 0;
          let idleTimer: ReturnType<typeof setTimeout> | null = null;
          let lastUpProgress = 0;

          const unsub = onMessage<ThroughputDataPayload>(MSG.THROUGHPUT_DATA, (msg) => {
            if (msg.from !== peer.id) return;
            const now = performance.now();
            if (upStart === 0) upStart = now;
            upBytes += msg.payload.chunk.length;

            // Broadcast progress every 500ms
            if (now - lastUpProgress > 500) {
              const pct = Math.min((now - upStart) / THROUGHPUT_DURATION_MS, 1);
              updateOverall(pi, `Throughput ↑ ${peer.id.slice(0, 8)} (${Math.round(pct * 100)}%)`);
              lastUpProgress = now;
            }

            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              unsub();
              resolve({ bytes: upBytes, ms: performance.now() - upStart });
            }, THROUGHPUT_IDLE_MS);
          });
        });

        // Single control message — guest auto-sequences downstream→upstream
        sendTo(peer.id, MSG.THROUGHPUT_START, {});
        await delay(50);

        // Downstream: host → peer (with periodic progress updates)
        const chunk = generatePaddingChunk();
        const downEnd = performance.now() + THROUGHPUT_DURATION_MS;
        let lastProgressUpdate = 0;

        while (performance.now() < downEnd && !isAborted()) {
          for (let b = 0; b < THROUGHPUT_BATCH_PER_TICK && performance.now() < downEnd; b++) {
            sendTo<ThroughputDataPayload>(peer.id, MSG.THROUGHPUT_DATA, { chunk });
          }

          // Update progress every 500ms
          const now = performance.now();
          if (now - lastProgressUpdate > 500) {
            const elapsed = now - (downEnd - THROUGHPUT_DURATION_MS);
            const pct = Math.min(elapsed / THROUGHPUT_DURATION_MS, 1);
            updateOverall(pi, `Throughput ↓ ${peer.id.slice(0, 8)} (${Math.round(pct * 100)}%)`);
            lastProgressUpdate = now;
          }

          await delay(0); // yield to keep UI responsive
        }

        // Wait for downstream ack (guest sends after inactivity detection)
        updateOverall(pi, `Throughput ↓ ${peer.id.slice(0, 8)} — measuring`);
        const downAck = await withTimeout(downAckPromise, 30_000, "throughput down ack");
        store.setThroughputResult(peer.id, "down", downAck.bytesReceived, downAck.elapsedMs);

        // Wait for upstream data (guest auto-starts after sending downstream ack)
        updateOverall(pi, `Throughput ↑ ${peer.id.slice(0, 8)} — starting`);
        const upResult = await withTimeout(upPromise, 30_000, "throughput up");
        store.setThroughputResult(peer.id, "up", upResult.bytes, upResult.ms);

        completedSteps++;
      }

      // --- ORDERING ---
      store.setTestPhase("ordering");
      send<StartPhasePayload>(MSG.START_PHASE, { phase: "ordering" });
      await delay(100);

      for (let pi = 0; pi < totalPeers; pi++) {
        const peer = connectedPeers[pi];
        if (isAborted()) return;

        updateOverall(pi, `Ordering ${peer.id.slice(0, 8)}`);

        for (let seq = 0; seq < ORDER_COUNT; seq++) {
          sendTo<OrderSeqPayload>(peer.id, MSG.ORDER_SEQ, { seq });
        }

        // Wait for messages to arrive, then request report
        await delay(2_000);

        const report = await withTimeout(
          new Promise<OrderReportPayload>((resolve) => {
            const unsub = onMessage<OrderReportPayload>(MSG.ORDER_REPORT, (msg) => {
              if (msg.from === peer.id) {
                unsub();
                resolve(msg.payload);
              }
            });
            // Request guest to send their report
            sendTo(peer.id, MSG.ORDER_REPORT, {});
          }),
          10_000,
          "ordering report",
        );

        store.setOrderingResult(peer.id, report.received, report.outOfOrder);
        completedSteps++;
      }

      // --- LOSS ---
      store.setTestPhase("loss");
      send<StartPhasePayload>(MSG.START_PHASE, { phase: "loss" });
      await delay(100);

      for (let pi = 0; pi < totalPeers; pi++) {
        const peer = connectedPeers[pi];
        if (isAborted()) return;

        updateOverall(pi, `Loss test ${peer.id.slice(0, 8)}`);

        for (let seq = 0; seq < LOSS_COUNT; seq++) {
          sendTo<LossBurstPayload>(peer.id, MSG.LOSS_BURST, { seq, total: LOSS_COUNT });
        }

        await delay(LOSS_WAIT_MS + 1000);

        const lossReport = await withTimeout(
          new Promise<LossReportPayload>((resolve) => {
            // Request guest to send report
            sendTo(peer.id, MSG.LOSS_REPORT, {});

            const unsub = onMessage<LossReportPayload>(MSG.LOSS_REPORT, (msg) => {
              if (msg.from === peer.id) {
                unsub();
                resolve(msg.payload);
              }
            });
          }),
          10_000,
          "loss report",
        );

        store.setLossResult(peer.id, lossReport.received, lossReport.total);
        completedSteps++;
      }

      // --- AGGREGATE ---
      const finalProgress: ProgressPayload = {
        currentPeerId: null,
        currentTest: "Complete",
        overallPercent: 100,
      };
      store.updateProgress(finalProgress);
      send<ProgressPayload>(MSG.PROGRESS, finalProgress);

      const storeState = useNetworkTestStore.getState();
      const results: PeerTestResult[] = connectedPeers.map((peer) => {
        const pingSamples = storeState.pingRawSamples[peer.id] ?? [];
        const tp = storeState.throughputRaw[peer.id] ?? { downBytes: 0, downMs: 0, upBytes: 0, upMs: 0 };
        const ord = storeState.orderingRaw[peer.id] ?? { received: [], outOfOrder: 0 };
        const lossData = storeState.lossRaw[peer.id] ?? { received: 0, total: LOSS_COUNT };

        return aggregatePeerResult(
          peer.id,
          computePingStats(pingSamples),
          computeThroughputResult(
            { bytes: tp.downBytes, ms: tp.downMs },
            { bytes: tp.upBytes, ms: tp.upMs },
          ),
          computeOrderingResult(ORDER_COUNT, ord.received, ord.outOfOrder),
          computeLossResult(lossData.total, lossData.received),
        );
      });

      store.setResults(results);
      store.setTestPhase("done");
      send<PeerTestResult[]>(MSG.FINAL_RESULTS, results);
    } catch (err) {
      if (!isAborted()) {
        console.error("[NetworkTest] Test suite error:", err);
      }
    }
  }, [players, send, sendTo, onMessage]);

  // Guest: respond to ordering report request
  useEffect(() => {
    if (isHost) return;

    return onMessage(MSG.ORDER_REPORT, () => {
      const { orderReceived } = useNetworkTestStore.getState().peerSideData;
      let outOfOrder = 0;
      for (let i = 1; i < orderReceived.length; i++) {
        if (orderReceived[i] < orderReceived[i - 1]) outOfOrder++;
      }
      send<OrderReportPayload>(MSG.ORDER_REPORT, {
        received: orderReceived,
        outOfOrder,
      });
    });
  }, [isHost, onMessage, send]);

  // Guest: respond to loss report request
  useEffect(() => {
    if (isHost) return;

    return onMessage(MSG.LOSS_REPORT, () => {
      const { lossReceived, lossTotal } = useNetworkTestStore.getState().peerSideData;
      send<LossReportPayload>(MSG.LOSS_REPORT, {
        received: lossReceived,
        total: lossTotal,
      });
    });
  }, [isHost, onMessage, send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleStartTest = useCallback(() => {
    runTestSuite();
  }, [runTestSuite]);

  const handleRunAgain = useCallback(() => {
    useNetworkTestStore.getState().reset();
    runTestSuite();
  }, [runTestSuite]);

  // --- Render ---

  if (room.phase === "disconnected") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Network Test</h1>
        <p className="text-brand-pink font-medium">Player disconnected</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  if (room.phase === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Network Test</h1>
        <p className="text-red-400 font-medium">Connection failed</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  if (testPhase === "done") {
    return (
      <TestResults isHost={isHost} onRunAgain={handleRunAgain} onLeave={onLeave} />
    );
  }

  if (testPhase !== "idle") {
    return <TestProgress />;
  }

  // Idle — waiting for host to start
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Network Test</h1>
      <p className="text-text-secondary">
        {players.filter((p) => p.status === "connected").length} peer
        {players.filter((p) => p.status === "connected").length !== 1 ? "s" : ""} connected
      </p>

      {isHost ? (
        <Button onClick={handleStartTest}>Start Test</Button>
      ) : (
        <p className="text-text-muted text-sm animate-pulse">
          Waiting for host to start test...
        </p>
      )}

      <Button variant="ghost" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
