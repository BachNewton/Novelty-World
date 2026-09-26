// Web Worker that runs the (potentially seconds-long) sugiyama layout off
// the main thread. Bundled by Next.js via `new Worker(new URL(...))`.
//
// One pass: the optimal HiGHS-backed sugiyama layout. The previous "nice"
// heuristic pass is gone — the main thread shows a cached layout (or an
// optimistic fast patch) in the meantime, so there's no value in posting a
// suboptimal intermediate result that would visibly downgrade the canvas
// before the fancy result lands.
//
// The worker stays dumb: it computes a Layout for the tree it's handed and
// posts it back. Staleness checks (did the DB change while we were solving?)
// live in the store; the worker itself is a pure compute pipe.

import { setSolverLogListener } from "./decross-highs";
import { computeLayout } from "./logic";
import { INITIAL_SOLVE_PROGRESS, advanceSolveProgress } from "./solver-progress";
import type { SolveProgress } from "./solver-progress";
import type { Layout, Tree } from "./types";

export interface LayoutRequest {
  id: number;
  tree: Tree;
}

// One `progress` message per solver log line, even when the line changed
// nothing: its arrival is the liveness heartbeat.
export type LayoutResponse =
  | { id: number; type: "progress"; progress: SolveProgress }
  | { id: number; type: "done"; layout: Layout }
  | { id: number; type: "error"; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (msg: LayoutResponse) => void;
}

// `self` inside a Worker is a DedicatedWorkerGlobalScope, which isn't in our
// tsconfig lib (we only ship "dom"). Cast to a minimal local shape instead of
// pulling in the whole webworker lib.
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e) => {
  const { id, tree } = e.data;
  let progress = INITIAL_SOLVE_PROGRESS;
  ctx.postMessage({ id, type: "progress", progress });
  // HiGHS logs synchronously from inside solve(); the main thread still
  // receives these posts live because only this worker is blocked.
  setSolverLogListener((line) => {
    progress = advanceSolveProgress(progress, line);
    ctx.postMessage({ id, type: "progress", progress });
  });
  void (async () => {
    try {
      const layout = await computeLayout(tree);
      ctx.postMessage({ id, type: "done", layout });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.postMessage({ id, type: "error", error: message });
    } finally {
      setSolverLogListener(null);
    }
  })();
};
