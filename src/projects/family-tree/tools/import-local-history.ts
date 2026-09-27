// ONE-OFF: imports the old local research files into the database, then gets
// deleted (with the import-only functions at the end of tree-db.ts) once it
// has run for real. Run from the repo root, after the private row is seeded:
//
//   npx tsx src/projects/family-tree/tools/import-local-history.ts <research dir> [--write]
//
// - Tree backups (`backups/family-tree-v<N>-<stamp>.json`) become history
//   snapshots of the versions they hold.
// - Change files become `imported` change records, with the file's path in
//   the research folder as the round label: every top-level
//   `changes-*.json`, and each change file in a round folder that a replay
//   proves was applied. Round-folder files no replay reproduces are drafts
//   that may never have been applied; they wait for Stage 5's triage.
//
// The replay is the proof: a change file was applied at version N when
// applying it today to the backup of N reproduces version N+1 exactly (the
// new people's random ids aside). Only a proven file gets its versions and
// change list, and links the history row of N+1 to it.
//
// A dry run by default: it reads the research folder and the database and
// prints the plan. With --write it inserts what is missing, and is safe to
// re-run: rows already there are compared and skipped, and a row that
// differs from its file stops the import.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { normalizeTree } from "../logic";
import type { Tree } from "../types";
import { applyOps, parseOps } from "./tree-edit";
import {
  insertImportedChange,
  insertSnapshot,
  linkSnapshotChange,
  loadHistoryIndex,
  loadImportedChanges,
  loadSnapshot,
  loadTreeRow,
  type ImportedChange,
} from "./tree-db";

const USAGE = "usage: import-local-history.ts <research dir> [--write]";
const BACKUP_NAME = /^family-tree-v(\d+)-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z\.json$/;
const PLACEHOLDER = "__replayed-new-person-";

interface Backup {
  version: number;
  data: unknown;
  // When each backup of this version was taken, oldest first: the moment
  // before the next write (or a layout-only write) replaced it.
  stamps: string[];
  files: string[];
}

interface ChangeFile {
  round: string;
  ops: unknown;
  topLevel: boolean;
}

interface Replay {
  checkedVersion: number;
  changes: string[];
}

// Reads a JSON file under the research folder named on the command line.
function readJson(path: string): unknown {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- one-off dev tool; the path is inside the research folder its runner names
  return JSON.parse(readFileSync(path, "utf8"));
}

function listDir(path: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- one-off dev tool; the path is inside the research folder its runner names
  return readdirSync(path).sort();
}

function isDir(path: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- one-off dev tool; the path is inside the research folder its runner names
  return statSync(path).isDirectory();
}

function readBackups(dir: string): { backups: Map<number, Backup>; skipped: string[] } {
  const backups = new Map<number, Backup>();
  const skipped: string[] = [];
  for (const name of listDir(dir)) {
    const match = BACKUP_NAME.exec(name);
    if (match === null) {
      skipped.push(name);
      continue;
    }
    const [, v, day, hh, mm, ss, ms] = match;
    const version = Number(v);
    const stamp = `${day}T${hh}:${mm}:${ss}.${ms}Z`;
    const row = readJson(join(dir, name)) as { version: number; data: unknown };
    if (row.version !== version) throw new Error(`${name} holds version ${row.version}`);
    const known = backups.get(version);
    if (known === undefined) {
      backups.set(version, { version, data: row.data, stamps: [stamp], files: [name] });
    } else if (isDeepStrictEqual(known.data, row.data)) {
      known.stamps.push(stamp);
      known.files.push(name);
    } else {
      throw new Error(`${name} and ${known.files[0]} hold different trees for version ${version}`);
    }
  }
  for (const backup of backups.values()) backup.stamps.sort();
  return { backups, skipped };
}

// Top-level `changes-*.json`, and every JSON list in a round folder.
function readChangeFiles(researchDir: string): { files: ChangeFile[]; skipped: string[] } {
  const files: ChangeFile[] = [];
  const skipped: string[] = [];
  const round = (path: string): string => relative(researchDir, path).split(sep).join("/");
  for (const name of listDir(researchDir)) {
    const path = join(researchDir, name);
    if (name === "backups") continue;
    if (isDir(path)) {
      for (const inner of listDir(path).filter((n) => n.endsWith(".json"))) {
        const ops = readJson(join(path, inner));
        if (Array.isArray(ops)) files.push({ round: round(join(path, inner)), ops, topLevel: false });
        else skipped.push(round(join(path, inner)));
      }
    } else if (/^changes-.*\.json$/.test(name)) {
      files.push({ round: name, ops: readJson(path), topLevel: true });
    } else if (name.endsWith(".json")) {
      skipped.push(name);
    }
  }
  return { files, skipped };
}

function signature(tree: Tree, id: string): string {
  const p = tree.persons[id];
  return JSON.stringify([p.firstName, p.middleName, p.lastName, p.commonName, p.birthSurname, p.gender, p.birthDate]);
}

// Whether `ops`, applied to `before`, reproduce `after` exactly once the
// people it adds are given the ids they got in `after`.
function replay(ops: ReturnType<typeof parseOps>, before: Tree, after: Tree): string[] | null {
  let n = 0;
  let result;
  try {
    result = applyOps(before, ops, () => `${PLACEHOLDER}${n++}__`);
  } catch {
    // Not this version: the ops don't apply to it.
    return null;
  }
  const added = Object.keys(result.tree.persons).filter((id) => id.startsWith(PLACEHOLDER));
  const candidates = Object.keys(after.persons).filter((id) => !(id in before.persons));
  if (added.length !== candidates.length) return null;
  let json = JSON.stringify(result.tree);
  for (const placeholder of added) {
    const sig = signature(result.tree, placeholder);
    const index = candidates.findIndex((id) => signature(after, id) === sig);
    if (index === -1) return null;
    json = json.split(placeholder).join(candidates[index]);
    candidates.splice(index, 1);
  }
  return isDeepStrictEqual(JSON.parse(json), after) ? result.changes : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const researchDir = args.at(0);
  const flags = args.slice(1);
  if (researchDir === undefined || !flags.every((f) => f === "--write") || flags.length > 1) {
    throw new Error(USAGE);
  }
  const write = flags.length === 1;

  const { backups, skipped: otherBackupFiles } = readBackups(join(researchDir, "backups"));
  const { files, skipped: otherFiles } = readChangeFiles(researchDir);
  const live = await loadTreeRow();
  if (live === null) throw new Error("There is no public tree row");

  // The trees a replay can start from and must reproduce: every backup, and
  // the live tree as the version after the newest backup.
  const trees = new Map<number, Tree>();
  for (const backup of backups.values()) trees.set(backup.version, normalizeTree(backup.data).tree);
  trees.set(live.version, normalizeTree(live.data).tree);
  // When version N was written: the latest backup of N-1, taken just before
  // the write. Without one, the earliest backup of N itself, when it was
  // certainly already written.
  const savedAt = (version: number): string | null => {
    const before = backups.get(version - 1);
    if (before !== undefined) return before.stamps[before.stamps.length - 1];
    return backups.get(version)?.stamps[0] ?? null;
  };

  // Which transitions each change file reproduces.
  const replays = new Map<string, Replay[]>();
  const unparsed = new Map<string, string>();
  for (const file of files) {
    let ops;
    try {
      ops = parseOps(file.ops);
    } catch (err) {
      unparsed.set(file.round, err instanceof Error ? err.message : String(err));
      continue;
    }
    const found: Replay[] = [];
    for (const [version, before] of trees) {
      const after = trees.get(version + 1);
      if (after === undefined) continue;
      const changes = replay(ops, before, after);
      if (changes !== null) found.push({ checkedVersion: version, changes });
    }
    replays.set(file.round, found);
  }

  // A file proven by exactly one transition, and a transition proven by
  // exactly one file, link to each other.
  const byTransition = new Map<number, string[]>();
  for (const [round, found] of replays) {
    for (const { checkedVersion } of found) {
      byTransition.set(checkedVersion, [...(byTransition.get(checkedVersion) ?? []), round]);
    }
  }
  const proven = (round: string): Replay | null => {
    const found = replays.get(round) ?? [];
    if (found.length !== 1) return null;
    return byTransition.get(found[0].checkedVersion)?.length === 1 ? found[0] : null;
  };

  const imports: ImportedChange[] = [];
  const leftForTriage: string[] = [];
  console.log("Change files:");
  for (const file of files) {
    const replayed = proven(file.round);
    const found = replays.get(file.round) ?? [];
    const why = unparsed.has(file.round)
      ? `it no longer parses (${unparsed.get(file.round)})`
      : found.length === 0
        ? "no replay against the backups reproduced a version"
        : `it replays as ${found.map((r) => `v${r.checkedVersion}→v${r.checkedVersion + 1}`).join(", ")}, which other files also reproduce or which is more than one transition`;
    if (!file.topLevel && replayed === null) {
      leftForTriage.push(`${file.round}: ${why}`);
      continue;
    }
    const where = `Imported from the local research folder's ${file.round}.`;
    imports.push({
      round: file.round,
      ops: file.ops,
      checkedVersion: replayed?.checkedVersion ?? null,
      changes: replayed?.changes ?? null,
      appliedVersion: replayed === null ? null : replayed.checkedVersion + 1,
      appliedAt: replayed === null ? null : savedAt(replayed.checkedVersion + 1),
      note:
        replayed === null
          ? `${where} Not proven applied: ${why}.`
          : `${where} A replay against the backups reproduced version ${replayed.checkedVersion + 1}.`,
    });
    const shown = replayed === null ? `not proven (${why})` : `v${replayed.checkedVersion}→v${replayed.checkedVersion + 1}`;
    console.log(`  import ${file.round}: ${shown}`);
  }
  console.log(`\nRound-folder files left for Stage 5's triage (${leftForTriage.length}):`);
  for (const line of leftForTriage) console.log(`  ${line}`);

  const versions = [...backups.keys()].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let v = 0; v < live.version; v++) if (!backups.has(v)) missing.push(v);
  console.log(`\nSnapshots: ${versions.length} backed-up versions, v${versions[0]}–v${versions[versions.length - 1]}; the live tree is at v${live.version}.`);
  console.log(`  versions below v${live.version} with no backup: ${missing.map((v) => `v${v}`).join(", ") || "none"}`);
  for (const v of versions) {
    const link = imports.find((c) => c.appliedVersion === v);
    console.log(`  v${v}: saved ${savedAt(v)}${link === undefined ? "" : `, by ${link.round}`} (${backups.get(v)?.files.join(", ")})`);
  }
  const liveLink = imports.find((c) => c.appliedVersion === live.version);
  if (liveLink !== undefined) console.log(`  v${live.version} (the seeded snapshot): by ${liveLink.round}`);

  console.log("\nOther files, not imported (the archive bucket, Stage 2, keeps the originals):");
  for (const name of otherBackupFiles) {
    const path = join(researchDir, "backups", name);
    const same =
      name.endsWith(".json") && backups.has(0) && isDeepStrictEqual(readJson(path), backups.get(0)?.data)
        ? " (identical to version 0)"
        : "";
    console.log(`  backups/${name}${same}`);
  }
  for (const name of otherFiles) console.log(`  ${name}`);

  if (!write) {
    console.log(`\nDry run: nothing was written. With --write: ${imports.length} change records, ${versions.length} snapshots.`);
    return;
  }

  // Changes first, so the snapshots can link to them.
  const existingChanges = new Map((await loadImportedChanges()).map((c) => [c.round, c]));
  const ids = new Map<number, string>();
  for (const change of imports) {
    const existing = existingChanges.get(change.round);
    let id: string;
    if (existing === undefined) id = await insertImportedChange(change);
    else if (isDeepStrictEqual(existing.ops, change.ops)) id = existing.id;
    else throw new Error(`The imported change ${change.round} in the database differs from its file`);
    if (change.appliedVersion !== null) ids.set(change.appliedVersion, id);
  }
  const history = new Map((await loadHistoryIndex()).map((h) => [h.version, h]));
  for (const v of versions) {
    const backup = backups.get(v);
    const saved = savedAt(v);
    if (backup === undefined || saved === null) throw new Error(`Version ${v} lost its backup`);
    const existing = history.get(v);
    if (existing === undefined) {
      await insertSnapshot({ version: v, savedAt: saved, changeId: ids.get(v) ?? null, data: backup.data });
      continue;
    }
    const stored = await loadSnapshot(v);
    if (!isDeepStrictEqual(stored?.data, backup.data)) {
      throw new Error(`The history's version ${v} differs from its backup (${backup.files[0]})`);
    }
  }
  // Rows that were already there, such as the seeded snapshot of the live
  // version, get their change now.
  const unlinked = (await loadHistoryIndex()).filter((h) => h.changeId === null);
  for (const { version } of unlinked) {
    const id = ids.get(version);
    if (id !== undefined) await linkSnapshotChange(version, id);
  }
  console.log(`\nImported. Run tree-cli.ts history ${live.version + 1} to read it back.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
