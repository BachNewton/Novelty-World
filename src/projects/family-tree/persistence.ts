// Reads and writes of the single family-tree row, shared by the app's store
// and the tree-editing CLI so both honor the same concurrency rule.
//
// The row's `version` counts tree writes. A tree write only lands if the row
// is still at the version the writer loaded, and it bumps the version by one;
// a database trigger (supabase/family-tree.sql) rejects any tree write that
// doesn't. Layout-cache writes leave `data` and `version` alone, so they never
// look like a tree change to anyone.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Layout, Tree } from "./types";

const TABLE = "family_tree";
const ROW_ID = "global";

export interface TreeRow {
  // Raw stored tree; run it through `normalizeTree` before use.
  data: unknown;
  version: number;
  layout: Layout | null;
  layoutTreeHash: string | null;
}

interface RawRow {
  data: unknown;
  version: number;
  layout: Layout | null;
  layout_tree_hash: string | null;
}

export async function fetchTreeRow(client: SupabaseClient): Promise<TreeRow | null> {
  const { data, error } = await client
    .from(TABLE)
    .select("data, version, layout, layout_tree_hash")
    .eq("id", ROW_ID)
    .maybeSingle<RawRow>();
  if (error) throw new Error(`Loading the family tree failed: ${error.message}`);
  if (data === null) return null;
  return {
    data: data.data,
    version: data.version,
    layout: data.layout,
    layoutTreeHash: data.layout_tree_hash,
  };
}

// Creates the row for the very first tree, at version 0. Fails if a row
// already exists (someone else seeded it first).
export async function insertInitialTree(client: SupabaseClient, tree: Tree): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .insert({ id: ROW_ID, data: tree, version: 0 });
  if (error) throw new Error(`Creating the family tree failed: ${error.message}`);
}

// Writes `tree` only if the row is still at `expectedVersion`. Returns the new
// version, or null when someone else saved in the meantime.
export async function saveTreeIfUnchanged(
  client: SupabaseClient,
  tree: Tree,
  expectedVersion: number,
): Promise<number | null> {
  const { data, error } = await client
    .from(TABLE)
    .update({
      data: tree,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ROW_ID)
    .eq("version", expectedVersion)
    .select("version")
    .returns<{ version: number }[]>();
  if (error) throw new Error(`Saving the family tree failed: ${error.message}`);
  if (data.length === 0) return null;
  return data[0].version;
}

// Caches `layout` only if the tree is still at `treeVersion`, so a layout
// solved for an older tree never lands beside a newer one. Returns whether it
// was written.
export async function saveLayoutIfUnchanged(
  client: SupabaseClient,
  layout: Layout,
  layoutTreeHash: string,
  treeVersion: number,
): Promise<boolean> {
  const { data, error } = await client
    .from(TABLE)
    .update({
      layout,
      layout_tree_hash: layoutTreeHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ROW_ID)
    .eq("version", treeVersion)
    .select("version")
    .returns<{ version: number }[]>();
  if (error) throw new Error(`Saving the optimized layout failed: ${error.message}`);
  return data.length > 0;
}
