#!/usr/bin/env node
/**
 * Whether the machine has the capacity a test run assumes — read before
 * treating a timeout as a defect.
 *
 * Several agents and sessions often test in parallel on one machine, each in
 * its own checkout or worktree, and each run sizes its worker pool to the whole
 * machine. When they saturate it, correct tests miss their timeouts, and the
 * failure looks exactly like a slow or racing test. This reports the facts that
 * tell the cases apart: how busy the CPU and the GPU are right now, which test
 * runs are in progress, and which other work is driving headless browsers, each
 * with its checkout — so a reader knows whether to wait, and whom to agree a
 * re-run with.
 *
 * It never waits, locks or throttles anything; it only reports.
 *
 *   npm run load
 *
 * Works on Windows, Linux and macOS: CPU use comes from Node's own `os`
 * counters, sampled over a second; the process list from `ps`, or from the
 * Windows process table where there is no `ps`. GPU use is read only on
 * Windows, from its `GPU Engine` performance counters.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * At or above this share of the CPU or of the GPU's busiest engine, work
 * queues, and a timeout says nothing about the test. Below it the CPU still
 * finds a core for every run, so a lower CPU line would not catch what slows a
 * browser test below it: browsers contending for the one GPU, its memory and
 * the chip's shared power budget, which no CPU share measures. Browser work in
 * progress is counted by its presence instead (see the verdict).
 */
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

/**
 * The Windows process table and the GPU's engine counters, read in one
 * PowerShell call since starting PowerShell costs more than either. The
 * counters are sampled like the CPU, a second at a time; each sample lists
 * every process's use of every engine.
 */
const WINDOWS_READ = `
$gpu = @(); $gpuError = $null
try {
  $sets = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -SampleInterval ${SAMPLE_MS / 1000} -MaxSamples ${SAMPLES} -ErrorAction Stop
  $i = 0
  foreach ($set in $sets) {
    foreach ($s in $set.CounterSamples) { if ($s.CookedValue -gt 0) { $gpu += [pscustomobject]@{ sample = $i; engine = $s.InstanceName; use = $s.CookedValue } } }
    $i++
  }
} catch { $gpuError = $_.Exception.Message }
$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine)
@{ processes = $processes; gpu = $gpu; gpuError = $gpuError } | ConvertTo-Json -Compress -Depth 3
`;

/**
 * Every process (id, parent id, command line) and the GPU's use, or why
 * either could not be read.
 */
function readMachine() {
  if (process.platform !== "win32") {
    try {
      const processes = execFileSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" })
        .split("\n")
        .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
        .filter((match) => match !== null)
        .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }));
      return { processes, gpu: { error: "not measured on this platform" } };
    } catch {
      return { processes: [], gpu: { error: "not measured on this platform" } };
    }
  }
  let read;
  try {
    read = JSON.parse(
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_READ], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (error) {
    return { processes: [], gpu: { error: `could not be read (${error.message.split("\n")[0]})` } };
  }
  const processes = read.processes
    .filter((row) => typeof row.CommandLine === "string")
    .map((row) => ({ pid: row.ProcessId, ppid: row.ParentProcessId, args: row.CommandLine }));
  const gpu =
    read.gpuError === null
      ? gpuUse(read.gpu)
      : { error: `Windows' GPU Engine counters could not be read (${read.gpuError.trim()})` };
  return { processes, gpu };
}

/**
 * The GPU's use as Task Manager counts it: each engine's use summed over the
 * processes using it, and the busiest engine is the GPU's use. Of the samples,
 * the busiest, for the same reason as the CPU's.
 */
function gpuUse(rows) {
  const engines = new Map();
  for (const { sample, engine, use } of rows) {
    const key = `${sample} ${engine.replace(/^pid_\d+_/, "")}`;
    engines.set(key, (engines.get(key) ?? 0) + use);
  }
  let busiest = { use: 0, type: null };
  for (const [key, use] of engines) {
    if (use > busiest.use) busiest = { use, type: key.match(/engtype_(.*)$/)?.[1] ?? null };
  }
  return { use: Math.min(busiest.use, 100) / 100, type: busiest.type };
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

/**
 * Whether a process is a headless browser Playwright launched: its top
 * process, not the GPU, renderer and utility processes it starts under itself
 * (`--type=`). Playwright's own Chromium lives in `ms-playwright`, and every
 * browser it launches gets a `playwright_chromiumdev_profile` profile.
 */
function isPlaywrightBrowser(args) {
  return /ms-playwright|playwright_chromiumdev_profile/.test(args) && !/--type=/.test(args);
}

/** Whether a process is Node running a script. */
function isNode(args) {
  return /(?:^|[\\/"\s])node(?:\.exe)?"?\s/i.test(args);
}

/** The script a Node command line runs, as written, or `null`. */
function scriptOf(args) {
  return args.match(/(?:^|\s)"?([^\s"]+\.(?:[cm]?js|[cm]?ts))"?(?:\s|$)/)?.[1] ?? null;
}

/** A path as this platform writes it: Git Bash's `/c/…` is `C:\…` on Windows. */
function nativePath(written) {
  const drive = written.match(/^\/([a-zA-Z])(\/.*)?$/);
  if (process.platform === "win32" && drive) return path.resolve(`${drive[1].toUpperCase()}:${drive[2] ?? "/"}`);
  return path.resolve(written);
}

/** The git checkout (a repository or a worktree) holding a directory, or `null`. */
function checkoutHolding(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    if (existsSync(path.join(at, ".git"))) return at;
    if (path.dirname(at) === at) return null;
  }
}

/** The last absolute directory a shell command line changes into, or `null`. */
function cdOf(args) {
  const moves = [...args.matchAll(/\b(?:cd|Set-Location|pushd)\s+(?:-(?:Literal)?Path\s+)?["'\\]*([A-Za-z]:[\\/][^"';&|\s]*|\/[^"';&|\s]+)/g)];
  return moves.length > 0 ? nativePath(moves[moves.length - 1][1]) : null;
}

/** The checkout a run belongs to by its command line: the directory above its `node_modules` or `scripts`. */
function checkoutOf(args) {
  const match = args.match(/([A-Za-z]:[\\/][^"]*?|\/[^"\s]*?)[\\/](?:node_modules|scripts)[\\/]/);
  return match ? path.resolve(match[1]) : null;
}

/** Two paths as one, ignoring case where the file system does. */
function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Sampled before the machine is read, so reading it is not in the sample.
const cpu = await cpuUse();
const { processes, gpu } = readMachine();
const byPid = new Map(processes.map((p) => [p.pid, p]));
const here = path.resolve(process.cwd());

/** A process and its ancestors, nearest first; a cycle of reused ids ends it. */
function lineage(p) {
  const chain = [];
  const seen = new Set();
  for (let at = p; at !== undefined && !seen.has(at.pid); at = byPid.get(at.ppid)) {
    seen.add(at.pid);
    chain.push(at);
  }
  return chain;
}

/**
 * Where a process runs, as precisely as the process table allows. It carries
 * no working directory, so the best evidence is the shell that started the
 * work changing into it (an agent's shell always does), then an absolute
 * script path, and last the `node_modules` a run was started from. That last
 * is the weakest: a worktree nested inside a checkout has no `node_modules` of
 * its own and resolves upward to the enclosing checkout's, so the run may be
 * in any of them, and the label says so rather than guessing.
 */
function placeOf(p) {
  const chain = lineage(p);
  for (const at of chain) {
    const cd = cdOf(at.args);
    const checkout = cd === null ? null : checkoutHolding(cd);
    if (checkout !== null) return label(checkout, false);
  }
  const script = scriptOf(p.args);
  if (script !== null && /^(?:[A-Za-z]:)?[\\/]/.test(script)) {
    const checkout = checkoutHolding(path.dirname(nativePath(script)));
    if (checkout !== null) return label(checkout, false);
  }
  const checkout = checkoutOf(p.args);
  return checkout === null ? "an unknown checkout" : label(checkout, true);
}

function label(checkout, fromNodeModules) {
  const mine = samePath(checkout, here) ? "this checkout" : null;
  const nests =
    fromNodeModules && existsSync(path.join(checkout, ".claude", "worktrees"))
      ? "or a worktree nested inside it"
      : null;
  const notes = [mine, nests].filter((note) => note !== null).join(", ");
  return notes === "" ? checkout : `${checkout} (${notes})`;
}

const others = processes.filter((p) => p.pid !== process.pid);
const runs = new Map(
  others
    .filter((p) => testRunKind(p.args) !== null)
    .map((p) => [p.pid, { kind: testRunKind(p.args), place: placeOf(p), browsers: 0 }]),
);

/**
 * Browser work outside a test run, by the Node script that drives it: the
 * nearest Node ancestor of each browser, so a tool behind `npm run`, `mise` or
 * `tsx` is named by its own script, not by the launcher.
 */
const tools = new Map();
for (const browser of others.filter((p) => isPlaywrightBrowser(p.args))) {
  const chain = lineage(browser).slice(1);
  const run = chain.find((at) => runs.has(at.pid));
  if (run !== undefined) {
    runs.get(run.pid).browsers++;
    continue;
  }
  const driver = chain.find((at) => isNode(at.args)) ?? browser;
  const tool = tools.get(driver.pid) ?? {
    name: driver === browser ? "a browser with no Node script above it" : (scriptOf(driver.args) ?? "a Node process"),
    place: placeOf(driver),
    browsers: 0,
  };
  tool.browsers++;
  tools.set(driver.pid, tool);
}

const browsers = (count) => (count === 1 ? "1 headless browser" : `${count} headless browsers`);
const percent = (share) => `${Math.round(share * 100)}%`;

console.log(`CPU: ${percent(cpu)} in use across ${os.cpus().length} logical cores (busiest of ${SAMPLES} one-second samples).`);
if ("error" in gpu) {
  console.log(`GPU: ${gpu.error}.`);
} else {
  const engine = gpu.type === null ? "" : ` (${gpu.type})`;
  console.log(`GPU: ${percent(gpu.use)} on its busiest engine${engine} (busiest of ${SAMPLES} one-second samples).`);
}
if (processes.length === 0) {
  console.log("Test runs and browser work: could not read the process list.");
} else {
  console.log(runs.size === 0 ? "Test runs in progress: none." : `Test runs in progress: ${runs.size}.`);
  for (const run of runs.values()) {
    const driving = run.browsers > 0 ? `, driving ${browsers(run.browsers)}` : "";
    console.log(`  - ${run.kind} in ${run.place}${driving}`);
  }
  console.log(tools.size === 0 ? "Browser work outside test runs: none." : `Browser work outside test runs: ${tools.size}.`);
  for (const tool of tools.values()) console.log(`  - ${tool.name} in ${tool.place}, driving ${browsers(tool.browsers)}`);
}

// Every run and browser counts toward the verdict, the reader's own included:
// one cannot always be told apart from one in a nested worktree, and erring
// toward "other work is loading the machine" is the safe direction here.
const browserCount =
  [...runs.values()].reduce((sum, run) => sum + run.browsers, 0) +
  [...tools.values()].reduce((sum, tool) => sum + tool.browsers, 0);
const busy = [cpu >= SATURATED ? "CPU" : null, !("error" in gpu) && gpu.use >= SATURATED ? "GPU" : null].filter(
  (name) => name !== null,
);
if (busy.length > 0 && (runs.size > 0 || browserCount > 0)) {
  console.log(
    `Verdict: saturated (${busy.join(" and ")}), with test runs or browser work in progress. A timeout now is most likely contention, not a defect — wait for capacity or agree with the other agents and sessions who runs what, then re-run that one file once.`,
  );
} else if (busy.length > 0) {
  console.log(
    `Verdict: saturated (${busy.join(" and ")}), but not by a test run or browser work. Something else is using the machine; a timeout now still says little about the test.`,
  );
} else if (browserCount > 0) {
  console.log(
    `Verdict: contended for browser tests. ${browsers(browserCount)} running share one GPU, its memory and the chip's power budget, which the CPU share doesn't show and the GPU share shows only in part. A browser (e2e) test's timeout now says little — wait for the browser work to finish or agree who runs what, then re-run that one file once. A unit test's timeout is still evidence about the test.`,
  );
} else {
  console.log(
    "Verdict: the machine has capacity. A timeout now is evidence about the test — reason about the code to a named cause.",
  );
}
