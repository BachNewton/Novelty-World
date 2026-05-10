// Web Worker that runs the (potentially seconds-long) sugiyama layout off the
// main thread. Bundled by Next.js via `new Worker(new URL(...))`.
//
// Two-pass progressive layout:
//   "nice"  — fast barycenter heuristic, ~tens of ms. Posted first so the UI
//             gets a real-looking layout quickly.
//   "fancy" — optimal crossing minimization via integer program, seconds for
//             large trees. Replaces "nice" when it lands.

import { computeLayout } from "./logic";
import type { Layout, Tree } from "./types";

export type LayoutKind = "nice" | "fancy";

export interface LayoutRequest {
  id: number;
  tree: Tree;
}

export type LayoutResponse =
  | { id: number; ok: true; layout: Layout; kind: LayoutKind }
  | { id: number; ok: false; error: string };

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
  try {
    const nice = computeLayout(tree, { decross: "two-layer" });
    ctx.postMessage({ id, ok: true, layout: nice, kind: "nice" });

    const fancy = computeLayout(tree, { decross: "opt" });
    ctx.postMessage({ id, ok: true, layout: fancy, kind: "fancy" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ id, ok: false, error: message });
  }
};
