// Read and edit the live family tree from the command line. It is the tree's
// only writer. Run from the repo root (it reads the Supabase keys, including
// the service-role key, from .env.local):
//
//   npx tsx src/projects/family-tree/tools/tree-cli.ts find <text>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts show <id or prefix>
//   npx tsx src/projects/family-tree/tools/tree-cli.ts gaps
//   npx tsx src/projects/family-tree/tools/tree-cli.ts superseded
//   npx tsx src/projects/family-tree/tools/tree-cli.ts undecided
//   npx tsx src/projects/family-tree/tools/tree-cli.ts peoples
//   npx tsx src/projects/family-tree/tools/tree-cli.ts needed-art
//   npx tsx src/projects/family-tree/tools/tree-cli.ts history [count]
//   npx tsx src/projects/family-tree/tools/tree-cli.ts verify
//   npx tsx src/projects/family-tree/tools/tree-cli.ts apply <changes.json> [--round <label>] [--write]
//   npx tsx src/projects/family-tree/tools/tree-cli.ts restore <version> [--write]
//   npx tsx src/projects/family-tree/tools/tree-cli.ts relayout [--write]
//
// The private research document is the source of truth; the public row the
// viewer reads holds its projection and an exact layout for it. `apply`
// commits a change file as the next version, through the database's one
// commit function, which also records the change file and a snapshot of the
// document in the history. When a change alters the tree's topology, the
// layout is solved first and lands in the same commit. `restore` commits an
// earlier version's document again as a new version. `relayout` re-solves
// the current layout, for layout-code changes. Writes are dry runs unless
// --write is given; a dry run still solves, so it shows what the write would
// do. Every write runs `verify` afterwards. The op vocabulary lives in
// tree-edit.ts.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { computeLayout } from "../layout/compute-layout";
import { normalizeTree, projectTree, topologyHash, treeProblems } from "../logic";
import type { TreeRow } from "../persistence";
import type { Layout, ResearchDocument, Tree } from "../types";
import {
  applyOps,
  describeGaps,
  describeNeededArt,
  describePeoples,
  describePerson,
  describeSuperseded,
  describeUndecided,
  parseOps,
  resolveId,
  searchPersons,
} from "./tree-edit";
import {
  commitTree,
  loadHistory,
  loadPrivateRow,
  loadSnapshot,
  loadTreeRow,
  loadVerifyInput,
  saveLayoutIfUnchanged,
  type Commit,
} from "./tree-db";
import { verifyProblems } from "./tree-verify";

const USAGE = [
  "usage:",
  "  tree-cli.ts find <text>",
  "  tree-cli.ts show <id or id prefix>",
  "  tree-cli.ts gaps",
  "  tree-cli.ts superseded",
  "  tree-cli.ts undecided",
  "  tree-cli.ts peoples",
  "  tree-cli.ts needed-art",
  "  tree-cli.ts history [count]",
  "  tree-cli.ts verify",
  "  tree-cli.ts apply <changes.json> [--round <label>] [--write]",
  "  tree-cli.ts restore <version> [--write]",
  "  tree-cli.ts relayout [--write]",
].join("\n");

const DEFAULT_HISTORY_COUNT = 20;

interface Loaded {
  version: number;
  document: ResearchDocument;
  publicRow: TreeRow;
}

async function load(): Promise<Loaded> {
  const [privateRow, publicRow] = await Promise.all([loadPrivateRow(), loadTreeRow()]);
  if (privateRow === null) throw new Error("There is no research document row yet");
  if (publicRow === null) throw new Error("There is no public family tree row yet");
  if (privateRow.version !== publicRow.version) {
    throw new Error(
      `The research document is at version ${privateRow.version} but the public row is at ${publicRow.version}: something wrote one without the other. Run verify.`,
    );
  }
  return { version: privateRow.version, document: normalizeTree(privateRow.data).tree, publicRow };
}

async function find(text: string): Promise<void> {
  const { document } = await load();
  const matches = searchPersons(document, text);
  console.log(`${matches.length} match${matches.length === 1 ? "" : "es"} for "${text}"\n`);
  for (const person of matches) console.log(`${describePerson(document, person.id)}\n`);
}

async function show(idOrPrefix: string): Promise<void> {
  const { document } = await load();
  console.log(describePerson(document, resolveId(document, idOrPrefix)));
}

async function gaps(): Promise<void> {
  const { document } = await load();
  console.log(describeGaps(document));
}

async function neededArt(): Promise<void> {
  const { document } = await load();
  console.log(describeNeededArt(document));
}

async function superseded(): Promise<void> {
  const { document } = await load();
  console.log(describeSuperseded(document));
}

async function undecided(): Promise<void> {
  const { document } = await load();
  console.log(describeUndecided(document));
}

function timestamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

async function history(count: number): Promise<void> {
  const entries = await loadHistory(count);
  for (const entry of entries) {
    const kept = entry.hasDocument ? "" : " (snapshot thinned: not restorable)";
    const round = entry.change === null ? "no change record" : `${entry.change.round} (${entry.change.status})`;
    console.log(`v${entry.version}  ${timestamp(entry.savedAt)}  ${round}${kept}`);
    if (entry.change?.note) console.log(`    ${entry.change.note}`);
    for (const [i, change] of (entry.change?.changes ?? []).entries()) console.log(`    ${i + 1}. ${change}`);
  }
}

async function verify(): Promise<void> {
  const input = await loadVerifyInput();
  console.log("The anon key tried each private target:");
  for (const { target, outcome } of input.probes) console.log(`  ${target}: ${outcome.kind}`);
  const problems = verifyProblems(input);
  if (problems.length > 0) throw new Error(`verify failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  console.log(
    `verify passed: nothing private reached the anon key, and the public row is the projection of the research document at version ${input.privateRow?.version}, with a layout solved for it and a snapshot in the history.`,
  );
}

// Every write ends here, so a privacy or consistency regression surfaces at
// once rather than at the next research round.
async function verifyAfterWrite(): Promise<void> {
  console.log("");
  try {
    await verify();
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(`The write landed, but ${why}`, { cause: err });
  }
}

// The exact solve, with the solver's progress streamed to stderr.
function solveLayout(tree: Tree): Layout {
  console.log("\nSolving the layout...");
  const t0 = performance.now();
  const layout = computeLayout(tree, { progress: true });
  console.log(`Solved the layout in ${((performance.now() - t0) / 1000).toFixed(1)}s.`);
  return layout;
}

function staleWrite(version: number): Error {
  return new Error(
    `The tree changed since version ${version} was loaded, so nothing was written. Re-run to apply against the latest.`,
  );
}

async function commit(what: Omit<Commit, "projection">): Promise<void> {
  const version = await commitTree({ ...what, projection: projectTree(what.document) });
  if (version === null) throw staleWrite(what.expectedVersion);
  const saved = what.layout === undefined ? "the tree" : "the tree and its layout";
  console.log(`\nSaved ${saved}. The tree is now at version ${version}.`);
  await verifyAfterWrite();
}

async function apply(changesPath: string, round: string, write: boolean): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool; the path is a change file typed by the developer running it, never external input
  const submitted: unknown = JSON.parse(readFileSync(changesPath, "utf8"));
  const ops = parseOps(submitted);
  const { version, document, publicRow } = await load();
  const result = applyOps(document, ops, () => crypto.randomUUID());

  console.log(`Tree version ${version}, round "${round}". ${result.changes.length} change(s):\n`);
  for (const [i, change] of result.changes.entries()) console.log(`${i + 1}. ${change}`);

  const needsLayout = topologyHash(projectTree(result.tree)) !== publicRow.layoutTreeHash;
  console.log(
    needsLayout
      ? "\nThe stored layout doesn't fit the new tree, so the write includes a new exact layout."
      : "\nThe tree's topology is unchanged, so the stored layout stays.",
  );
  const layout = needsLayout ? solveLayout(projectTree(result.tree)) : undefined;

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to apply.");
    return;
  }
  await commit({
    expectedVersion: version,
    document: result.tree,
    layout,
    round,
    ops: submitted,
    changes: result.changes,
    note: "",
  });
}

async function restore(target: number, write: boolean): Promise<void> {
  const { version, document } = await load();
  if (target === version) throw new Error(`Version ${target} is the current version`);
  const snapshot = await loadSnapshot(target);
  if (snapshot === null) throw new Error(`The history has no version ${target}`);
  if (snapshot.data === null) {
    throw new Error(`Version ${target}'s snapshot was thinned away; only its change record is left`);
  }
  const restored = normalizeTree(snapshot.data).tree;
  const problems = treeProblems(restored);
  if (problems.length > 0) {
    throw new Error(`Version ${target} breaks today's invariants:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }

  const people = (tree: Tree): number => Object.keys(tree.persons).length;
  const change = `Restored the research document of version ${target} (${people(restored)} people; version ${version} had ${people(document)})`;
  console.log(`Tree version ${version}. ${change}.`);
  // A fresh solve, whatever the topology: the restored tree gets an exact
  // layout from today's layout code.
  const layout = solveLayout(projectTree(restored));

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to restore.");
    return;
  }
  await commit({
    expectedVersion: version,
    document: restored,
    layout,
    round: `restore v${target}`,
    ops: [],
    changes: [change],
    note: "",
  });
}

async function relayout(write: boolean): Promise<void> {
  const { version, document, publicRow } = await load();
  const tree = projectTree(document);
  const fits = publicRow.layout !== null && topologyHash(tree) === publicRow.layoutTreeHash;
  const stored =
    publicRow.layout === null ? "is missing" : fits ? "fits the tree" : "was solved for a different tree";
  console.log(`Tree version ${version}. The stored layout ${stored}.`);

  const layout = solveLayout(tree);
  if (fits) {
    // Key order says nothing: jsonb reorders object keys when it stores them.
    const same = isDeepStrictEqual(layout, publicRow.layout);
    console.log(`The new layout ${same ? "is identical to" : "differs from"} the stored one.`);
  }

  if (!write) {
    console.log("\nDry run: nothing was written. Re-run with --write to save the layout.");
    return;
  }

  if (!(await saveLayoutIfUnchanged(tree, layout, version))) throw staleWrite(version);
  console.log(`Saved the layout for tree version ${version}.`);
  await verifyAfterWrite();
}

interface Args {
  positional: string[];
  write: boolean;
  round: string | undefined;
}

function parseArgs(args: readonly string[]): Args {
  const parsed: Args = { positional: [], write: false, round: undefined };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write" && !parsed.write) parsed.write = true;
    else if (arg === "--round" && parsed.round === undefined) {
      // `.at()`, not indexing: indexing types as `string` and lies when the
      // value is missing, which is the case this check exists for.
      const value = args.at(i + 1);
      if (value === undefined || value.startsWith("--")) throw new Error(USAGE);
      parsed.round = value;
      i++;
    } else if (arg.startsWith("--")) throw new Error(USAGE);
    else parsed.positional.push(arg);
  }
  return parsed;
}

function versionArg(arg: string): number {
  if (!/^\d+$/.test(arg)) throw new Error(USAGE);
  return Number(arg);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.at(0);
  const { positional, write, round } = parseArgs(args.slice(1));
  const arg = positional.at(0);
  const readOnly = !write && round === undefined;
  const only = (count: number): boolean => positional.length === count;

  if (command === "find" && readOnly && only(1) && arg !== undefined) return find(arg);
  if (command === "show" && readOnly && only(1) && arg !== undefined) return show(arg);
  if (command === "gaps" && readOnly && only(0)) return gaps();
  if (command === "superseded" && readOnly && only(0)) return superseded();
  if (command === "undecided" && readOnly && only(0)) return undecided();
  if (command === "peoples" && readOnly && only(0)) {
    console.log(describePeoples());
    return;
  }
  if (command === "needed-art" && readOnly && only(0)) return neededArt();
  if (command === "verify" && readOnly && only(0)) return verify();
  if (command === "history" && readOnly && positional.length <= 1) {
    return history(arg === undefined ? DEFAULT_HISTORY_COUNT : versionArg(arg));
  }
  if (command === "apply" && only(1) && arg !== undefined) {
    return apply(arg, round ?? basename(arg), write);
  }
  if (command === "restore" && round === undefined && only(1) && arg !== undefined) {
    return restore(versionArg(arg), write);
  }
  if (command === "relayout" && round === undefined && only(0)) return relayout(write);
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
