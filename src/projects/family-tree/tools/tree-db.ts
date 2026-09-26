// The CLI's connection to the family-tree row. The CLI is the tree's only
// writer, so it connects with the service-role key: RLS lets the anon key
// read the row and nothing else, and an update RLS refuses matches no rows
// instead of failing, which would read as a version conflict. Keeping the
// client private to this module means no write can go out on the wrong key.

import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { ROW_ID, TABLE, fetchTreeRow, type TreeRow } from "../persistence";
import { topologyHash } from "../logic";
import type { Layout, Tree } from "../types";

let admin: SupabaseClient | null = null;

// Run from the repo root, which holds the keys in .env.local.
function adminClient(): SupabaseClient {
  if (admin === null) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY === undefined) process.loadEnvFile(".env.local");
    admin = createAdminClient();
  }
  return admin;
}

export function loadTreeRow(): Promise<TreeRow | null> {
  return fetchTreeRow(adminClient());
}

// Writes `tree` only if the row is still at `expectedVersion`, bumping the
// version. `layout`, when given, is the exact layout solved for `tree` and
// lands in the same update; without it the stored layout stays, which is
// only right when `tree` has the topology it was solved for. Returns the new
// version, or null when someone else saved in the meantime.
export async function saveTreeIfUnchanged(
  tree: Tree,
  expectedVersion: number,
  layout?: Layout,
): Promise<number | null> {
  const { data, error } = await adminClient()
    .from(TABLE)
    .update({
      data: tree,
      version: expectedVersion + 1,
      ...(layout === undefined ? {} : { layout, layout_tree_hash: topologyHash(tree) }),
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

// Writes `layout`, solved for `tree`, only if the row is still at
// `expectedVersion`, i.e. still holds `tree`. The version counts tree writes,
// so it doesn't move. Returns false when someone saved in the meantime.
export async function saveLayoutIfUnchanged(
  tree: Tree,
  layout: Layout,
  expectedVersion: number,
): Promise<boolean> {
  const { data, error } = await adminClient()
    .from(TABLE)
    .update({ layout, layout_tree_hash: topologyHash(tree) })
    .eq("id", ROW_ID)
    .eq("version", expectedVersion)
    .select("version")
    .returns<{ version: number }[]>();
  if (error) throw new Error(`Saving the family tree layout failed: ${error.message}`);
  return data.length > 0;
}
