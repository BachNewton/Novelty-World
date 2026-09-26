// Progress for the exact crossing-minimization solve, read from HiGHS's
// human-readable solve log (see solver-progress-notes.md for why there is no
// percentage). The log is not an API, so parsing is best-effort: a line we
// don't recognise leaves the numbers untouched, and the caller still treats
// its arrival as a liveness heartbeat.

export type SolvePhase = "preparing" | "presolve" | "search" | "placing";

export interface SolveProgress {
  phase: SolvePhase;
  // Proven floor on the crossing count. Only rises.
  bound: number | null;
  // Crossing count of the best layout found so far. Only falls.
  best: number | null;
}

export const INITIAL_SOLVE_PROGRESS: SolveProgress = {
  phase: "preparing",
  bound: null,
  best: null,
};

export function advanceSolveProgress(
  progress: SolveProgress,
  line: string,
): SolveProgress {
  if (line.startsWith("Presolving model")) {
    return { ...progress, phase: "presolve" };
  }
  if (line.startsWith("Solving MIP model")) {
    return { ...progress, phase: "search" };
  }
  if (line.startsWith("Solving report")) {
    return { ...progress, phase: "placing" };
  }
  const row = parseBoundsRow(line);
  if (row === null) return progress;
  return { ...progress, bound: row.bound, best: row.best };
}

// A branch-and-bound table row looks like
//   [src]  proc  inQueue | leaves  expl% | bestBound  bestSol  gap | ...
// where the optional source is a single letter naming what found the
// solution. The objective is crossings plus a tie-break term that sums to
// less than 1, so flooring either bound yields a valid crossing count.
function parseBoundsRow(
  line: string,
): { bound: number | null; best: number | null } | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length > 0 && /^[A-Za-z]$/.test(tokens[0])) tokens.shift();
  if (tokens.length < 6) return null;
  const [proc, inQueue, leaves, explored, bestBound, bestSol] = tokens;
  const counts = [proc, inQueue, leaves];
  if (!counts.every((t) => /^\d+$/.test(t))) return null;
  if (!/^[\d.]+%$/.test(explored)) return null;
  const bound = parseCount(bestBound);
  const best = parseCount(bestSol);
  if (bound === undefined || best === undefined) return null;
  return { bound, best };
}

// null for an infinite (not-yet-known) value, undefined for a non-number.
function parseCount(token: string): number | null | undefined {
  if (token === "inf" || token === "-inf") return null;
  const value = Number(token);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}
