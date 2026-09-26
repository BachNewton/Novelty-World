// The CLI's connection to the family-tree row. The CLI is the tree's only
// writer, so it connects with the service-role key: RLS lets the anon key
// read the row and nothing else, and an update RLS refuses matches no rows
// instead of failing, which would read as a version conflict. Keeping the
// client private to this module means no write can go out on the wrong key.

import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { ROW_ID, TABLE, fetchTreeRow, type TreeRow } from "../persistence";
import type { Tree } from "../types";

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

// Writes `tree` only if the row is still at `expectedVersion`. Returns the new
// version, or null when someone else saved in the meantime.
export async function saveTreeIfUnchanged(
  tree: Tree,
  expectedVersion: number,
): Promise<number | null> {
  const { data, error } = await adminClient()
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
