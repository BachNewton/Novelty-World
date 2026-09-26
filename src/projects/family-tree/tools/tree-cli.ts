// Read and edit the live family tree from the command line. Run from the
// repo root (it reads the Supabase keys from .env.local):
//
//   npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--write]
//
// `apply` is a dry run unless --write is given. With --write it backs up the
// current row into the gitignored research folder, then saves only if nobody
// else saved since it loaded. The op vocabulary lives in tree-edit.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeTree } from "../logic";
import { fetchTreeRow, saveTreeIfUnchanged, type TreeRow } from "../persistence";
import type { Tree } from "../types";
import { applyOps, describePerson, parseOps, resolveId, searchPersons } from "./tree-edit";

const USAGE = [
  "usage:",
  "  tree-cli.ts find <text>",
  "  tree-cli.ts show <id or id prefix>",
  "  tree-cli.ts apply <changes.json> [--write]",
].join("\n");

const BACKUP_DIR = fileURLToPath(new URL("../research/backups/", import.meta.url));

function connect(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === undefined) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return createClient(url, key);
}

async function load(client: SupabaseClient): Promise<{ row: TreeRow; tree: Tree }> {
  const row = await fetchTreeRow(client);
  if (row === null) throw new Error("There is no family tree row yet");
  return { row, tree: normalizeTree(row.data).tree };
}

async function find(text: string): Promise<void> {
  const { tree } = await load(connect());
  const matches = searchPersons(tree, text);
  console.log(`${matches.length} match${matches.length === 1 ? "" : "es"} for "${text}"\n`);
  for (const person of matches) console.log(`${describePerson(tree, person.id)}\n`);
}

async function show(idOrPrefix: string): Promise<void> {
  const { tree } = await load(connect());
  console.log(describePerson(tree, resolveId(tree, idOrPrefix)));
}

async function apply(changesPath: string, write: boolean): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool; the path is a change file typed by the developer running it, never external input
  const ops = parseOps(JSON.parse(readFileSync(changesPath, "utf8")));
  const client = connect();
  const { row, tree } = await load(client);
  const result = applyOps(tree, ops, () => crypto.randomUUID());

  console.log(`Tree version ${row.version}. ${result.changes.length} change(s):\n`);
  for (const [i, change] of result.changes.entries()) console.log(`${i + 1}. ${change}`);

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to apply.");
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed backup directory next to this script
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}family-tree-v${row.version}-${stamp}.json`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixed backup directory plus a timestamped name built here
  writeFileSync(backupPath, JSON.stringify({ version: row.version, data: row.data }, null, 2));
  console.log(`\nBacked up version ${row.version} to ${backupPath}`);

  const version = await saveTreeIfUnchanged(client, result.tree, row.version);
  if (version === null) {
    throw new Error(
      `The tree changed since version ${row.version} was loaded, so nothing was written. Re-run to apply against the latest.`,
    );
  }
  console.log(`Saved. The tree is now at version ${version}. Reload any open tabs.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // `.at()`, not destructuring: indexing types as `string` and lies when an
  // argument is missing, which is the case these checks exist for.
  const command = args.at(0);
  const arg = args.at(1);
  const rest = args.slice(2);
  if (command === "find" && arg !== undefined && rest.length === 0) return find(arg);
  if (command === "show" && arg !== undefined && rest.length === 0) return show(arg);
  if (command === "apply" && arg !== undefined && rest.every((r) => r === "--write")) {
    return apply(arg, rest.length > 0);
  }
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
