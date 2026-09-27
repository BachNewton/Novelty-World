// The CLI's connection to the family-tree data. The CLI is the tree's only
// writer, so it connects with the service-role key: RLS lets the anon key
// read the public row and nothing else, and an update RLS refuses matches no
// rows instead of failing, which would read as a version conflict. Keeping the
// client private to this module means no write can go out on the wrong key.
//
// Every tree write goes through the database's `family_tree_commit`
// (supabase/family-tree.sql), which saves the private research document, its
// public projection, the change record and a history snapshot in one
// transaction. The one other write is a layout-only update of the public row.

import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { ROW_ID, TABLE, fetchTreeRow, type TreeRow } from "../persistence";
import { topologyHash } from "../logic";
import type { Layout, ResearchDocument, Tree } from "../types";
import type { Probe, ProbeOutcome, VerifyInput } from "./tree-verify";

const PRIVATE_TABLE = "family_tree_private";
const HISTORY_TABLE = "family_tree_history";
const CHANGE_TABLE = "family_tree_change";
const COMMIT_FUNCTION = "family_tree_commit";

// Postgres error codes the commit function and the privacy locks raise.
const SERIALIZATION_FAILURE = "40001";
const INSUFFICIENT_PRIVILEGE = "42501";

let admin: SupabaseClient | null = null;

// Run from the repo root, which holds the keys in .env.local.
function loadEnv(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY === undefined) process.loadEnvFile(".env.local");
}

function adminClient(): SupabaseClient {
  if (admin === null) {
    loadEnv();
    admin = createAdminClient();
  }
  return admin;
}

// The public key the viewer uses, for probing what it can reach.
function anonClient(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new Error("Probing needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function loadTreeRow(): Promise<TreeRow | null> {
  return fetchTreeRow(adminClient());
}

export interface PrivateRow {
  // Raw stored research document; run it through `normalizeTree` before use.
  data: unknown;
  version: number;
}

export async function loadPrivateRow(): Promise<PrivateRow | null> {
  const { data, error } = await adminClient()
    .from(PRIVATE_TABLE)
    .select("data, version")
    .eq("id", ROW_ID)
    .maybeSingle<PrivateRow>();
  if (error) throw new Error(`Loading the research document failed: ${error.message}`);
  return data;
}

export interface Commit {
  expectedVersion: number;
  document: ResearchDocument;
  projection: Tree;
  // The exact layout solved for `projection`, when its topology changed;
  // without it the stored layout stays.
  layout?: Layout;
  round: string;
  // The change file as submitted.
  ops: unknown;
  // The change list printed at apply.
  changes: string[];
  note: string;
}

// Saves `document` and its projection as the next version, only if both rows
// are still at `expectedVersion`, and records the change and a history
// snapshot with it. Returns the new version, or null when someone else saved
// in the meantime (then nothing was written).
export async function commitTree(commit: Commit): Promise<number | null> {
  const { data, error } = await adminClient().rpc(COMMIT_FUNCTION, {
    p_expected_version: commit.expectedVersion,
    p_document: commit.document,
    p_projection: commit.projection,
    p_layout: commit.layout ?? null,
    p_layout_tree_hash: commit.layout === undefined ? null : topologyHash(commit.projection),
    p_round: commit.round,
    p_ops: commit.ops,
    p_changes: commit.changes,
    p_note: commit.note,
  });
  if (error?.code === SERIALIZATION_FAILURE) return null;
  if (error) throw new Error(`Saving the family tree failed: ${error.message}`);
  if (typeof data !== "number") throw new Error(`The commit returned ${JSON.stringify(data)}, not a version`);
  return data;
}

// Writes `layout`, solved for `tree`, only if the public row is still at
// `expectedVersion`, i.e. still holds `tree`. The version counts tree writes,
// so it doesn't move, and the research document is untouched. Returns false
// when someone saved in the meantime.
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

export interface HistoryEntry {
  version: number;
  savedAt: string;
  // False once the snapshot was thinned away; the row and its change stay.
  hasDocument: boolean;
  change: { round: string; status: string; changes: string[] | null; note: string } | null;
}

interface RawHistoryEntry {
  version: number;
  saved_at: string;
  has_document: boolean;
  change: HistoryEntry["change"];
}

// The latest `limit` versions, newest first.
export async function loadHistory(limit: number): Promise<HistoryEntry[]> {
  const { data, error } = await adminClient()
    .from(HISTORY_TABLE)
    .select(`version, saved_at, has_document, change:${CHANGE_TABLE}(round, status, changes, note)`)
    .order("version", { ascending: false })
    .limit(limit)
    .returns<RawHistoryEntry[]>();
  if (error) throw new Error(`Loading the history failed: ${error.message}`);
  return data.map((row) => ({
    version: row.version,
    savedAt: row.saved_at,
    hasDocument: row.has_document,
    change: row.change,
  }));
}

// The research document as saved at `version`: null when there is no such
// version, `data: null` when its snapshot was thinned away.
export async function loadSnapshot(version: number): Promise<{ version: number; data: unknown } | null> {
  const { data, error } = await adminClient()
    .from(HISTORY_TABLE)
    .select("version, data")
    .eq("version", version)
    .maybeSingle<{ version: number; data: unknown }>();
  if (error) throw new Error(`Loading version ${version} from the history failed: ${error.message}`);
  return data;
}

function outcomeOf(error: { code: string; message: string } | null, rows: number): ProbeOutcome {
  if (error?.code === INSUFFICIENT_PRIVILEGE) return { kind: "refused" };
  if (error) return { kind: "error", message: `${error.code}: ${error.message}` };
  return rows === 0 ? { kind: "empty" } : { kind: "exposed", detail: `${rows} row(s) came back` };
}

// Tries, with the anon key, to read each private table and to call the
// commit function. The call carries a version no row has, so even with the
// lock broken nothing could land.
async function probeAsAnon(): Promise<Probe[]> {
  const anon = anonClient();
  const probes = [PRIVATE_TABLE, HISTORY_TABLE, CHANGE_TABLE].map(async (table): Promise<Probe> => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    return { target: `table ${table}`, outcome: outcomeOf(error, data?.length ?? 0) };
  });
  const call = (async (): Promise<Probe> => {
    const { error } = await anon.rpc(COMMIT_FUNCTION, {
      p_expected_version: -1,
      p_document: {},
      p_projection: {},
      p_layout: null,
      p_layout_tree_hash: null,
      p_round: "verify probe",
      p_ops: [],
      p_changes: [],
      p_note: "",
    });
    const outcome: ProbeOutcome =
      error === null ? { kind: "exposed", detail: "the call went through" } : outcomeOf(error, 0);
    return { target: `function ${COMMIT_FUNCTION}`, outcome };
  })();
  return Promise.all([...probes, call]);
}

export async function loadVerifyInput(): Promise<VerifyInput> {
  const [probes, privateRow, publicRow] = await Promise.all([
    probeAsAnon(),
    loadPrivateRow(),
    loadTreeRow(),
  ]);
  const snapshot = privateRow === null ? null : await loadSnapshot(privateRow.version);
  return { probes, privateRow, publicRow, snapshot };
}

// ---------- one-off: importing the old local backups and change files ----------
// Used only by tools/import-local-history.ts, and deleted with it once the
// import has run.

export interface ImportedChange {
  round: string;
  ops: unknown;
  checkedVersion: number | null;
  changes: string[] | null;
  appliedVersion: number | null;
  appliedAt: string | null;
  note: string;
}

export async function loadHistoryIndex(): Promise<{ version: number; changeId: string | null }[]> {
  const { data, error } = await adminClient()
    .from(HISTORY_TABLE)
    .select("version, change_id")
    .order("version")
    .returns<{ version: number; change_id: string | null }[]>();
  if (error) throw new Error(`Loading the history index failed: ${error.message}`);
  return data.map((row) => ({ version: row.version, changeId: row.change_id }));
}

export async function loadImportedChanges(): Promise<{ id: string; round: string; ops: unknown }[]> {
  const { data, error } = await adminClient()
    .from(CHANGE_TABLE)
    .select("id, round, ops")
    .eq("status", "imported")
    .returns<{ id: string; round: string; ops: unknown }[]>();
  if (error) throw new Error(`Loading the imported changes failed: ${error.message}`);
  return data;
}

export async function insertImportedChange(change: ImportedChange): Promise<string> {
  const { data, error } = await adminClient()
    .from(CHANGE_TABLE)
    .insert({
      round: change.round,
      status: "imported",
      ops: change.ops,
      checked_version: change.checkedVersion,
      changes: change.changes,
      applied_version: change.appliedVersion,
      applied_at: change.appliedAt,
      note: change.note,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`Importing change ${change.round} failed: ${error.message}`);
  return data.id;
}

export async function insertSnapshot(snapshot: {
  version: number;
  savedAt: string;
  changeId: string | null;
  data: unknown;
}): Promise<void> {
  const { error } = await adminClient().from(HISTORY_TABLE).insert({
    version: snapshot.version,
    saved_at: snapshot.savedAt,
    change_id: snapshot.changeId,
    data: snapshot.data,
  });
  if (error) throw new Error(`Importing the snapshot of version ${snapshot.version} failed: ${error.message}`);
}

// Links a history row that has no change record yet to `changeId`.
export async function linkSnapshotChange(version: number, changeId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from(HISTORY_TABLE)
    .update({ change_id: changeId })
    .eq("version", version)
    .is("change_id", null)
    .select("version")
    .returns<{ version: number }[]>();
  if (error) throw new Error(`Linking version ${version} to its change failed: ${error.message}`);
  if (data.length === 0) throw new Error(`Version ${version} has no history row without a change`);
}
