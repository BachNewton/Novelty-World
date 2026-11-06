/**
 * Reading how loaded the machine is, and by whom: the CPU and GPU, the test
 * runs in progress and the other work driving headless browsers, each with its
 * checkout. `npm run load` (scripts/load.mjs) reports it on demand; the test
 * runners' load reporters (scripts/load-reporters.mjs) report it with every
 * failed run, since an agent reads a failure but may not think to ask.
 *
 * Several agents and sessions often test in parallel on one machine, each run
 * sizing its workers to the whole machine. When they saturate it, correct tests
 * miss their timeouts, and the failure looks exactly like a slow or racing
 * test. Everything here only reports: it never waits, locks or throttles.
 *
 * Works on Windows, Linux and macOS. On Windows the processes come from its
 * process table and the GPU from its performance counters; elsewhere the
 * processes come from `ps`, and the GPU is not measured.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * At or above this share of the CPU or of the GPU's busiest engine, work
 * queues, and a timeout says nothing about the test. Below it the CPU still
 * finds a core for every run, so a lower CPU line would not catch what slows a
 * browser test below it: browsers contending for the one GPU, its memory and
 * the chip's shared power budget, which no CPU share measures. Browser work in
 * progress is counted by its presence instead.
 */
export const SATURATED = 0.9;

/** Total and idle CPU time across every core since boot, and when it was read. */
export function cpuTimes() {
  let total = 0;
  let idle = 0;
  for (const { times } of os.cpus()) {
    total += times.user + times.nice + times.sys + times.irq + times.idle;
    idle += times.idle;
  }
  return { at: Date.now(), total, idle };
}

/**
 * The share of the CPU in use between two readings, 0 to 1. The OS keeps only
 * running totals, so a share is always over the time between two of them.
 */
export function cpuShare(before, after) {
  const total = after.total - before.total;
  return total > 0 ? 1 - (after.idle - before.idle) / total : 0;
}

const WINDOWS_PROCESSES = `$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine)`;

/**
 * The CPU and the GPU's engines sampled together, after the process table is
 * read, so neither PowerShell's start nor the read is in the samples. Each
 * sample holds the CPU's use and every process's use of every GPU engine.
 *
 * A process that exits between a sample's two readings leaves its engine
 * readings invalid (a nonzero `Status`), and Get-Counter reports that as an
 * error while still returning every sample; those readings are dropped, as the
 * process is gone. Only no samples at all means the counters could not be read.
 */
const windowsCounters = (samples) => `
$cpu = @(); $gpu = @(); $countersError = $null
$sets = @(Get-Counter '\\Processor(_Total)\\% Processor Time','\\GPU Engine(*)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${samples} -ErrorAction SilentlyContinue -ErrorVariable failures)
if ($sets.Count -eq 0) { $countersError = "$($failures | Select-Object -First 1)" }
$i = 0
foreach ($set in $sets) {
  foreach ($s in $set.CounterSamples) {
    if ($s.Status -ne 0) { continue }
    if ($s.Path -like '*\\processor(_total)\\*') { $cpu += $s.CookedValue }
    elseif ($s.CookedValue -gt 0) { $gpu += [pscustomobject]@{ sample = $i; engine = $s.InstanceName; use = $s.CookedValue } }
  }
  $i++
}
`;

async function powershell(script) {
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function windowsProcesses(rows) {
  return rows
    .filter((row) => typeof row.CommandLine === "string")
    .map((row) => ({ pid: row.ProcessId, ppid: row.ParentProcessId, args: row.CommandLine }));
}

async function psProcesses() {
  const { stdout } = await run("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" });
  return stdout
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match !== null)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }));
}

/** Every process (id, parent id, command line); an empty list if they cannot be read. */
export async function readProcesses() {
  try {
    if (process.platform !== "win32") return await psProcesses();
    const read = await powershell(`${WINDOWS_PROCESSES}\nConvertTo-Json -Compress -Depth 2 -InputObject $processes`);
    return windowsProcesses(Array.isArray(read) ? read : [read]);
  } catch {
    return [];
  }
}

/**
 * Every process, the CPU's use over the busiest of a few one-second samples
 * where the platform's counters give it (`null` where the caller must sample
 * it), and the GPU's use, or why it could not be read.
 */
export async function readMachine(samples) {
  if (process.platform !== "win32") {
    return { processes: await readProcesses(), cpu: null, gpu: { error: "not measured on this platform" } };
  }
  let read;
  try {
    read = await powershell(
      `${WINDOWS_PROCESSES}\n${windowsCounters(samples)}\n@{ processes = $processes; cpu = $cpu; gpu = $gpu; countersError = $countersError } | ConvertTo-Json -Compress -Depth 3`,
    );
  } catch (error) {
    return { processes: [], cpu: null, gpu: { error: `could not be read (${error.message.split("\n")[0]})` } };
  }
  const processes = windowsProcesses(read.processes);
  if (read.countersError !== null || read.cpu.length === 0) {
    const error = `Windows' performance counters could not be read (${(read.countersError ?? "no CPU readings").trim()})`;
    return { processes, cpu: null, gpu: { error } };
  }
  return { processes, cpu: Math.max(...read.cpu) / 100, gpu: gpuUse(read.gpu) };
}

/**
 * The GPU's use as Task Manager counts it: each engine's use summed over the
 * processes using it, and the busiest engine is the GPU's use. Of the samples,
 * the busiest: a test run has lulls between files, and one sample that lands
 * in a lull would report capacity in the middle of a saturated stretch.
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

/**
 * The script a Node command line runs, as written, or `null`: the first script
 * outside `node_modules`, past the loaders a launcher like `tsx` preloads.
 */
function scriptOf(args) {
  const scripts = [...args.matchAll(/(?:^|\s)"?([^\s"]+\.(?:[cm]?js|[cm]?ts))"?(?=\s|$)/g)].map((match) => match[1]);
  return scripts.find((script) => !/node_modules|^file:/.test(script)) ?? null;
}

/** A script's name for a reader: relative to its checkout where it is written out in full. */
function scriptName(script) {
  if (!/^(?:[A-Za-z]:)?[\\/]/.test(script)) return script;
  const checkout = checkoutHolding(path.dirname(nativePath(script)));
  return checkout === null ? script : path.relative(checkout, nativePath(script));
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
  const moves = [
    ...args.matchAll(
      /\b(?:cd|Set-Location|pushd)\s+(?:-(?:Literal)?Path\s+)?["'\\]*([A-Za-z]:[\\/][^"';&|\s]*|\/[^"';&|\s]+)/g,
    ),
  ];
  return moves.length > 0 ? nativePath(moves[moves.length - 1][1]) : null;
}

/** The checkout a run belongs to by its command line: the directory above its `node_modules` or `scripts`. */
function checkoutOf(args) {
  const match = args.match(/([A-Za-z]:[\\/][^"\s]*?|\/[^"\s]*?)[\\/](?:node_modules|scripts)[\\/]/);
  return match ? path.resolve(match[1]) : null;
}

/** Two paths as one, ignoring case where the file system does. */
function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * The test runs in progress and the browser work outside them, from a process
 * list, leaving out `self` (a process id) and everything it started: a test
 * run reporting on the machine around it is not its own neighbour.
 *
 * Each test run counts the headless browsers under it; browser work outside a
 * run is grouped by the Node script that drives it, the nearest Node ancestor
 * of each browser, so a tool behind `npm run`, `mise` or `tsx` is named by its
 * own script, not by the launcher.
 */
export function workIn(processes, { self = process.pid, here = process.cwd() } = {}) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));

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

  function label(checkout, fromNodeModules) {
    const mine = samePath(checkout, path.resolve(here)) ? "this checkout" : null;
    const nests =
      fromNodeModules && existsSync(path.join(checkout, ".claude", "worktrees"))
        ? "or a worktree nested inside it"
        : null;
    const notes = [mine, nests].filter((note) => note !== null).join(", ");
    return notes === "" ? checkout : `${checkout} (${notes})`;
  }

  /**
   * Where a process runs, as precisely as the process table allows. It carries
   * no working directory, so the best evidence is the shell that started the
   * work changing into it (an agent's shell always does), then an absolute
   * script path, and last the `node_modules` a run was started from. That last
   * is the weakest: a worktree nested inside a checkout has no `node_modules`
   * of its own and resolves upward to the enclosing checkout's, so the run may
   * be in any of them, and the label says so rather than guessing.
   */
  function placeOf(p) {
    for (const at of lineage(p)) {
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

  const others = processes.filter((p) => !lineage(p).some((at) => at.pid === self));
  const runs = new Map(
    others
      .filter((p) => testRunKind(p.args) !== null)
      .map((p) => [p.pid, { pid: p.pid, kind: testRunKind(p.args), place: placeOf(p), browsers: 0 }]),
  );
  const tools = new Map();
  for (const browser of others.filter((p) => isPlaywrightBrowser(p.args))) {
    const chain = lineage(browser).slice(1);
    const owner = chain.find((at) => runs.has(at.pid));
    if (owner !== undefined) {
      runs.get(owner.pid).browsers++;
      continue;
    }
    const driver = chain.find((at) => isNode(at.args)) ?? browser;
    const script = scriptOf(driver.args);
    const tool = tools.get(driver.pid) ?? {
      pid: driver.pid,
      name:
        driver === browser
          ? "a browser with no Node script above it"
          : script === null
            ? "a Node process"
            : scriptName(script),
      place: placeOf(driver),
      browsers: 0,
    };
    tool.browsers++;
    tools.set(driver.pid, tool);
  }
  return { runs: [...runs.values()], tools: [...tools.values()] };
}

/** Two readings of the work in progress as one: everything either saw. */
export function mergeWork(a, b) {
  const merge = (x, y) => [...new Map([...x, ...y].map((item) => [item.pid, item])).values()];
  return { runs: merge(a.runs, b.runs), tools: merge(a.tools, b.tools) };
}

export const browsers = (count) => (count === 1 ? "1 headless browser" : `${count} headless browsers`);
export const percent = (share) => `${Math.round(share * 100)}%`;

/** The lines listing the work in progress; `other` when it leaves out the reader's own run. */
export function describeWork({ runs, tools }, { other = false } = {}) {
  const runsLabel = other ? "Other test runs in progress" : "Test runs in progress";
  const toolsLabel = other ? "Other browser work outside test runs" : "Browser work outside test runs";
  const lines = [runs.length === 0 ? `${runsLabel}: none.` : `${runsLabel}: ${runs.length}.`];
  for (const run of runs) {
    const driving = run.browsers > 0 ? `, driving ${browsers(run.browsers)}` : "";
    lines.push(`  - ${run.kind} in ${run.place}${driving}`);
  }
  lines.push(tools.length === 0 ? `${toolsLabel}: none.` : `${toolsLabel}: ${tools.length}.`);
  for (const tool of tools) lines.push(`  - ${tool.name} in ${tool.place}, driving ${browsers(tool.browsers)}`);
  return lines;
}

export function browserCount({ runs, tools }) {
  return [...runs, ...tools].reduce((sum, work) => sum + work.browsers, 0);
}
