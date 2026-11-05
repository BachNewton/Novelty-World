#!/usr/bin/env node
/**
 * Runs the test files a change could have affected, decided by the import graph.
 *
 * "The change" is everything that differs from where this checkout's work began
 * (diffBase in affected-tests-rules.mjs: the merge base with local main, or on
 * main the commits not yet pushed): commits since it, staged, unstaged and
 * untracked files.
 *
 * A test file is selected when any of these holds:
 *
 *   changed-path  The file itself, or any module in its import closure (static
 *                 and dynamic imports, walked through Vite's transform the way
 *                 `vitest --changed` walks them), is in the change.
 *   disk-reading  Some module in its closure, outside node_modules, imports the
 *                 file system, a child process, a worker thread or a glob
 *                 library (DISK_MODULES below), and the change is in what it
 *                 can reach. Such a test reaches files by path, which the graph
 *                 can't see, so it is assumed to reach its home (its project's
 *                 folders, or for a test outside any project its own directory),
 *                 every module its home's modules import (what a worker or a
 *                 process started from there loads), and any file outside every
 *                 project whose name its home's code spells out (a stylesheet or
 *                 a script read or started by path).
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
 * which stays whole-repo, catches a test still importing it), an import whose
 * specifier is computed at run time, and a disk-reading test that reads another
 * project's files, or a shared file by a name its code doesn't spell out.
 *
 *   node scripts/affected-tests.mjs                 # select, then run the selection
 *   node scripts/affected-tests.mjs --list          # print the selection, run nothing
 *   node scripts/affected-tests.mjs --all           # run every test file
 *   node scripts/affected-tests.mjs --base <branch> # measure from another branch than main
 *   node scripts/affected-tests.mjs --config <file> # another vitest config
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { createVitest } from "vitest/node";
import { diffBase, git, homeOf, projectOf } from "./affected-tests-rules.mjs";

// Each changes how tests behave without being a module a test imports. The walk
// stops at node_modules, so a dependency bump is in no closure.
const FORCE_TRIGGER = /^(package\.json|package-lock\.json|tsconfig[^/]*\.json|vitest\.config\.ts|vitest\.slow\.config\.ts|scripts\/affected-tests(-rules)?\.mjs)$/;

// Matched against the bare specifier, with or without `node:`.
const DISK_MODULES = ["fs", "fs/promises", "child_process", "worker_threads", "glob", "fast-glob", "tinyglobby"];

const MODULE_FILE = /\.[cm]?[jt]sx?$/;
const MODULE_GLOBS = ["*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.jsx", "*.mjs", "*.cjs"];

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const forceAll = args.includes("--all");
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const config = option("--config");
const baseOverride = option("--base");

// Windows paths compare case-insensitively, and git and Vite disagree on slashes.
const norm = (p) => {
  const resolved = path.resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const gitList = (root, [command, ...rest]) => git(root, [command, "-z", ...rest]).split("\0").filter(Boolean);

function changedPaths(root) {
  try {
    const top = git(root, ["rev-parse", "--show-toplevel"]).trim();
    const base = diffBase(top, baseOverride);
    const lists = [
      ["diff", "--name-only", "--no-renames", base.commit, "HEAD"],
      ["diff", "--name-only", "--no-renames", "--cached"],
      ["ls-files", "--others", "--modified", "--exclude-standard"],
    ].map((listArgs) => gitList(top, listArgs));
    return { top, base: base.ref, paths: [...new Set(lists.flat())] };
  } catch (error) {
    const detail = String(error.stderr || error.message).trim().split("\n")[0];
    return { error: `could not compute the change (${detail})` };
  }
}

// The files under `folders` that spell out any of `names`.
function filesNaming(top, names, folders) {
  if (names.length === 0 || folders.length === 0) return [];
  try {
    return gitList(top, ["grep", "-I", "-F", "-l", "--untracked", ...names.flatMap((name) => ["-e", name]), "--", ...folders]);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

// The name an import of a module spells: its file's stem, or an index file's folder.
const importName = (file) => {
  const stem = path.basename(file).replace(/\.[^.]+$/, "");
  return stem === "index" ? path.basename(path.dirname(file)) : stem;
};

const isDiskModule =(dep) => DISK_MODULES.includes(dep.replace(/^node:/, ""));

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

  const closureOf = async (project, entries) => {
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

  // Every module that imports one of `targets`, directly or not, and the targets.
  // An import names the file it imports (an index file by its folder, or as "."
  // or ".." from inside that folder), so only a module that names it, or one
  // inside an index file's folder, is inspected; one that won't transform counts
  // as an importer.
  const importersOf = async (project, top, targets) => {
    const reached = new Set(targets.map(norm));
    let frontier = targets;
    while (frontier.length > 0) {
      const names = [...new Set(frontier.map(importName))];
      const indexFolders = frontier
        .filter((file) => /^index\./.test(path.basename(file)))
        .map((file) => path.relative(top, path.dirname(file)));
      const inIndexFolders =
        indexFolders.length === 0
          ? []
          : gitList(top, ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...indexFolders]).filter(
              (file) => MODULE_FILE.test(file),
            );
      const candidates = [...new Set([...filesNaming(top, names, MODULE_GLOBS), ...inIndexFolders])]
        .map((file) => path.join(top, file))
        .filter((file) => !reached.has(norm(file)));
      const infos = await Promise.all(candidates.map((file) => visit(project, file.replace(/\\/g, "/"))));
      frontier = candidates.filter((_, i) => infos[i].failed || infos[i].deps.some((dep) => reached.has(norm(dep))));
      for (const file of frontier) reached.add(norm(file));
    }
    return reached;
  };

  return { closureOf, importersOf };
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

  const { closureOf, importersOf } = makeWalker();
  const closures = await Promise.all(
    specs.map(async (spec) => [
      spec,
      await closureOf(spec.project, [spec.moduleId, ...spec.project.config.setupFiles]),
    ]),
  );
  const graphSelects = (closure) => [...closure.paths].some((p) => changed.has(p));

  // The tests left to judge by what they reach by path, grouped by home.
  const repoPath = (file) => path.relative(diff.top, file).replace(/\\/g, "/");
  const projects = new Set(
    gitList(diff.top, ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src/projects"])
      .map((file) => file.split("/")[2]),
  );
  const homeKey = (spec) => homeOf(repoPath(spec.moduleId), projects);
  const homes = new Map(
    closures.filter(([, closure]) => closure.disk && !graphSelects(closure)).map(([spec]) => [homeKey(spec)[0], homeKey(spec)]),
  );
  const reached = new Set();
  if (homes.size > 0) {
    const shared = diff.paths.filter((p) => projectOf(p, projects) === undefined);
    const naming = filesNaming(diff.top, [...new Set(shared.map((p) => path.posix.basename(p)))], [...homes.keys()]);
    const changedModules = diff.paths.filter((p) => MODULE_FILE.test(p)).map((p) => path.join(diff.top, p));
    const importers = await importersOf(specs[0].project, diff.top, changedModules);
    for (const [code, folders] of homes) {
      const absolute = `${norm(path.join(diff.top, code))}/`;
      if (
        diff.paths.some((p) => folders.some((folder) => p.startsWith(folder))) ||
        naming.some((file) => file.startsWith(code)) ||
        [...importers].some((p) => p.startsWith(absolute))
      ) {
        reached.add(code);
      }
    }
  }

  const counts = { "changed-path": 0, "disk-reading": 0, unwalkable: 0 };
  const selected = [];
  for (const [spec, closure] of closures) {
    const why = graphSelects(closure)
      ? "changed-path"
      : closure.disk && reached.has(homeKey(spec)[0])
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
    line: `${selected.length} of ${specs.length} test files selected (${parts.join(", ")}; ${diff.paths.length} changed paths vs ${diff.base})`,
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
