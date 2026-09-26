"use client";

import { create } from "zustand";
import { createClient } from "@/shared/lib/supabase/client";
import type { Gender, Layout, NameFields, Tree, UnionStatus } from "./types";
import {
  ROOT_ID,
  addChild as logicAddChild,
  addParent as logicAddParent,
  addSpouse as logicAddSpouse,
  createInitialTree,
  deletePerson as logicDeletePerson,
  normalizeTree,
  renamePerson as logicRenamePerson,
  setGender as logicSetGender,
  setNotes as logicSetNotes,
  setUnionStatus as logicSetUnionStatus,
  topologyHash,
} from "./logic";
import type { LayoutRequest, LayoutResponse } from "./layout.worker";
import { INITIAL_SOLVE_PROGRESS } from "./solver-progress";
import type { SolveProgress } from "./solver-progress";

const TABLE = "family_tree";
const ROW_ID = "global";
const SAVE_DEBOUNCE_MS = 500;

type Status = "idle" | "loading" | "ready" | "error";

interface FamilyTreeState {
  tree: Tree;
  // Last fancy layout we know about (from Supabase) and the topology hash
  // it was solved against. `inSync` in the hook is
  // `cachedLayoutHash === topologyHash(tree)`.
  cachedLayout: Layout | null;
  cachedLayoutHash: string | null;
  status: Status;
  saving: boolean;
  // A worker is solving right now. Drives the "Optimizing…" UI; flips back
  // to false on success, cancel, or staleness rejection.
  optimizing: boolean;
  // Live view of the running solve. Only meaningful while `optimizing`.
  solveProgress: SolveProgress;
  solveStartedAt: number;
  // When the worker last reported anything — the liveness signal.
  solveLastUpdateAt: number;
  // Why the last optimize failed, until dismissed or retried.
  optimizeError: string | null;
  selectedId: string | null;
  // Local-only viewing perspective. Defaults to ROOT_ID, never persisted to
  // Supabase. Resets to ROOT_ID on reload by design.
  viewRootId: string;
  hydrate: () => Promise<void>;
  setSelected: (id: string | null) => void;
  setViewRoot: (id: string) => void;
  resetViewRoot: () => void;
  optimize: () => void;
  cancelOptimize: () => void;
  dismissOptimizeError: () => void;
  addParent: (childId: string, name: NameFields, gender: Gender) => void;
  addChild: (
    parentId: string,
    name: NameFields,
    gender: Gender,
    coParentId?: string | null,
  ) => void;
  addSpouse: (
    personId: string,
    name: NameFields,
    gender: Gender,
    status?: UnionStatus,
    bioChildIds?: readonly string[],
  ) => void;
  setUnionStatus: (aId: string, bId: string, status: UnionStatus) => void;
  rename: (id: string, name: NameFields) => void;
  setGender: (id: string, gender: Gender) => void;
  setNotes: (id: string, notes: string) => void;
  remove: (id: string) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;

// Module-scoped because Workers aren't serializable into zustand state.
// Each optimize() call bumps `activeOptimizeId`; the postMessage callback
// checks it before committing the result so a late reply from a worker we
// already terminated can't trample fresher state.
let activeWorker: Worker | null = null;
let activeOptimizeId = 0;

function terminateActiveWorker(): void {
  if (activeWorker !== null) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

async function persistTree(
  tree: Tree,
  setSaving: (b: boolean) => void,
): Promise<void> {
  setSaving(true);
  try {
    const supabase = createClient();
    // Upsert touches only the listed columns — `layout` and
    // `layout_tree_hash` keep whatever the last Optimize wrote, so
    // ordinary tree edits don't wipe the cached fancy result. The cache
    // becomes "stale" by virtue of the tree's new hash no longer matching
    // `layout_tree_hash`; the user's Optimize button signals that and
    // lets them refresh it.
    await supabase
      .from(TABLE)
      .upsert({ id: ROW_ID, data: tree, updated_at: new Date().toISOString() });
  } finally {
    setSaving(false);
  }
}

function scheduleSave(tree: Tree, setSaving: (b: boolean) => void): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistTree(tree, setSaving);
  }, SAVE_DEBOUNCE_MS);
}

// Normalize raw form text into the trimmed shape the logic layer expects.
// Empty firstName is treated as "Unnamed" because every Person must have a
// non-empty first name; the other fields are allowed to be empty strings.
function cleanName(name: NameFields): NameFields {
  return {
    firstName: name.firstName.trim() || "Unnamed",
    lastName: name.lastName.trim(),
    commonName: name.commonName.trim(),
    birthSurname: name.birthSurname.trim(),
  };
}

export const useFamilyTreeStore = create<FamilyTreeState>((set, get) => {
  // Apply a logic mutation: if it produced a new tree (i.e. wasn't a no-op),
  // commit it to state and schedule a save. Also terminate any in-flight
  // optimize — its result would be for a tree the user has already moved
  // past, so letting it run wastes CPU and the conditional upload would
  // reject it anyway.
  function applyMutation(mutate: (tree: Tree) => Tree): void {
    const { tree } = get();
    const next = mutate(tree);
    if (next === tree) return;
    if (get().optimizing) {
      terminateActiveWorker();
      set({ optimizing: false });
    }
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  }

  return {
  tree: createInitialTree(),
  cachedLayout: null,
  cachedLayoutHash: null,
  status: "idle",
  saving: false,
  optimizing: false,
  solveProgress: INITIAL_SOLVE_PROGRESS,
  solveStartedAt: 0,
  solveLastUpdateAt: 0,
  optimizeError: null,
  selectedId: null,
  viewRootId: ROOT_ID,

  hydrate: async () => {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ status: "loading" });
      try {
        const supabase = createClient();
        // First try with the new layout-cache columns. If the running DB
        // hasn't had the migration applied yet, PostgREST returns 400
        // with a "column does not exist" error — fall back to the
        // legacy select so the app still works pre-migration. Once the
        // migration is run everywhere this fallback is dead code, but
        // it costs little and prevents a broken cold load in the window
        // between deploying the client and running the SQL.
        const withLayout = await supabase
          .from(TABLE)
          .select("data, layout, layout_tree_hash")
          .eq("id", ROW_ID)
          .maybeSingle();
        let row:
          | { data: unknown; layout?: unknown; layout_tree_hash?: unknown }
          | null;
        if (withLayout.error) {
          const treeOnly = await supabase
            .from(TABLE)
            .select("data")
            .eq("id", ROW_ID)
            .maybeSingle();
          if (treeOnly.error) throw treeOnly.error;
          row = treeOnly.data;
        } else {
          row = withLayout.data;
        }

        let loadedTree: Tree;
        let needsPersist = false;
        let loadedLayout: Layout | null = null;
        let loadedLayoutHash: string | null = null;
        if (row) {
          const result = normalizeTree(row.data);
          loadedTree = result.tree;
          needsPersist = result.changed;
          // The layout columns are nullable (and absent entirely
          // pre-migration). Missing layout just means "no fancy solve
          // yet" — the hook falls through to the fast pass and the
          // user can click Optimize.
          if (row.layout && typeof row.layout_tree_hash === "string") {
            loadedLayout = row.layout as Layout;
            loadedLayoutHash = row.layout_tree_hash;
          }
        } else {
          // No row in Supabase yet — seed one so subsequent loads find
          // it. The data is canonical in Supabase, so this initial
          // write is what "creates" the tree for everyone.
          loadedTree = createInitialTree();
          await persistTree(loadedTree, (b) => { set({ saving: b }); });
        }
        if (needsPersist) {
          // Heal the row in-place so future readers don't see the
          // broken shape.
          await persistTree(loadedTree, (b) => { set({ saving: b }); });
        }
        set({
          tree: loadedTree,
          cachedLayout: loadedLayout,
          cachedLayoutHash: loadedLayoutHash,
          status: "ready",
        });
      } catch {
        set({ status: "error" });
      }
    })();
    return hydratePromise;
  },

  setSelected: (id) => { set({ selectedId: id }); },

  setViewRoot: (id) => { set({ viewRootId: id }); },

  resetViewRoot: () => { set({ viewRootId: ROOT_ID }); },

  // Spawn the HiGHS-backed sugiyama solve in a worker for the current tree.
  // On success: re-read the DB row to confirm nobody else's edit invalidated
  // our result mid-solve, then commit the layout. On stale (DB tree drifted
  // while we were solving) we discard the solve silently — the user keeps
  // their fast-pass view and can re-trigger when convenient.
  optimize: () => {
    if (get().optimizing) return;
    const tree = get().tree;
    const solveHash = topologyHash(tree);
    if (get().cachedLayoutHash === solveHash) return;

    terminateActiveWorker();
    const worker = new Worker(
      new URL("./layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    activeWorker = worker;
    const optimizeId = ++activeOptimizeId;

    function fail(error: string): void {
      set({ optimizing: false, optimizeError: error });
    }

    // Anything thrown outside computeLayout's try — e.g. the worker's own
    // chunk failing to load.
    worker.onerror = (e) => {
      if (optimizeId !== activeOptimizeId) return;
      terminateActiveWorker();
      fail(e.message || "The layout worker crashed.");
    };

    worker.onmessage = (e: MessageEvent<LayoutResponse>) => {
      const msg = e.data;
      // The user (or a mid-solve edit) may have moved on. Bail before
      // touching state.
      if (optimizeId !== activeOptimizeId) return;
      if (msg.type === "progress") {
        set({ solveProgress: msg.progress, solveLastUpdateAt: Date.now() });
        return;
      }
      terminateActiveWorker();
      if (msg.type === "error") {
        fail(`Layout solve failed: ${msg.error}`);
        return;
      }
      void (async () => {
        // Conditional upload: re-fetch the row, recompute its tree hash,
        // and only write our layout if the DB tree still matches what we
        // solved against. Otherwise another contributor's edit landed
        // while HiGHS was grinding and our layout would be wrong for the
        // canonical tree — discard it; the user can re-trigger Optimize
        // once their view catches up.
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from(TABLE)
            .select("data")
            .eq("id", ROW_ID)
            .maybeSingle();
          if (error) throw error;
          if (!data) {
            set({ optimizing: false });
            return;
          }
          const dbTree = normalizeTree(data.data).tree;
          if (topologyHash(dbTree) !== solveHash) {
            set({ optimizing: false });
            return;
          }
          const updateResult = await supabase
            .from(TABLE)
            .update({
              layout: msg.layout,
              layout_tree_hash: solveHash,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ROW_ID);
          if (updateResult.error) throw updateResult.error;
          // Final guard: if the local tree drifted between solve start and
          // upload completion (an edit that didn't terminate this callback
          // in time, e.g. because the worker had already posted), committing
          // `cachedLayoutHash = solveHash` would leave the UI showing
          // "In sync" against a stale hash. Skip the local commit; the
          // upload to Supabase is still valid for whoever pulls a tree
          // matching solveHash.
          if (topologyHash(get().tree) !== solveHash) {
            set({ optimizing: false });
            return;
          }
          set({
            cachedLayout: msg.layout,
            cachedLayoutHash: solveHash,
            optimizing: false,
          });
        } catch (err) {
          // Upload failed (Supabase unreachable, RLS rejection, etc.).
          // Leave the canvas in fast-pass mode; the user can retry. We
          // intentionally do NOT commit a local-only cached layout —
          // the canonical data lives in Supabase.
          const message = err instanceof Error ? err.message : String(err);
          fail(`Saving the optimized layout failed: ${message}`);
        }
      })();
    };

    const req: LayoutRequest = { id: optimizeId, tree };
    worker.postMessage(req);
    const now = Date.now();
    set({
      optimizing: true,
      optimizeError: null,
      solveProgress: INITIAL_SOLVE_PROGRESS,
      solveStartedAt: now,
      solveLastUpdateAt: now,
    });
  },

  cancelOptimize: () => {
    if (!get().optimizing) return;
    terminateActiveWorker();
    set({ optimizing: false });
  },

  dismissOptimizeError: () => { set({ optimizeError: null }); },

  addParent: (childId, name, gender) => {
    applyMutation((tree) => logicAddParent(tree, childId, newId(), cleanName(name), gender));
  },

  addChild: (parentId, name, gender, coParentId) => {
    applyMutation((tree) =>
      logicAddChild(tree, parentId, newId(), cleanName(name), gender, coParentId),
    );
  },

  addSpouse: (personId, name, gender, status, bioChildIds) => {
    applyMutation((tree) =>
      logicAddSpouse(
        tree,
        personId,
        newId(),
        cleanName(name),
        gender,
        status,
        bioChildIds,
      ),
    );
  },

  setUnionStatus: (aId, bId, status) => {
    applyMutation((tree) => logicSetUnionStatus(tree, aId, bId, status));
  },

  rename: (id, name) => {
    if (!name.firstName.trim()) return;
    applyMutation((tree) => logicRenamePerson(tree, id, cleanName(name)));
  },

  setGender: (id, gender) => {
    applyMutation((tree) => logicSetGender(tree, id, gender));
  },

  setNotes: (id, notes) => {
    applyMutation((tree) => logicSetNotes(tree, id, notes.trim()));
  },

  remove: (id) => {
    if (id === ROOT_ID) return;
    const { tree, selectedId, viewRootId, optimizing } = get();
    const next = logicDeletePerson(tree, id);
    if (next === tree) return;
    if (optimizing) terminateActiveWorker();
    set({
      tree: next,
      selectedId: selectedId === id ? null : selectedId,
      viewRootId: viewRootId === id ? ROOT_ID : viewRootId,
      ...(optimizing ? { optimizing: false } : {}),
    });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },
  };
});
