#!/usr/bin/env node
/**
 * Whether the machine has the capacity a test run assumes — read before
 * treating a timeout as a defect.
 *
 * Several agents and sessions often test in parallel on one machine, each in
 * its own checkout or worktree, and each run sizes its worker pool to the whole
 * machine. When they saturate it, correct tests miss their timeouts, and the
 * failure looks exactly like a slow or racing test. This reports the two facts
 * that tell the cases apart: how busy the CPU is right now, and which test runs
 * are in progress and in which checkout — so a reader knows whether to wait,
 * and whom to agree a re-run with.
 *
 * It never waits, locks or throttles anything; it only reports.
 *
 *   npm run load
 *
 * Works on Windows, Linux and macOS: CPU use comes from Node's own `os`
 * counters, sampled over a second; the process list from `ps`, or from the
 * Windows process table where there is no `ps`.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** At or above this share of the CPU, a timeout says nothing about the test. */
const SATURATED = 0.9;
const SAMPLE_MS = 1000;
const SAMPLES = 3;

/** Total and idle CPU time across every core since boot. */
function cpuTimes() {
  let total = 0;
  let idle = 0;
  for (const { times } of os.cpus()) {
    total += times.user + times.nice + times.sys + times.irq + times.idle;
    idle += times.idle;
  }
  return { total, idle };
}

/** The share of the CPU in use over one sample, 0 to 1. */
async function cpuSample() {
  const before = cpuTimes();
  await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
  const after = cpuTimes();
  const total = after.total - before.total;
  return total > 0 ? 1 - (after.idle - before.idle) / total : 0;
}

/**
 * The busiest of a few consecutive samples. A test run has lulls between
 * files, and one sample that lands in a lull would report capacity in the
 * middle of a saturated stretch — the wrong direction for this question.
 */
async function cpuUse() {
  let busiest = 0;
  for (let i = 0; i < SAMPLES; i++) busiest = Math.max(busiest, await cpuSample());
  return busiest;
}

/** Every process's id and command line; an empty list if they cannot be read. */
function processes() {
  try {
    if (process.platform === "win32") {
      const json = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      const rows = JSON.parse(json);
      return (Array.isArray(rows) ? rows : [rows])
        .filter((row) => typeof row.CommandLine === "string")
        .map((row) => ({ pid: row.ProcessId, args: row.CommandLine }));
    }
    return execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter((match) => match !== null)
      .map((match) => ({ pid: Number(match[1]), args: match[2] }));
  } catch {
    return [];
  }
}

/**
 * What kind of test run a process is the entry point of, or `null`. Only entry
 * points count: a vitest run's forked workers are part of the run, not runs of
 * their own.
 */
function testRunKind(args) {
  if (/[\\/]vitest[\\/]vitest\.mjs\b/.test(args)) return "vitest";
  if (/[\\/]@playwright[\\/]test[\\/]cli\.js\b|[\\/]playwright[\\/]cli\.js\b/.test(args)) {
    return "playwright";
  }
  return null;
}

/** The checkout a run belongs to: the directory above its `node_modules` or `scripts`. */
function checkoutOf(args) {
  const match = args.match(/([A-Za-z]:[\\/][^"]*?|\/[^"\s]*?)[\\/](?:node_modules|scripts)[\\/]/);
  return match ? path.resolve(match[1]) : null;
}

/** Two paths as one, ignoring case where the file system does. */
function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Sampled before the process list is read, so reading it is not in the sample.
const use = await cpuUse();
const all = processes();
const here = path.resolve(process.cwd());
const runs = all
  .filter((p) => p.pid !== process.pid)
  .map((p) => ({ kind: testRunKind(p.args), checkout: checkoutOf(p.args) }))
  .filter((run) => run.kind !== null);

/**
 * Where a run is, as precisely as its command line allows. A run is attributed
 * by the `node_modules` it was started from, and a worktree nested inside a
 * checkout has none of its own — it resolves upward to the enclosing
 * checkout's — so a run attributed to a checkout holding nested worktrees may
 * be in any of them. The process table carries no working directory to settle
 * it, so the label says so rather than guessing.
 */
function placeOf(checkout) {
  if (checkout === null) return "an unknown checkout";
  const mine = samePath(checkout, here) ? "this checkout" : null;
  const nests = existsSync(path.join(checkout, ".claude", "worktrees"))
    ? "or a worktree nested inside it"
    : null;
  const notes = [mine, nests].filter((note) => note !== null).join(", ");
  return notes === "" ? checkout : `${checkout} (${notes})`;
}

const percent = Math.round(use * 100);
console.log(`CPU: ${percent}% in use across ${os.cpus().length} logical cores (busiest of ${SAMPLES} one-second samples).`);
if (all.length === 0) {
  console.log("Test runs: could not read the process list.");
} else if (runs.length === 0) {
  console.log("Test runs in progress: none.");
} else {
  console.log(`Test runs in progress: ${runs.length}.`);
  for (const run of runs) console.log(`  - ${run.kind} in ${placeOf(run.checkout)}`);
}

// Every run counts toward the verdict, the reader's own checkout's included:
// a run cannot be told apart from one in a nested worktree, and erring toward
// "other runs are saturating the machine" is the safe direction here.
if (use >= SATURATED && runs.length > 0) {
  console.log(
    "Verdict: saturated, with test runs in progress. A timeout now is most likely contention, not a defect — wait for capacity or agree with the other agents and sessions who runs what, then re-run that one file once.",
  );
} else if (use >= SATURATED) {
  console.log(
    "Verdict: saturated, but not by a test run. Something else is using the machine; a timeout now still says little about the test.",
  );
} else {
  console.log(
    "Verdict: the machine has capacity. A timeout now is evidence about the test — reason about the code to a named cause.",
  );
}
