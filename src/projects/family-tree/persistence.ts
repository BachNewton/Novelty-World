// The single family-tree row: its shape and how to read it. Anyone can read
// it with the anon key; only the CLI writes it, with the service-role key
// (tools/tree-db.ts), because RLS gives the anon key read access only.
//
// The row's `version` counts tree writes. A tree write only lands if the row
// is still at the version the writer loaded, and it bumps the version by one;
// a database trigger (supabase/family-tree.sql) rejects any tree write that
// doesn't.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Layout } from "./types";

export const TABLE = "family_tree";
export const ROW_ID = "global";

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
