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

// Owns the layout worker and produces three progressively-better layouts per
// tree change:
//   1. "simple" — optimistic patch (sync, ~0ms). Only useful for single-node
//      edits; bulk changes (hydration) skip straight to "none" + worker.
//   2. "nice"   — heuristic worker pass (~tens of ms). First real layout the
//      user sees on cold load.
//   3. "fancy"  — optimal worker pass (seconds for large n). Replaces "nice".
//
// Rapid edits terminate the in-flight worker (its remaining "fancy" pass
// would otherwise tie up the queue for seconds with a stale result).
export function useLayoutWorker(tree: Tree): UseLayoutWorker {
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [kind, setKind] = useState<LayoutKind>("none");
  const [computing, setComputing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);
  const prevTreeRef = useRef<Tree | null>(null);
  const generationRef = useRef(0);
  const latestRequestedRef = useRef(0);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevTreeRef.current;
    prevTreeRef.current = tree;
    if (prev === tree) return;

    const dispatch = (): void => {
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
          layoutRef.current = msg.layout;
          setLayout(msg.layout);
          setKind(msg.kind);
          if (msg.kind === "fancy") setComputing(false);
        } else {
          setComputing(false);
        }
      };
      workerRef.current = worker;

      const id = generationRef.current + 1;
      generationRef.current = id;
      latestRequestedRef.current = id;
      setComputing(true);
      const req: LayoutRequest = { id, tree };
      worker.postMessage(req);
    };

    if (prev === null) {
      dispatch();
      return;
    }

    const diff = diffTree(prev, tree);
    if (diff.structurallyEqual) {
      // Names/genders changed — nothing for the layout to do. Don't dispatch
      // (would just churn) and don't change kind (would mislead the user).
      return;
    }

    // Optimistic patch only makes sense for one-at-a-time user edits — it
    // places a new node next to a relative whose position is already known.
    // For bulk changes (hydration, restore-from-local) most new nodes have
    // no placed relative yet and pile up at the origin; better to blank the
    // canvas and let the heuristic worker pass produce the first real layout.
    const isIncrementalEdit =
      diff.added.length <= 1 && diff.removed.length <= 1;
    const haveExistingLayout = layoutRef.current.nodes.length > 0;
    if (isIncrementalEdit && haveExistingLayout) {
      const patched = optimisticPatch(layoutRef.current, tree, diff);
      layoutRef.current = patched;
      setLayout(patched);
      setKind("simple");
    } else {
      layoutRef.current = EMPTY_LAYOUT;
      setLayout(EMPTY_LAYOUT);
      setKind("none");
    }
    dispatch();
  }, [tree]);

  return { layout, kind, computing };
}
