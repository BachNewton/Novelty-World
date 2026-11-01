#!/usr/bin/env node
/**
 * Runs the test files a change could have affected, decided by the import graph.
 *
 * "The change" is everything that differs from the merge-base with origin/main:
 * commits since it, staged, unstaged and untracked files. origin/main, never
 * local main, so work committed straight onto main still has a diff. A stale
 * origin/main only moves the merge-base back, which selects more, never less.
 *
 * A test file is selected when any of these holds:
 *
 *   changed-path  The file itself, or any module in its import closure (static
 *                 and dynamic imports, walked through Vite's transform the way
 *                 `vitest --changed` walks them), is in the change.
 *   disk-reading  Some module in its closure, outside node_modules, imports the
 *                 file system, a child process, a worker thread or a glob
 *                 library (DISK_MODULES below). Such a test reaches the repo by
 *                 path, so the graph can't see what it depends on. A test in a
 *                 project reads that project's own files, so it runs when the
 *                 change touches that project or anything every project shares
 *                 (SHARED_PATH below); any other such test always runs.
 *   unwalkable   A module in its closure failed to transform, or imports a
 *                 relative, root-relative or `@/` specifier that resolves to
 *                 nothing on disk. Its imports aren't all known.
 *
 * Setup files run before every test, so they are part of every closure.
 *
 * Everything runs when a changed path is a force trigger (below) or the diff
 * can't be computed. It never falls back to zero tests by accident.
 *
 * What this doesn't see: a deleted or renamed module is in no closure (typecheck,
 * which stays whole-repo, catches a test still importing it), and an import whose
 * specifier is computed at run time.
 *
 *   node scripts/affected-tests.mjs                 # select, then run the selection
 *   node scripts/affected-tests.mjs --list          # print the selection, run nothing
 *   node scripts/affected-tests.mjs --all           # run every test file
 *   node scripts/affected-tests.mjs --config <file> # another vitest config
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createVitest } from "vitest/node";

const BASE = "origin/main";

// Each changes how tests behave without being a module a test imports. The walk
// stops at node_modules, so a dependency bump is in no closure.
const FORCE_TRIGGER = /^(package\.json|package-lock\.json|tsconfig[^/]*\.json|vitest\.config\.ts|vitest\.slow\.config\.ts|scripts\/affected-tests\.mjs)$/;

// Matched against the bare specifier, with or without `node:`.
const DISK_MODULES = ["fs", "fs/promises", "child_process", "worker_threads", "glob", "fast-glob", "tinyglobby"];

// What a project's disk-reading test can reach beyond its own folder.
const SHARED_PATH = /^(src\/(?!projects\/)|public\/|relay\/)/;

const projectOf = (repoPath) => repoPath.match(/^src\/projects\/([^/]+)\//)?.[1];

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const forceAll = args.includes("--all");
const configIndex = args.indexOf("--config");
const config = configIndex === -1 ? undefined : args[configIndex + 1];

// Windows paths compare case-insensitively, and git and Vite disagree on slashes.
const norm = (p) => {
  const resolved = path.resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const git = (root, gitArgs) =>
  execFileSync("git", ["-C", root, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function changedPaths(root) {
  try {
    const top = git(root, ["rev-parse", "--show-toplevel"]).trim();
    const lists = [
      ["diff", "--name-only", "--no-renames", "-z", `${BASE}...HEAD`],
      ["diff", "--name-only", "--no-renames", "-z", "--cached"],
      ["ls-files", "--others", "--modified", "--exclude-standard", "-z"],
    ].map((listArgs) => git(top, listArgs).split("\0").filter(Boolean));
    return { top, paths: [...new Set(lists.flat())] };
  } catch (error) {
    const detail = String(error.stderr || error.message).trim().split("\n")[0];
    return { error: `could not diff against ${BASE} (${detail})` };
  }
}

const isDiskModule = (dep) => DISK_MODULES.includes(dep.replace(/^node:/, ""));

// Where a dep Vite reported lives on disk, or null for a bare package. Vite
// rewrites what it resolved to `/@fs/<absolute>` or a root-relative path; a
// relative or `@/` specifier left raw is one it could not resolve.
function depPath(project, importer, dep) {
  if (dep.startsWith("/@fs/")) return dep.slice(process.platform === "win32" ? 5 : 4);
  if (dep.startsWith("/")) return path.join(project.config.root, dep);
  if (/^\.{1,2}\//.test(dep)) return path.resolve(path.dirname(importer), dep);
  if (dep.startsWith("@/")) return path.join(project.config.root, "src", dep.slice(2));
  return null;
}

function makeWalker() {
  const modules = new Map(); // module id -> promise of { deps, disk, failed }

  const inspect = async (project, id) => {
    const ssr = project.vite.environments.ssr;
    let transformed = null;
    try {
      transformed = ssr.moduleGraph.getModuleById(id)?.transformResult ?? (await ssr.transformRequest(id));
    } catch {
      transformed = null;
    }
    if (!transformed) return { deps: [], disk: false, failed: true };

    const deps = [];
    let disk = false;
    let failed = false;
    for (const raw of [...(transformed.deps ?? []), ...(transformed.dynamicDeps ?? [])]) {
      if (isDiskModule(raw)) disk = true;
      const dep = raw.split("?")[0];
      if (dep.startsWith("/@id/")) continue;
      const fsPath = depPath(project, id, dep);
      if (fsPath === null || fsPath.includes("node_modules")) continue;
      if (existsSync(fsPath)) deps.push(fsPath.replace(/\\/g, "/"));
      else failed = true;
    }
    return { deps, disk, failed };
  };

  const visit = (project, id) => {
    if (!modules.has(id)) modules.set(id, inspect(project, id));
    return modules.get(id);
  };

  return async (project, entries) => {
    const seen = new Set();
    let disk = false;
    let failed = false;
    const walk = async (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const info = await visit(project, id);
      disk ||= info.disk;
      failed ||= info.failed;
      await Promise.all(info.deps.map(walk));
    };
    await Promise.all(entries.map(walk));
    return { paths: new Set([...seen].map(norm)), disk, failed };
  };
}

async function select(vitest, specs) {
  const all = (reason) => ({
    selected: specs.map((spec) => ({ spec, why: "all" })),
    line: `all ${specs.length} test files (${reason})`,
  });
  if (forceAll) return all("--all");

  const diff = changedPaths(vitest.config.root);
  if (diff.error) return all(diff.error);

  const trigger = diff.paths.find((p) => FORCE_TRIGGER.test(p));
  if (trigger) return all(`${trigger} changed`);

  const changed = new Set(diff.paths.map((p) => norm(path.join(diff.top, p))));
  // A snapshot file is read by its test at run time, not imported.
  for (const p of diff.paths) {
    const snapshot = p.match(/^(.*)\/__snapshots__\/(.+)\.snap$/);
    if (snapshot) changed.add(norm(path.join(diff.top, snapshot[1], snapshot[2])));
  }

  const changedProjects = new Set(diff.paths.map(projectOf));
  const sharedChanged = diff.paths.some((p) => SHARED_PATH.test(p));
  const readsChange = (spec) => {
    const project = projectOf(path.relative(diff.top, spec.moduleId).replace(/\\/g, "/"));
    return project === undefined || sharedChanged || changedProjects.has(project);
  };

  const closureOf = makeWalker();
  const closures = await Promise.all(
    specs.map(async (spec) => [
      spec,
      await closureOf(spec.project, [spec.moduleId, ...spec.project.config.setupFiles]),
    ]),
  );

  const counts = { "changed-path": 0, "disk-reading": 0, unwalkable: 0 };
  const selected = [];
  for (const [spec, closure] of closures) {
    const why = [...closure.paths].some((p) => changed.has(p))
      ? "changed-path"
      : closure.disk && readsChange(spec)
        ? "disk-reading"
        : closure.failed
          ? "unwalkable"
          : null;
    if (!why) continue;
    counts[why]++;
    selected.push({ spec, why });
  }
  const parts = Object.entries(counts).map(([reason, count]) => `${count} ${reason}`);
  return {
    selected,
    line: `${selected.length} of ${specs.length} test files selected (${parts.join(", ")}; ${diff.paths.length} changed paths vs ${BASE})`,
  };
}

// What the vitest CLI sets before creating its instance; tests read these.
process.env.TEST = "true";
process.env.VITEST = "true";
process.env.NODE_ENV ??= "test";

const vitest = await createVitest("test", { run: true, watch: false, config, passWithNoTests: true });
let exitCode = 0;
try {
  const specs = await vitest.globTestSpecifications();
  const { selected, line } = await select(vitest, specs);
  console.log(`test: ${line}`);

  if (listOnly) {
    const row = ({ spec, why }) =>
      `${why.padEnd(13)} ${path.relative(vitest.config.root, spec.moduleId).replace(/\\/g, "/")}`;
    for (const entry of selected.map(row).sort()) console.log(entry);
  } else if (selected.length > 0) {
    await vitest.standalone();
    const run = selected.map(({ spec }) => spec);
    await vitest.runTestSpecifications(run, run.length === specs.length);
    exitCode = process.exitCode ?? 0;
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await vitest.close();
}
process.exit(exitCode);
