"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ROOT_ID } from "./logic";

export type ViewMode = "2d" | "3d";

const ROOT_PARAM = "root";
const VIEW_PARAM = "view";

// The view root and the 2D/3D mode live in the URL, so a copied link opens
// the tree from the same person in the same view. Defaults stay out of it.
export function useViewUrl() {
  const params = useSearchParams();
  const viewRootId = params.get(ROOT_PARAM) ?? ROOT_ID;
  const viewMode: ViewMode = params.get(VIEW_PARAM) === "3d" ? "3d" : "2d";

  const setParam = useCallback((name: string, value: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (value === null) next.delete(name);
    else next.set(name, value);
    const query = next.toString();
    // Next.js syncs useSearchParams with history.replaceState, and replacing
    // keeps Back from stepping through every root or view change.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  const setViewRoot = useCallback(
    (id: string) => { setParam(ROOT_PARAM, id === ROOT_ID ? null : id); },
    [setParam],
  );
  const setViewMode = useCallback(
    (mode: ViewMode) => { setParam(VIEW_PARAM, mode === "2d" ? null : mode); },
    [setParam],
  );

  return { viewRootId, viewMode, setViewRoot, setViewMode };
}
