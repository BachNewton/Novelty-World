"use client";

import { create } from "zustand";
import { createClient } from "@/shared/lib/supabase/client";
import { getProjectStorage } from "@/shared/lib/storage";
import type { Gender, MarriageStatus, NameFields, Tree } from "./types";
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
    status?: MarriageStatus,
    bioChildIds?: readonly string[],
  ) => void;
  divorce: (aId: string, bId: string) => void;
  rename: (id: string, name: NameFields) => void;
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

// Normalize raw form text into the trimmed shape the logic layer expects.
// Empty firstName is treated as "Unnamed" because every Person must have a
// non-empty first name; the other fields are allowed to be empty strings.
function cleanName(name: NameFields): NameFields {
  return {
    firstName: name.firstName.trim() || "Unnamed",
    lastName: name.lastName.trim(),
    commonName: name.commonName.trim(),
  };
}

export const useFamilyTreeStore = create<FamilyTreeState>((set, get) => {
  // Apply a logic mutation: if it produced a new tree (i.e. wasn't a no-op),
  // commit it to state and schedule a save. Collapses the trim+dispatch
  // boilerplate that every mutator was repeating.
  function applyMutation(mutate: (tree: Tree) => Tree): void {
    const { tree } = get();
    const next = mutate(tree);
    if (next === tree) return;
    set({ tree: next });
    scheduleSave(next, (b) => { set({ saving: b }); });
  }

  return {
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

  divorce: (aId, bId) => {
    applyMutation((tree) => logicDivorceSpouse(tree, aId, bId));
  },

  rename: (id, name) => {
    if (!name.firstName.trim()) return;
    applyMutation((tree) => logicRenamePerson(tree, id, cleanName(name)));
  },

  setGender: (id, gender) => {
    applyMutation((tree) => logicSetGender(tree, id, gender));
  },

  remove: (id) => {
    if (id === ROOT_ID) return;
    const { tree, selectedId, viewRootId } = get();
    const next = logicDeletePerson(tree, id);
    if (next === tree) return;
    set({
      tree: next,
      selectedId: selectedId === id ? null : selectedId,
      viewRootId: viewRootId === id ? ROOT_ID : viewRootId,
    });
    scheduleSave(next, (b) => { set({ saving: b }); });
  },
  };
});
