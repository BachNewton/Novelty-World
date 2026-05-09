"use client";

import { create } from "zustand";
import { createClient } from "@/shared/lib/supabase/client";
import { getProjectStorage } from "@/shared/lib/storage";
import type { Tree } from "./types";
import {
  ROOT_ID,
  addChild as logicAddChild,
  addParent as logicAddParent,
  addSpouse as logicAddSpouse,
  createInitialTree,
  deletePerson as logicDeletePerson,
  renamePerson as logicRenamePerson,
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
  hydrate: () => Promise<void>;
  setSelected: (id: string | null) => void;
  addParent: (childId: string, name: string) => void;
  addChild: (parentId: string, name: string) => void;
  addSpouse: (personId: string, name: string) => void;
  rename: (id: string, name: string) => void;
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

  hydrate: async () => {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ status: "loading" });
      try {
        let loaded: Tree | null = null;
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from(TABLE)
            .select("data")
            .eq("id", ROW_ID)
            .maybeSingle();
          if (error) throw error;
          if (data) loaded = data.data as Tree;
        }
        if (!loaded) {
          loaded = localStore.get<Tree>(LOCAL_FALLBACK_KEY);
        }
        if (!loaded) {
          loaded = createInitialTree();
          await persist(loaded, (b) => { set({ saving: b }); });
        }
        set({ tree: loaded, status: "ready" });
      } catch {
        const fallback = localStore.get<Tree>(LOCAL_FALLBACK_KEY) ?? createInitialTree();
        set({ tree: fallback, status: "error" });
      }
    })();
    return hydratePromise;
  },

  setSelected: (id) => { set({ selectedId: id }); },

  addParent: (childId, name) => {
    const { tree } = get();
    const next = logicAddParent(tree, childId, newId(), name.trim() || "Unnamed");
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  addChild: (parentId, name) => {
    const { tree } = get();
    const next = logicAddChild(tree, parentId, newId(), name.trim() || "Unnamed");
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  addSpouse: (personId, name) => {
    const { tree } = get();
    const next = logicAddSpouse(tree, personId, newId(), name.trim() || "Unnamed");
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  rename: (id, name) => {
    const { tree } = get();
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = logicRenamePerson(tree, id, trimmed);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },

  remove: (id) => {
    const { tree, selectedId } = get();
    if (id === ROOT_ID) return;
    const next = logicDeletePerson(tree, id);
    if (next === tree) return;
    set({
      tree: next,
      selectedId: selectedId === id ? null : selectedId,
    });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },
}));
