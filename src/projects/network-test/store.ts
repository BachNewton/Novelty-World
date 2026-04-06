import { create } from "zustand";
import type { TestPhase, ThroughputMeasurement, LinkTestResult } from "./types";

interface Progress {
  currentLinkId: string | null;
  currentNameA: string | null;
  currentNameB: string | null;
  currentTest: string;
  overallPercent: number;
}

interface PeerSideData {
  /** Sequence numbers received for ordering test */
  orderReceived: number[];
  /** Count of loss bursts received */
  lossReceived: number;
  /** Total loss bursts expected */
  lossTotal: number;
  /** Throughput round tracking */
  tpRoundStartTime: number;
  tpRoundBytesReceived: number;
}

const initialPeerSideData: PeerSideData = {
  orderReceived: [],
  lossReceived: 0,
  lossTotal: 0,
  tpRoundStartTime: 0,
  tpRoundBytesReceived: 0,
};

interface NetworkTestState {
  testPhase: TestPhase;
  progress: Progress;

  // Host accumulates — keyed by linkId
  pingRawSamples: Record<string, number[]>;
  throughputRaw: Record<
    string,
    {
      downMeasurements: ThroughputMeasurement[];
      upMeasurements: ThroughputMeasurement[];
    }
  >;
  orderingRaw: Record<string, { received: number[]; outOfOrder: number }>;
  lossRaw: Record<string, { received: number; total: number }>;

  // Local peer tracks (for when this peer is a test participant)
  peerSideData: PeerSideData;

  // Final
  results: LinkTestResult[] | null;
}

interface NetworkTestActions {
  setTestPhase: (phase: TestPhase) => void;
  updateProgress: (update: Partial<Progress>) => void;

  // Host-side (linkId-keyed)
  addPingSample: (linkId: string, rtt: number) => void;
  addThroughputMeasurement: (
    linkId: string,
    direction: "down" | "up",
    measurement: ThroughputMeasurement,
  ) => void;
  setOrderingResult: (
    linkId: string,
    received: number[],
    outOfOrder: number,
  ) => void;
  setLossResult: (linkId: string, received: number, total: number) => void;

  // Peer-side
  resetPeerSideData: () => void;
  recordOrderSeq: (seq: number) => void;
  recordLossBurst: (total: number) => void;
  recordTpRoundStart: () => void;
  recordTpRoundData: (bytes: number) => void;

  // Final
  setResults: (results: LinkTestResult[]) => void;
  reset: () => void;
}

export type NetworkTestStore = NetworkTestState & NetworkTestActions;

const initialState: NetworkTestState = {
  testPhase: "idle",
  progress: {
    currentLinkId: null,
    currentNameA: null,
    currentNameB: null,
    currentTest: "",
    overallPercent: 0,
  },
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

  addPingSample: (linkId, rtt) =>
    set((s) => ({
      pingRawSamples: {
        ...s.pingRawSamples,
        [linkId]: [...(s.pingRawSamples[linkId] ?? []), rtt],
      },
    })),

  addThroughputMeasurement: (linkId, direction, measurement) =>
    set((s) => {
      const prev = s.throughputRaw[linkId] ?? {
        downMeasurements: [],
        upMeasurements: [],
      };
      return {
        throughputRaw: {
          ...s.throughputRaw,
          [linkId]:
            direction === "down"
              ? {
                  ...prev,
                  downMeasurements: [...prev.downMeasurements, measurement],
                }
              : {
                  ...prev,
                  upMeasurements: [...prev.upMeasurements, measurement],
                },
        },
      };
    }),

  setOrderingResult: (linkId, received, outOfOrder) =>
    set((s) => ({
      orderingRaw: {
        ...s.orderingRaw,
        [linkId]: { received, outOfOrder },
      },
    })),

  setLossResult: (linkId, received, total) =>
    set((s) => ({
      lossRaw: { ...s.lossRaw, [linkId]: { received, total } },
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

  recordTpRoundStart: () =>
    set((s) => ({
      peerSideData: {
        ...s.peerSideData,
        tpRoundStartTime: performance.now(),
        tpRoundBytesReceived: 0,
      },
    })),

  recordTpRoundData: (bytes) =>
    set((s) => ({
      peerSideData: {
        ...s.peerSideData,
        tpRoundBytesReceived: s.peerSideData.tpRoundBytesReceived + bytes,
      },
    })),

  setResults: (results) => set({ results }),

  reset: () => set({ ...initialState, peerSideData: { ...initialPeerSideData } }),
}));
