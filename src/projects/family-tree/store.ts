"use client";

import { create } from "zustand";
import { createClient } from "@/shared/lib/supabase/client";
import { getProjectStorage } from "@/shared/lib/storage";
import type { Gender, MarriageStatus, Tree } from "./types";
import {
  ROOT_ID,
  addChild as logicAddChild,
  addParent as logicAddParent,
  addSpouse as logicAddSpouse,
  createInitialTree,
  deletePerson as logicDeletePerson,
  divorceSpouse as logicDivorceSpouse,
  normalizeTree,
  renamePerson as logicRenamePerson,
  setGender as logicSetGender,
} from "./logic";

const TABLE = "family_tree";
const ROW_ID = "global";
const SAVE_DEBOUNCE_MS = 500;
const LOCAL_FALLBACK_KEY = "tree";

const localStore = getProjectStorage("family-tree");

type Status = "idle" | "loading" | "ready" | "error";

interface FamilyTreeState {
  tree: Tree;
  status: Status;
  saving: boolean;
  selectedId: string | null;
  // Local-only viewing perspective. Defaults to ROOT_ID, never persisted to
  // Supabase. Resets to ROOT_ID on reload by design.
  viewRootId: string;
  hydrate: () => Promise<void>;
  setSelected: (id: string | null) => void;
  setViewRoot: (id: string) => void;
  resetViewRoot: () => void;
  addParent: (childId: string, firstName: string, lastName: string, gender: Gender) => void;
  addChild: (
    parentId: string,
    firstName: string,
    lastName: string,
    gender: Gender,
    coParentId?: string | null,
  ) => void;
  addSpouse: (
    personId: string,
    firstName: string,
    lastName: string,
    gender: Gender,
    status?: MarriageStatus,
  ) => void;
  divorce: (aId: string, bId: string) => void;
  rename: (id: string, firstName: string, lastName: string, commonName: string) => void;
  setGender: (id: string, gender: Gender) => void;
  remove: (id: string) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;

async function persist(tree: Tree, setSaving: (b: boolean) => void): Promise<void> {
  setSaving(true);
  try {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from(TABLE)
        .upsert({ id: ROW_ID, data: tree, updated_at: new Date().toISOString() });
    }
    localStore.set(LOCAL_FALLBACK_KEY, tree);
  } finally {
    setSaving(false);
  }
}

function scheduleSave(tree: Tree, setSaving: (b: boolean) => void): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist(tree, setSaving);
  }, SAVE_DEBOUNCE_MS);
}

export const useFamilyTreeStore = create<FamilyTreeState>((set, get) => ({
  tree: createInitialTree(),
  status: "idle",
  saving: false,
  selectedId: null,
  viewRootId: ROOT_ID,

  hydrate: async () => {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ status: "loading" });
      try {
        let loaded: Tree | null = null;
        let needsPersist = false;
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from(TABLE)
            .select("data")
            .eq("id", ROW_ID)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            const result = normalizeTree(data.data);
            loaded = result.tree;
            needsPersist = result.changed;
          }
        }
        if (!loaded) {
          const local = localStore.get<unknown>(LOCAL_FALLBACK_KEY);
          if (local) loaded = normalizeTree(local).tree;
        }
        if (!loaded) {
          loaded = createInitialTree();
          await persist(loaded, (b) => { set({ saving: b }); });
        } else if (needsPersist) {
          // Heal the row in-place so future readers don't see the broken shape.
          await persist(loaded, (b) => { set({ saving: b }); });
        }
        set({ tree: loaded, status: "ready" });
      } catch {
        const local = localStore.get<unknown>(LOCAL_FALLBACK_KEY);
        const fallback = local ? normalizeTree(local).tree : createInitialTree();
        set({ tree: fallback, status: "error" });
      }
    })();
    return hydratePromise;
  },

  setSelected: (id) => { set({ selectedId: id }); },

  setViewRoot: (id) => { set({ viewRootId: id }); },

  resetViewRoot: () => { set({ viewRootId: ROOT_ID }); },

  addParent: (childId, firstName, lastName, gender) => {
    const { tree } = get();
    const f = firstName.trim() || "Unnamed";
    const l = lastName.trim();
    const next = logicAddParent(tree, childId, newId(), f, l, gender);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  addChild: (parentId, firstName, lastName, gender, coParentId) => {
    const { tree } = get();
    const f = firstName.trim() || "Unnamed";
    const l = lastName.trim();
    const next = logicAddChild(tree, parentId, newId(), f, l, gender, coParentId);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  addSpouse: (personId, firstName, lastName, gender, status) => {
    const { tree } = get();
    const f = firstName.trim() || "Unnamed";
    const l = lastName.trim();
    const next = logicAddSpouse(tree, personId, newId(), f, l, gender, status);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  divorce: (aId, bId) => {
    const { tree } = get();
    const next = logicDivorceSpouse(tree, aId, bId);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  rename: (id, firstName, lastName, commonName) => {
    const { tree } = get();
    const f = firstName.trim();
    if (!f) return;
    const l = lastName.trim();
    const c = commonName.trim();
    const next = logicRenamePerson(tree, id, f, l, c);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  setGender: (id, gender) => {
    const { tree } = get();
    const next = logicSetGender(tree, id, gender);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  remove: (id) => {
    const { tree, selectedId, viewRootId } = get();
    if (id === ROOT_ID) return;
    const next = logicDeletePerson(tree, id);
    if (next === tree) return;
    set({
      tree: next,
      selectedId: selectedId === id ? null : selectedId,
      viewRootId: viewRootId === id ? ROOT_ID : viewRootId,
    });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },
}));
