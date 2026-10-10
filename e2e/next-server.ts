/**
 * One e2e run's own Next server: a production build of the code as it is
 * when the run starts, served on a port the OS picks. The build is a
 * snapshot, so edits saved while the run is going never reach its pages, and
 * any number of runs can go at once without touching the dev server.
 *
 * Each run builds into `.next-e2e/run-<id>/`, named after its Playwright
 * runner's process (playwright.config.ts). The run's global teardown stops
 * this server and deletes that folder; a run that never got there (killed,
 * or its build failed) leaves it behind, so every run first deletes the
 * folders of runs whose runner is gone, along with their test output when
 * no test failed.
 */
import { spawn, type ChildProcess } from "child_process";
import { createRequire } from "module";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { RESULTS_ROOT, RUNS_ROOT as ROOT, runDir as runDirOf } from "./run-dir";

const NEXT_BIN = createRequire(import.meta.url).resolve("next/dist/bin/next");
const NEXT_ENV = "next-env.d.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Folders are `run-<pid>` (a run's) or `trash-<pid>-…` (being deleted by that pid). */
function pruneDeadRuns(): void {
  if (!existsSync(ROOT)) return;
  for (const name of readdirSync(ROOT)) {
    const owner = /^(?:run|trash)-(\d+)/.exec(name);
    if (owner === null || isAlive(Number(owner[1]))) continue;
    // Renaming first claims the folder atomically, so two runs starting together never delete the same tree.
    const trash = join(ROOT, `trash-${process.pid}-${name}`);
    try {
      renameSync(join(ROOT, name), trash);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; // Another run claimed it first.
      throw error;
    }
    rmSync(trash, { recursive: true, force: true });
  }
}

/** A finished run's test output is worth keeping only while it holds a failed test's files. */
function pruneEmptyResults(): void {
  if (!existsSync(RESULTS_ROOT)) return;
  for (const name of readdirSync(RESULTS_ROOT)) {
    const owner = /^run-(\d+)$/.exec(name);
    if (owner === null || isAlive(Number(owner[1]))) continue;
    const dir = join(RESULTS_ROOT, name);
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; // Another run deleted it first.
      throw error;
    }
    if (files.every((file) => file === ".last-run.json")) rmSync(dir, { recursive: true, force: true });
  }
}

let current: ChildProcess | undefined;
// Elsewhere than Windows the teardown stops this process alone (e2e/global-teardown.ts): take Next down with it.
process.on("SIGTERM", () => {
  current?.kill();
  process.exit(1);
});

function next(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(process.execPath, [NEXT_BIN, ...args], { env, stdio: "inherit" });
  current = child;
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/**
 * `next build` rewrites the root next-env.d.ts to import this run's route
 * types, a folder that is deleted later. Point it back at the dev server's,
 * the project's normal state. Another run's in-flight build may have written
 * its own folder there since; that run puts it back when its build ends.
 */
function restoreNextEnv(distDir: string): void {
  const content = readFileSync(NEXT_ENV, "utf8");
  const ours = `./${distDir}/`;
  if (content.includes(ours)) writeFileSync(NEXT_ENV, content.replaceAll(ours, "./.next/dev/"));
}

const runId = process.env.E2E_RUN_ID;
if (runId === undefined) throw new Error("E2E_RUN_ID is unset: start this through playwright.config.ts");
pruneDeadRuns();
pruneEmptyResults();
const runDir = runDirOf(runId);
mkdirSync(runDir, { recursive: true });
writeFileSync(`${runDir}/server.pid`, String(process.pid));
const tsconfig = `${runDir}/tsconfig.json`;
writeFileSync(tsconfig, JSON.stringify({ extends: "../../tsconfig.json" }));
const distDir = `${runDir}/dist`;
const env = { ...process.env, NEXT_DIST_DIR: distDir, E2E_TSCONFIG: tsconfig };

try {
  await next(["build"], env);
} finally {
  restoreNextEnv(distDir);
}
// Port 0: the OS hands out a free port as the server binds it, so runs never race for one.
// Playwright reads the address from the server's "Local:" line (webServer.wait in playwright.config.ts).
await next(["start", "--port", "0"], env);
