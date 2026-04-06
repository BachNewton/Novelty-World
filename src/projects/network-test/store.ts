import { create } from "zustand";
import type { TestPhase, PeerTestResult } from "./types";

interface Progress {
  currentPeerId: string | null;
  currentTest: string;
  overallPercent: number;
}

interface PeerSideData {
  orderReceived: number[];
  lossReceived: number;
  lossTotal: number;
  tpStartTime: number;
  tpBytesReceived: number;
}

const initialPeerSideData: PeerSideData = {
  orderReceived: [],
  lossReceived: 0,
  lossTotal: 0,
  tpStartTime: 0,
  tpBytesReceived: 0,
};

interface NetworkTestState {
  testPhase: TestPhase;
  progress: Progress;

  // Host accumulates
  pingRawSamples: Record<string, number[]>;
  throughputRaw: Record<string, { downBytes: number; downMs: number; upBytes: number; upMs: number }>;
  orderingRaw: Record<string, { received: number[]; outOfOrder: number }>;
  lossRaw: Record<string, { received: number; total: number }>;

  // Guest tracks
  peerSideData: PeerSideData;

  // Final
  results: PeerTestResult[] | null;
}

interface NetworkTestActions {
  setTestPhase: (phase: TestPhase) => void;
  updateProgress: (update: Partial<Progress>) => void;

  // Host-side
  addPingSample: (peerId: string, rtt: number) => void;
  setThroughputResult: (peerId: string, direction: "down" | "up", bytes: number, ms: number) => void;
  setOrderingResult: (peerId: string, received: number[], outOfOrder: number) => void;
  setLossResult: (peerId: string, received: number, total: number) => void;

  // Guest-side
  resetPeerSideData: () => void;
  recordOrderSeq: (seq: number) => void;
  recordLossBurst: (total: number) => void;
  recordThroughputStart: () => void;
  recordThroughputData: (bytes: number) => void;

  // Final
  setResults: (results: PeerTestResult[]) => void;
  reset: () => void;
}

export type NetworkTestStore = NetworkTestState & NetworkTestActions;

const initialState: NetworkTestState = {
  testPhase: "idle",
  progress: { currentPeerId: null, currentTest: "", overallPercent: 0 },
  pingRawSamples: {},
  throughputRaw: {},
  orderingRaw: {},
  lossRaw: {},
  peerSideData: { ...initialPeerSideData },
  results: null,
};

export const useNetworkTestStore = create<NetworkTestStore>((set) => ({
  ...initialState,

  setTestPhase: (phase) => set({ testPhase: phase }),

  updateProgress: (update) =>
    set((s) => ({ progress: { ...s.progress, ...update } })),

  addPingSample: (peerId, rtt) =>
    set((s) => ({
      pingRawSamples: {
        ...s.pingRawSamples,
        [peerId]: [...(s.pingRawSamples[peerId] ?? []), rtt],
      },
    })),

  setThroughputResult: (peerId, direction, bytes, ms) =>
    set((s) => {
      const prev = s.throughputRaw[peerId] ?? { downBytes: 0, downMs: 0, upBytes: 0, upMs: 0 };
      return {
        throughputRaw: {
          ...s.throughputRaw,
          [peerId]: direction === "down"
            ? { ...prev, downBytes: bytes, downMs: ms }
            : { ...prev, upBytes: bytes, upMs: ms },
        },
      };
    }),

  setOrderingResult: (peerId, received, outOfOrder) =>
    set((s) => ({
      orderingRaw: { ...s.orderingRaw, [peerId]: { received, outOfOrder } },
    })),

  setLossResult: (peerId, received, total) =>
    set((s) => ({
      lossRaw: { ...s.lossRaw, [peerId]: { received, total } },
    })),

  resetPeerSideData: () => set({ peerSideData: { ...initialPeerSideData } }),

  recordOrderSeq: (seq) =>
    set((s) => ({
      peerSideData: {
        ...s.peerSideData,
        orderReceived: [...s.peerSideData.orderReceived, seq],
      },
    })),

  recordLossBurst: (total) =>
    set((s) => ({
      peerSideData: {
        ...s.peerSideData,
        lossReceived: s.peerSideData.lossReceived + 1,
        lossTotal: total,
      },
    })),

  recordThroughputStart: () =>
    set((s) => ({
      peerSideData: { ...s.peerSideData, tpStartTime: performance.now(), tpBytesReceived: 0 },
    })),

  recordThroughputData: (bytes) =>
    set((s) => ({
      peerSideData: {
        ...s.peerSideData,
        tpBytesReceived: s.peerSideData.tpBytesReceived + bytes,
      },
    })),

  setResults: (results) => set({ results }),

  reset: () => set({ ...initialState, peerSideData: { ...initialPeerSideData } }),
}));
