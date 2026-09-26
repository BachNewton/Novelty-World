// Read and edit the live family tree from the command line. It is the tree's
// only writer. Run from the repo root (it reads the Supabase keys, including
// the service-role key, from .env.local):
//
//   npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts gaps
//   npx tsx src/projects/family-tree/tools/tree-cli.ts superseded
//   npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--write]
//   npx tsx src/projects/family-tree/tools/tree-cli.ts relayout [--write]
//
// The row always holds the tree and an exact layout for it. When a change
// alters the tree's topology, `apply` solves the new tree's layout before
// writing and saves both in one update; otherwise the stored layout stays.
// `relayout` re-solves the current tree's layout, for layout-code changes.
// Both are dry runs unless --write is given; a dry run still solves, so it
// shows what the write would do. With --write they back up the current row
// into the gitignored research folder, then save only if nobody else saved
// since they loaded. The op vocabulary lives in tree-edit.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { computeLayout } from "../layout/compute-layout";
import { normalizeTree, topologyHash } from "../logic";
import type { TreeRow } from "../persistence";
import type { Layout, Tree } from "../types";
import {
  applyOps,
  describeGaps,
  describePerson,
  describeSuperseded,
  parseOps,
  resolveId,
  searchPersons,
} from "./tree-edit";
import { loadTreeRow, saveLayoutIfUnchanged, saveTreeIfUnchanged } from "./tree-db";

const USAGE = [
  "usage:",
  "  tree-cli.ts find <text>",
  "  tree-cli.ts show <id or id prefix>",
  "  tree-cli.ts gaps",
  "  tree-cli.ts superseded",
  "  tree-cli.ts apply <changes.json> [--write]",
  "  tree-cli.ts relayout [--write]",
].join("\n");

const BACKUP_DIR = fileURLToPath(new URL("../research/backups/", import.meta.url));

async function load(): Promise<{ row: TreeRow; tree: Tree }> {
  const row = await loadTreeRow();
  if (row === null) throw new Error("There is no family tree row yet");
  return { row, tree: normalizeTree(row.data).tree };
}

async function find(text: string): Promise<void> {
  const { tree } = await load();
  const matches = searchPersons(tree, text);
  console.log(`${matches.length} match${matches.length === 1 ? "" : "es"} for "${text}"\n`);
  for (const person of matches) console.log(`${describePerson(tree, person.id)}\n`);
}

async function show(idOrPrefix: string): Promise<void> {
  const { tree } = await load();
  console.log(describePerson(tree, resolveId(tree, idOrPrefix)));
}

async function gaps(): Promise<void> {
  const { tree } = await load();
  console.log(describeGaps(tree));
}

async function superseded(): Promise<void> {
  const { tree } = await load();
  console.log(describeSuperseded(tree));
}

// The exact solve, with the solver's progress streamed to stderr.
function solveLayout(tree: Tree): Layout {
  console.log("\nSolving the layout...");
  const t0 = performance.now();
  const layout = computeLayout(tree, { progress: true });
  console.log(`Solved the layout in ${((performance.now() - t0) / 1000).toFixed(1)}s.`);
  return layout;
}

function backUp(row: TreeRow): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed backup directory next to this script
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}family-tree-v${row.version}-${stamp}.json`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixed backup directory plus a timestamped name built here
  writeFileSync(backupPath, JSON.stringify(row, null, 2));
  console.log(`\nBacked up version ${row.version} to ${backupPath}`);
}

function staleWrite(version: number): Error {
  return new Error(
    `The tree changed since version ${version} was loaded, so nothing was written. Re-run to apply against the latest.`,
  );
}

async function apply(changesPath: string, write: boolean): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool; the path is a change file typed by the developer running it, never external input
  const ops = parseOps(JSON.parse(readFileSync(changesPath, "utf8")));
  const { row, tree } = await load();
  const result = applyOps(tree, ops, () => crypto.randomUUID());

  console.log(`Tree version ${row.version}. ${result.changes.length} change(s):\n`);
  for (const [i, change] of result.changes.entries()) console.log(`${i + 1}. ${change}`);

  const needsLayout = topologyHash(result.tree) !== row.layoutTreeHash;
  console.log(
    needsLayout
      ? "\nThe stored layout doesn't fit the new tree, so the write includes a new exact layout."
      : "\nThe tree's topology is unchanged, so the stored layout stays.",
  );
  const layout = needsLayout ? solveLayout(result.tree) : undefined;

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to apply.");
    return;
  }

  backUp(row);
  const version = await saveTreeIfUnchanged(result.tree, row.version, layout);
  if (version === null) throw staleWrite(row.version);
  const what = layout === undefined ? "the tree" : "the tree and its layout";
  console.log(`Saved ${what}. The tree is now at version ${version}.`);
}

async function relayout(write: boolean): Promise<void> {
  const { row, tree } = await load();
  const fits = row.layout !== null && topologyHash(tree) === row.layoutTreeHash;
  const stored =
    row.layout === null ? "is missing" : fits ? "fits the tree" : "was solved for a different tree";
  console.log(`Tree version ${row.version}. The stored layout ${stored}.`);

  const layout = solveLayout(tree);
  if (fits) {
    // Key order says nothing: jsonb reorders object keys when it stores them.
    const same = isDeepStrictEqual(layout, row.layout);
    console.log(`The new layout ${same ? "is identical to" : "differs from"} the stored one.`);
  }

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to save the layout.");
    return;
  }

  backUp(row);
  if (!(await saveLayoutIfUnchanged(tree, layout, row.version))) throw staleWrite(row.version);
  console.log(`Saved the layout for tree version ${row.version}.`);
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
  if (command === "gaps" && args.length === 1) return gaps();
  if (command === "superseded" && args.length === 1) return superseded();
  if (command === "apply" && arg !== undefined && rest.every((r) => r === "--write")) {
    return apply(arg, rest.length > 0);
  }
  if (command === "relayout" && args.slice(1).every((r) => r === "--write")) {
    return relayout(args.length > 1);
  }
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
