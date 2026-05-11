"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_LAYOUT,
  diffTree,
  optimisticPatch,
} from "./logic";
import type { LayoutRequest, LayoutResponse } from "./layout.worker";
import type { Layout, Tree } from "./types";

// "none"   — no layout yet (cold load before first worker reply).
// "simple" — main-thread optimistic patch; placed near a relative.
// "nice"   — fast heuristic from the worker; real sugiyama, suboptimal crossings.
// "fancy"  — optimal layout from the worker; minimal crossings.
export type LayoutKind = "none" | "simple" | "nice" | "fancy";

interface UseLayoutWorker {
  layout: Layout;
  kind: LayoutKind;
  computing: boolean;
}

// Owns the layout worker and produces progressively-better layouts per tree
// change:
//   1. "simple" — optimistic patch (sync, ~0ms). Only useful for single-node
//      edits; bulk changes (hydration) skip straight to "none" + worker.
//   2. "nice"   — heuristic worker pass (~tens of ms). First real layout the
//      user sees on cold load. Skipped after fancy has ever completed —
//      see `skipNice` below.
//   3. "fancy"  — optimal worker pass (seconds for large n). Replaces "nice".
//
// Once fancy has completed at least once, subsequent incremental edits skip
// the nice pass: the on-screen layout is already at fancy quality (a single
// optimistic tweak on top of a fancy result), and re-running the heuristic
// would visibly *downgrade* the layout for a beat before fancy catches up.
// The skip only applies when we kept the previous layout (currentKind ==
// "simple"); bulk replacements blank to "none" and still need the nice pass
// so the user isn't staring at an empty canvas while fancy grinds.
//
// The optimistic patch runs synchronously *during render* so the layout we
// return always matches the tree we were called with — otherwise a deletion
// would render once with a stale layout still containing the deleted node,
// and node lookups in the parent would crash. React's "deriving state from
// props" pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders
//
// Rapid edits terminate the in-flight worker (its remaining "fancy" pass
// would otherwise tie up the queue for seconds with a stale result).
interface PendingDispatch {
  tick: number;
  skipNice: boolean;
}

export function useLayoutWorker(tree: Tree): UseLayoutWorker {
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [kind, setKind] = useState<LayoutKind>("none");
  const [prevTree, setPrevTree] = useState<Tree | null>(null);
  // Latches true on the first fancy result and stays true for the lifetime
  // of the hook. Gates the "skip nice" optimization for incremental edits.
  // Held in state (not a ref) so the render path can read it without
  // tripping react-hooks/refs.
  const [everCompletedFancy, setEverCompletedFancy] = useState(false);
  // Bumped whenever a real (non-rename) tree change happens; carries the
  // skip-nice decision alongside the tick so the dispatch effect doesn't
  // need to re-derive it. Bundled into one state so a single setState
  // commits both atomically and the effect's dep list stays minimal.
  const [pending, setPending] = useState<PendingDispatch>({
    tick: 0,
    skipNice: false,
  });

  const workerRef = useRef<Worker | null>(null);
  const generationRef = useRef(0);
  const latestRequestedRef = useRef(0);
  // Read inside the dispatch effect so tree changes don't trigger it on their
  // own — only pending bumps do. Without this, a cosmetic edit (rename,
  // commonName, gender) re-runs the worker because `tree` is a new reference
  // even though diffTree returned structurallyEqual.
  const treeRef = useRef(tree);
  useEffect(() => { treeRef.current = tree; }, [tree]);

  let currentLayout = layout;
  let currentKind = kind;

  if (prevTree !== tree) {
    setPrevTree(tree);
    if (prevTree === null) {
      currentLayout = EMPTY_LAYOUT;
      currentKind = "none";
      setLayout(currentLayout);
      setKind(currentKind);
      setPending((p) => ({ tick: p.tick + 1, skipNice: false }));
    } else {
      const diff = diffTree(prevTree, tree);
      if (!diff.structurallyEqual) {
        // Optimistic patch only makes sense for one-at-a-time user edits — it
        // places a new node next to a relative whose position is already
        // known. For bulk changes (hydration, restore-from-local) most new
        // nodes have no placed relative yet and pile up at the origin;
        // better to blank the canvas and let the heuristic worker pass
        // produce the first real layout.
        const isIncrementalEdit =
          diff.added.length <= 1 && diff.removed.length <= 1;
        const haveExistingLayout = currentLayout.nodes.length > 0;
        if (isIncrementalEdit && haveExistingLayout) {
          currentLayout = optimisticPatch(currentLayout, tree, diff);
          currentKind = "simple";
        } else {
          currentLayout = EMPTY_LAYOUT;
          currentKind = "none";
        }
        setLayout(currentLayout);
        setKind(currentKind);
        const skipNice = currentKind === "simple" && everCompletedFancy;
        setPending((p) => ({ tick: p.tick + 1, skipNice }));
      }
      // structurallyEqual: rename/gender — leave layout/kind alone, no dispatch.
    }
  }

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pending.tick === 0) return;
    // Tear down any in-flight worker. Its pending "fancy" pass could be
    // seconds away from finishing on a now-stale tree; letting it run
    // would block this new request and burn CPU on a result we'd ignore.
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("./layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<LayoutResponse>) => {
      const msg = e.data;
      if (msg.id !== latestRequestedRef.current) return;
      if (msg.ok) {
        setLayout(msg.layout);
        setKind(msg.kind);
        if (msg.kind === "fancy") {
          // Idempotent — React bails on equal values, so setting true
          // every fancy result is fine.
          setEverCompletedFancy(true);
        }
      } else {
        // Worker errored — pretend we're done so the spinner stops. Layout
        // stays at whatever was last rendered. The graph code has its own
        // fallback layout so this branch should be unreachable in practice.
        setKind("fancy");
      }
    };
    workerRef.current = worker;

    const id = generationRef.current + 1;
    generationRef.current = id;
    latestRequestedRef.current = id;
    const req: LayoutRequest = {
      id,
      tree: treeRef.current,
      skipNice: pending.skipNice,
    };
    worker.postMessage(req);
  }, [pending]);

  return {
    layout: currentLayout,
    kind: currentKind,
    // "fancy" is the terminal state — anything else means a worker pass is
    // in flight (or about to be: cold-load before the dispatch effect runs).
    computing: currentKind !== "fancy",
  };
}
