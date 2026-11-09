/**
 * The machine's budget: one queue, shared by every checkout and worktree on this
 * machine, that every test run, typecheck, lint, build and headless browser goes
 * through. Many agents and sessions work here at once, and when their runs add up
 * to more than the machine has, every one of them slows, correct tests miss their
 * timeouts, and the reruns add more load. A run here asks for what it takes (cores,
 * and the GPU's share of pages for browser work) and starts once that much is free,
 * first come first served, so the machine is kept full but never overloaded.
 *
 * The ledger is a folder in the git common directory (one per machine and clone,
 * never committed): a file per run, waiting or running, written under a short lock.
 * A run that dies without tidying up is found by its process id and dropped.
 *
 * The rules (`admit`) are pure, and unit-tested; the rest is the ledger's I/O.
 */
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The pages the GPU holds: the integrated Radeon's four. It shares the laptop's memory,
 * and six pages at 3440x1440 at once bugchecked its driver (0x119, a video scheduler
 * fault, the whole machine down) while this budget, counting the plugged-in RTX 4070's
 * eight, allowed them: the e2e specs force the eGPU (`e2e/webgpu.ts`), but the headless
 * tools draw on the Radeon whatever is plugged in, and one pool can't tell them apart.
 * The eGPU (12 GB) passed 8 pages at once and failed at 12; a budget with a pool per
 * GPU could give an e2e run on it its third worker back.
 */
const GPU_PAGES = 4;

/**
 * What each kind of run takes. `cores` is what the run is held to (its workers),
 * `gpu` the game pages it may have open at once on the one GPU. A page holds about
 * 1.15 GB of video memory while it draws, and running out of it is what fails a
 * test: busy only slows one. An e2e worker plays a two-player test at most, so an
 * e2e run has as many workers as the pages allow.
 */
export const KINDS = {
  unit: { cores: 4, gpu: 0, workers: 4 },
  slow: { cores: 6, gpu: 0, workers: 6 },
  e2e: { cores: 5, gpu: Math.min(6, GPU_PAGES), workers: Math.min(3, Math.floor(GPU_PAGES / 2)) },
  browser: { cores: 2, gpu: 2 },
  check: { cores: 2, gpu: 0 },
  build: { cores: 4, gpu: 0 },
  // Every unit, slow and e2e test, unscoped: the whole machine, so it waits to be alone.
  all: { cores: 1000, gpu: 1000 },
};

/** Two cores are left for the owner, the editors and the agents themselves. */
export const BUDGET = { cores: Math.max(2, os.availableParallelism() - 2), gpu: GPU_PAGES };

/** What a kind asks for: a name from `KINDS`, or `cores:N` for other heavy work. */
export function demand(kind) {
  const custom = /^cores:(\d+)$/.exec(kind);
  if (custom) return { cores: Number(custom[1]), gpu: 0 };
  const known = KINDS[kind];
  if (known === undefined) throw new Error(`unknown kind "${kind}": one of ${Object.keys(KINDS).join(", ")} or cores:N`);
  return known;
}

/**
 * Which waiting runs may start now. `runs` are every run in the ledger, oldest
 * first, each `{ id, state: "running" | "waiting", cores, gpu }`. Waiting runs start
 * in order while each fits beside what's running; the first that doesn't fit stops
 * the line, so a big run is never starved by small ones slipping past it. A run
 * bigger than the whole budget starts once it would be alone.
 */
export function admit(runs, budget = BUDGET) {
  let cores = 0;
  let gpu = 0;
  for (const run of runs) {
    if (run.state !== "running") continue;
    cores += run.cores;
    gpu += run.gpu;
  }
  const started = [];
  for (const run of runs) {
    if (run.state !== "waiting") continue;
    const alone = cores === 0 && gpu === 0;
    const fits = alone || (cores + run.cores <= budget.cores && gpu + run.gpu <= budget.gpu);
    if (!fits) break;
    started.push(run.id);
    cores += run.cores;
    gpu += run.gpu;
  }
  return started;
}

/** The ledger's folder, in the git common directory so every worktree shares it. */
export function ledgerDir(cwd = process.cwd()) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" }).trim();
  const dir = path.join(common, "machine-budget");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** Holds the ledger's lock while `work` runs: an exclusive file, taken back from a holder that died. */
function locked(dir, work) {
  const lock = path.join(dir, "lock");
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      writeFileSync(lock, String(process.pid));
      break;
    } catch (error) {
      // On Windows a file deleted while another waiter still has it open (reading the holder's pid below) lingers as
      // "delete pending" until that handle closes, and creating it again then fails with EPERM, not EEXIST: the lock
      // is busy either way.
      if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
      const holder = Number(readFileOr(lock, ""));
      const old = ageMs(lock) > 10_000;
      if ((holder > 0 && !alive(holder)) || old) rmSync(lock, { force: true });
      // The lock is held for a read and a write of a few small files: a moment, so a short spin.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return work();
  } finally {
    rmSync(lock, { force: true });
  }
}

const readFileOr = (file, fallback) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
};

const ageMs = (file) => {
  try {
    return Date.now() - statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/** Every run in the ledger, oldest first, with the dead dropped from it. */
function readRuns(dir) {
  const runs = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
    const file = path.join(dir, name);
    const run = JSON.parse(readFileOr(file, "null"));
    if (run === null) continue;
    if (!alive(run.pid)) {
      unlinkSync(file);
      continue;
    }
    runs.push({ ...run, file });
  }
  return runs;
}

/** Joins the queue; returns the run's id. */
export function enqueue(dir, { kind, who, command }) {
  const { cores, gpu } = demand(kind);
  const id = `${Date.now().toString().padStart(15, "0")}-${process.pid}`;
  const run = { id, pid: process.pid, kind, cores, gpu, who, cwd: process.cwd(), command, state: "waiting", queuedAt: new Date().toISOString() };
  locked(dir, () => writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(run)));
  return id;
}

/** Starts whatever may start; true once the run `id` is running. */
export function tryStart(dir, id) {
  return locked(dir, () => {
    const runs = readRuns(dir);
    for (const startId of admit(runs)) {
      const run = runs.find((each) => each.id === startId);
      writeFileSync(run.file, JSON.stringify({ ...run, file: undefined, state: "running", startedAt: new Date().toISOString() }));
      run.state = "running";
    }
    return runs.find((run) => run.id === id)?.state === "running";
  });
}

/** Leaves the ledger, running or waiting. */
export function leave(dir, id) {
  rmSync(path.join(dir, `${id}.json`), { force: true });
}

/** The ledger as it stands, for `npm run slot -- status`. */
export function status(dir) {
  return locked(dir, () => readRuns(dir));
}

/**
 * Fails loudly when heavy work starts outside the budget: tests, e2e and the
 * browser tools call this, so a run started directly says how to run it instead.
 */
export function requireSlot(what, { interactiveOk = false } = {}) {
  if (process.env.MACHINE_SLOT !== undefined) return;
  // The owner at a terminal (vitest's watch mode, say) is one person, not a fleet of agents.
  if (interactiveOk && process.stdout.isTTY) return;
  throw new Error(
    `${what} runs only through the machine's budget, so parallel sessions don't overload it: ` +
      "use the npm script (npm run test, test:slow, test:e2e, typecheck, lint), or wrap the command: " +
      "npm run slot -- <unit|slow|e2e|browser|check|build|cores:N> -- <command>. See \"Sharing the machine\" in CLAUDE.md.",
  );
}
