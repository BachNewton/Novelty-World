"use client";

import { create } from "zustand";
import { createClient } from "@/shared/lib/supabase/client";
import type { Layout, Tree } from "./types";
import { normalizeTree, topologyHash } from "./logic";
import { fetchTreeRow } from "./persistence";

// The row always holds the tree and an exact layout for it, so anything else
// is a bug in whatever wrote it, shown as an error rather than patched over.
export type TreeLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; tree: Tree; layout: Layout };

interface FamilyTreeState {
  load: TreeLoad;
  selectedId: string | null;
  hydrate: () => Promise<void>;
  setSelected: (id: string | null) => void;
}

let hydratePromise: Promise<void> | null = null;

async function loadTree(): Promise<TreeLoad> {
  const row = await fetchTreeRow(createClient());
  if (row === null) return { status: "error", message: "There is no family tree saved yet." };
  const { tree } = normalizeTree(row.data);
  if (row.layout === null) {
    return { status: "error", message: "The saved tree has no layout." };
  }
  const treeHash = topologyHash(tree);
  if (row.layoutTreeHash !== treeHash) {
    return {
      status: "error",
      message: `The saved layout was solved for a different tree (layout ${String(row.layoutTreeHash)}, tree ${treeHash}).`,
    };
  }
  return { status: "ready", tree, layout: row.layout };
}

export const useFamilyTreeStore = create<FamilyTreeState>((set) => ({
  load: { status: "loading" },
  selectedId: null,

  hydrate: () => {
    hydratePromise ??= (async () => {
      try {
        set({ load: await loadTree() });
      } catch (err) {
        set({
          load: { status: "error", message: err instanceof Error ? err.message : String(err) },
        });
      }
    })();
    return hydratePromise;
  },

  setSelected: (id) => { set({ selectedId: id }); },
}));
