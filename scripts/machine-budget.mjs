/**
 * The machine's budget: one queue, shared by every checkout and worktree on this
 * machine, that every test run, typecheck, lint, build, headless browser and GPU job
 * goes through. Many agents and sessions work here at once, and when their runs add
 * up to more than the machine has, every one of them slows, correct tests miss their
 * timeouts, and the reruns add more load. A run here asks for what it takes of three
 * resources (cores, the integrated Radeon's pages, the RTX 4070 eGPU's memory) and
 * starts once that much is free, first come first served on each, so the machine is
 * kept full but never overloaded.
 *
 * The ledger is a folder in the git common directory (one per machine and clone,
 * never committed): a file per run, waiting or running, written under a short lock.
 * A run that dies without tidying up is found by its process id and dropped.
 * Checkouts on different versions of this file share that ledger, so every run also
 * carries the fields all of them read, `cores` and `gpu` (see `asLedgered`).
 *
 * The rules (`demand`, `admit`) are pure, and unit-tested; the rest is I/O.
 */
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The game pages the integrated Radeon holds. It shares the laptop's memory, and six
 * pages at 3440x1440 at once bugchecked its driver (0x119, a video scheduler fault,
 * the whole machine down). Chrome draws on it, whatever is plugged in, unless it's
 * launched with `--force-high-performance-gpu`, and even then composites its pages
 * there: measured, a page drawn on the eGPU holds memory and 3D engine time on the
 * Radeon too. So every page on a GPU is one of these.
 */
export const RADEON_PAGES = 4;

/**
 * The eGPU's memory that is shared out, in MiB: 11 GB of its 12, the rest left to the
 * driver and to what a job takes beyond what it declared. Being busy only slows it,
 * but running out fails whatever allocates next. Eight game pages at once passed,
 * and twelve failed.
 */
const EGPU_MIB = 11 * 1024;

/**
 * What a game page holds of the eGPU's memory while it draws. Measured on the WebGPU
 * specs by Windows' per-process counter: up to 1,191 MiB for one page, 2,201 for two.
 */
export const PAGE_MIB = 1200;

/** An e2e run's workers: as many as fit the Radeon running two-player tests. */
const E2E_WORKERS = RADEON_PAGES / 2;

/**
 * What each kind of run takes. `cores` is what the run is held to, `radeon` the pages
 * it may have open at once there, `egpu` the MiB it may hold on the eGPU. A run with
 * `withoutEgpu` can do without the eGPU, on that many Radeon pages in all; any other
 * that claims the eGPU refuses to run while it's unplugged. `e2e` here is the most it
 * takes on its usual workers: a run claims what its own specs use (e2e-claims.mjs).
 */
export const KINDS = {
  unit: { cores: 4, testWorkers: 4 },
  slow: { cores: 6, testWorkers: 6 },
  e2e: { cores: 5, radeon: RADEON_PAGES, egpu: RADEON_PAGES * PAGE_MIB, withoutEgpu: RADEON_PAGES, e2eWorkers: E2E_WORKERS },
  browser: { cores: 2, radeon: 2 },
  "browser-egpu": { cores: 2, radeon: 2, egpu: 2 * PAGE_MIB },
  check: { cores: 2 },
  build: { cores: 4 },
  // Every unit, slow and e2e test, unscoped: the whole machine, so it waits to be alone.
  all: { cores: 1000, radeon: RADEON_PAGES, egpu: EGPU_MIB, withoutEgpu: RADEON_PAGES, e2eWorkers: E2E_WORKERS },
};

/** Every kind as it is written on the command line. */
export const USAGE = `${Object.keys(KINDS).join("|")}|cores:N[+radeon:PAGES][+egpu:GB]`;

/** Two cores are left for the owner, the editors and the agents themselves. */
export const BUDGET = { cores: Math.max(2, os.availableParallelism() - 2), radeon: RADEON_PAGES, egpu: EGPU_MIB };

/** What a kind asks for: a name from `KINDS`, or `cores:N` and the GPUs it declares, for other heavy work. */
export function demand(kind) {
  if (Object.hasOwn(KINDS, kind)) return { radeon: 0, egpu: 0, ...KINDS[kind] };
  const [cores, ...declared] = kind.split("+");
  const count = /^cores:([1-9]\d*)$/.exec(cores);
  if (count === null) throw new Error(`unknown kind "${kind}": one of ${USAGE}`);
  const claim = { cores: Number(count[1]), radeon: 0, egpu: 0 };
  for (const part of declared) {
    const [name, amount, extra] = part.split(":");
    const value = Number(amount);
    const known = name === "egpu" || (name === "radeon" && Number.isInteger(value));
    if (!known || extra !== undefined || !(value > 0) || claim[name] !== 0) {
      throw new Error(`"${part}" in "${kind}" isn't a GPU claim: radeon:PAGES or egpu:GB, each once`);
    }
    claim[name] = name === "egpu" ? Math.ceil(value * 1024) : value;
  }
  return fitting(claim);
}

/**
 * A claim, refused when a GPU couldn't hold it even alone. A run bigger than the CPU
 * only runs slower, so it runs alone; a GPU past its limit crashes or fails what's on it.
 */
export function fitting(claim) {
  if (claim.radeon > RADEON_PAGES) {
    throw new Error(`${claim.radeon} pages don't fit the Radeon: it holds ${RADEON_PAGES}, and more has crashed its driver`);
  }
  if (claim.egpu > EGPU_MIB) {
    throw new Error(`${gigabytes(claim.egpu)} doesn't fit the eGPU: ${gigabytes(EGPU_MIB)} of its 12 is shared out`);
  }
  return claim;
}

const gigabytes = (mib) => `${Number((mib / 1024).toFixed(1))} GB`;

const gpusOf = ({ radeon, egpu }) => [radeon > 0 && `${radeon} Radeon pages`, egpu > 0 && `${gigabytes(egpu)} of the eGPU`].filter(Boolean);

/** A claim in words. */
export function describe(claim) {
  return [`${claim.cores} cores`, ...gpusOf(claim)].join(", ");
}

/**
 * What a ledgered run claims. One with no `radeon` was written by a checkout that
 * counts one pool of pages: its e2e specs may be on either GPU, so they count on
 * both, and its browsers on the Radeon.
 */
export function claimOf(run) {
  if (run.radeon !== undefined) return { cores: run.cores, radeon: run.radeon, egpu: run.egpu, withoutEgpu: run.withoutEgpu };
  const pages = Math.min(run.gpu, RADEON_PAGES);
  if (run.kind === "e2e") return { cores: run.cores, radeon: pages, egpu: pages * PAGE_MIB, withoutEgpu: pages };
  if (run.kind === "all") return { cores: run.cores, radeon: pages, egpu: EGPU_MIB, withoutEgpu: pages };
  return { cores: run.cores, radeon: pages, egpu: 0 };
}

/** What a claim comes to with the eGPU as it is, or null when it needs an eGPU that isn't plugged in. */
export function resolveClaim(claim, plugged) {
  if (plugged || claim.egpu === 0) return claim;
  if (claim.withoutEgpu === undefined) return null;
  return { cores: claim.cores, radeon: claim.withoutEgpu, egpu: 0 };
}

/**
 * The order a waiting run takes its resources in. The eGPU is first, as its jobs hold
 * it for hours and nothing else should be held through that wait; cores are last, as
 * every run needs them.
 */
const ORDER = ["egpu", "radeon", "cores"];

/**
 * Which waiting runs may start now, and what each other one waits for. `runs` are
 * every run in the ledger, oldest first.
 *
 * A waiting run takes its resources in `ORDER` up to the first it can't have: it holds
 * its place there and in those before it, and in none after. So a run waiting for a
 * GPU holds up neither the cores nor work on a GPU after it, and still none is starved:
 * nothing younger can take what it holds, so each wait ends when the runs ahead of it
 * do, down to the cores, where a big run stops the line until it starts. A run bigger
 * than all the cores starts once it would be alone.
 */
export function admit(runs, { budget = BUDGET, plugged = true } = {}) {
  const used = { cores: 0, radeon: 0, egpu: 0 };
  for (const run of runs) {
    if (run.state !== "running") continue;
    const claimed = claimOf(run);
    // Pulled out under a run, the eGPU's browsers come back on the Radeon, so they count there.
    const claim = resolveClaim(claimed, plugged) ?? claimed;
    for (const resource of ORDER) used[resource] += claim[resource];
  }
  const start = [];
  const waitsFor = new Map();
  for (const run of runs) {
    if (run.state !== "waiting") continue;
    const claim = resolveClaim(claimOf(run), plugged);
    // It leaves when it sees the eGPU gone, so it holds no place.
    if (claim === null) continue;
    let short;
    for (const resource of ORDER) {
      if (claim[resource] === 0) continue;
      const alone = resource === "cores" && used.cores === 0;
      const fits = alone || used[resource] + claim[resource] <= budget[resource];
      used[resource] += claim[resource];
      if (!fits) {
        short = resource;
        break;
      }
    }
    if (short === undefined) start.push(run.id);
    else waitsFor.set(run.id, short);
  }
  return { start, waitsFor };
}

/** More pages than a checkout that counts one pool ever has free. */
const NEVER_FITS = 1000;

/**
 * A run as it is written. `gpu` is for a checkout that counts one pool of pages and
 * starts whatever fits it. Running, it is the Radeon's pages, which that pool is sized
 * for. Waiting for the eGPU, it fits no such pool: that checkout can't see whether the
 * eGPU has room, so it can start the run only on an empty machine.
 */
export function asLedgered(run, claim) {
  const gpu = run.state === "waiting" && claim.egpu > 0 ? NEVER_FITS : claim.radeon;
  return { ...run, cores: claim.cores, radeon: claim.radeon, egpu: claim.egpu, withoutEgpu: claim.withoutEgpu, gpu };
}

/**
 * Whether the eGPU is plugged in and working, from Windows' list of connected display
 * devices: an unplugged one isn't listed, and a failed one isn't started. nvidia-smi
 * isn't asked, since a card that has faulted can hang what talks to it.
 */
export function egpuPlugged() {
  if (process.platform !== "win32") return false;
  const pnputil = path.join(process.env.SystemRoot, "System32", "pnputil.exe");
  return egpuIn(execFileSync(pnputil, ["/enum-devices", "/connected", "/class", "Display"], { encoding: "utf8", windowsHide: true }));
}

/** Whether a started Nvidia card is in pnputil's list. */
export function egpuIn(devices) {
  return devices.split(/\r?\n\r?\n/).some((device) => device.includes("VEN_10DE") && /Status:\s+Started/.test(device));
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
export function enqueue(dir, { kind, claim, who, command }) {
  const id = `${Date.now().toString().padStart(15, "0")}-${process.pid}`;
  const run = asLedgered({ id, pid: process.pid, kind, who, cwd: process.cwd(), command, state: "waiting", queuedAt: new Date().toISOString() }, claim);
  locked(dir, () => writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(run)));
  return id;
}

/**
 * Starts whatever may start, and says where that leaves the run `id`: running on
 * `claim`, waiting for a resource, or unplugged from the eGPU it needs. `started` is
 * each run it started as it found the ledger then, for the budget's log: what was
 * already running beside it, and who was waiting ahead of it and for what.
 */
export function tryStart(dir, id, plugged = egpuPlugged()) {
  return locked(dir, () => {
    const runs = readRuns(dir);
    const { start, waitsFor } = admit(runs, { plugged });
    const write = (run) => writeFileSync(run.file, JSON.stringify({ ...run, file: undefined }));
    const beside = [0, 0, 0];
    const take = ({ cores, radeon, egpu }) => [cores, radeon, egpu].forEach((value, i) => (beside[i] += value));
    for (const run of runs) if (run.state === "running") take(resolveClaim(claimOf(run), plugged) ?? claimOf(run));
    const ahead = [];
    const started = [];
    for (const run of runs) {
      if (!start.includes(run.id)) {
        if (waitsFor.has(run.id)) ahead.push([run.id, waitsFor.get(run.id)]);
        continue;
      }
      const startsOn = resolveClaim(claimOf(run), plugged);
      const at = Date.now();
      started.push({ t: at, id: run.id, claim: [startsOn.cores, startsOn.radeon, startsOn.egpu], beside: [...beside], ahead: [...ahead] });
      take(startsOn);
      Object.assign(run, { state: "running", startedAt: new Date(at).toISOString() });
      // A run from a checkout that counts one pool keeps the claim it was written with.
      if (run.radeon !== undefined) Object.assign(run, asLedgered(run, startsOn));
      write(run);
    }
    const self = runs.find((run) => run.id === id);
    if (self === undefined) throw new Error(`run ${id} is no longer in the machine's ledger`);
    const claim = resolveClaim(claimOf(self), plugged);
    if (claim === null) return { state: "unplugged", started };
    if (self.state === "waiting") return { state: "waiting", waitsFor: waitsFor.get(id), started };
    // Whoever started it, it is written as what it really runs on.
    const running = asLedgered(self, claim);
    if (running.gpu !== self.gpu || running.egpu !== self.egpu) write(running);
    return { state: "running", claim, started };
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
 * Fails loudly when heavy work starts outside the budget, or in a slot that doesn't
 * hold what it uses: tests, e2e and the browser tools call this, so a run started
 * wrongly says how to run it instead. `radeon` and `egpu` are what the caller puts on
 * each GPU, and `kinds` the slots it must be in.
 */
export function requireSlot(what, { interactiveOk = false, kinds = /** @type {string[]} */ ([]), radeon = 0, egpu = 0 } = {}) {
  const slot = process.env.MACHINE_SLOT;
  if (slot !== undefined) {
    if (kinds.length > 0 && !kinds.includes(slot)) {
      throw new Error(`${what} runs in a slot of kind ${kinds.join(" or ")}, not ${slot}. See "Sharing the machine" in CLAUDE.md.`);
    }
    requireClaimed(what, { radeon, egpu });
    return;
  }
  // The owner at a terminal (vitest's watch mode, say) is one person, not a fleet of agents.
  if (interactiveOk && process.stdout.isTTY) return;
  throw new Error(
    `${what} runs only through the machine's budget, so parallel sessions don't overload it: ` +
      "use the npm script (npm run test, test:slow, test:e2e, typecheck, lint), or wrap the command: " +
      `npm run slot -- <${USAGE}> -- <command>. See "Sharing the machine" in CLAUDE.md.`,
  );
}

/** Fails when the slot this process is in doesn't hold these amounts of each GPU. */
export function requireClaimed(what, { radeon, egpu }) {
  // The slot of a checkout that counts one pool doesn't say what it holds.
  if (process.env.MACHINE_CLAIM === undefined) return;
  const held = JSON.parse(process.env.MACHINE_CLAIM);
  if (radeon <= held.radeon && egpu <= held.egpu) return;
  throw new Error(
    `${what} uses ${gpusOf({ radeon, egpu }).join(" and ")}, but its slot holds ${describe(held)}: ` +
      "run it in a kind that claims that GPU (browser for the Radeon, browser-egpu for the eGPU, or cores:N+radeon:PAGES+egpu:GB).",
  );
}
