// Shared message-protocol types + constants for the ES fitness worker. Kept
// SEPARATE from `worker.ts` so the main thread (`fitness.ts`) can import them
// WITHOUT importing the worker module itself — importing worker.ts in the main
// thread would run its top-level `parentPort` guard and throw.

/** The sentinel a seat carries when it should be the parameterized candidate. */
export const CANDIDATE = "__candidate__";

export interface OptGameSpec {
  index: number;
  seed: string;
  /** Per-seat: `CANDIDATE` for the param bot, else a registry version label. */
  seats: readonly string[];
  maxTurns: number;
}

export interface OptGameResult {
  index: number;
  /** True iff the CANDIDATE seat won this game. */
  candidateWon: boolean;
  /** True iff a (non-candidate) panel seat won. */
  panelWon: boolean;
  terminated: boolean;
  error?: string;
}

export interface OptBatchMessage {
  /** The packed candidate vector (fixed PARAM_KEYS order), shared by every spec. */
  vector: number[];
  specs: OptGameSpec[];
}
