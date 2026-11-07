/**
 * The machine's record of test runs: every vitest, slow vitest and Playwright
 * run appends one line to `test-runs.jsonl` in the git common directory, so
 * every checkout and worktree of the repository shares one log and none of it
 * is committed. The load reporters (scripts/load-reporters.mjs) write it at the
 * end of each run; `npm run test-history` (scripts/test-history.mjs) reads it.
 *
 * The log is the evidence for sizing a machine-wide run scheduler: how often
 * tests time out because the machine is saturated, how often those failures
 * are rerun, what the timeouts and reruns cost, and how loaded the machine was
 * at each number of runs going at once.
 *
 * A record (one JSON object per line):
 *   kind        "vitest", "vitest-slow" or "playwright"
 *   checkout    the checkout's top directory; branch: its branch, or "HEAD" when detached
 *   start, end  ms since the epoch
 *   cores, workers
 *   files       { path relative to the checkout: ms spent in it }
 *   passed, failed, skipped, interrupted
 *   cpu         the CPU's share across the run, 0 to 1
 *   cpuSeconds  the CPU's share each second of the run, in whole percent
 *   others      the most other test runs, browser tools and headless browsers
 *               seen in progress at once, or null where the process table wasn't read in time
 *   failures    [{ id, file, timeout, ms, cpu, verdict }]: each failed test, its
 *               own CPU share, and "saturated", "contended" (other browsers
 *               shared the GPU in a browser run) or "capacity"
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const LOG_NAME = "test-runs.jsonl";

/** A checkout's top directory, branch and the shared log's path, from a directory inside it. */
export async function placeOf(cwd) {
  const { stdout } = await run("git", ["rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  });
  const [top, branch, common] = stdout.trim().split(/\r?\n/);
  return { checkout: path.resolve(top), branch, log: path.join(path.resolve(cwd, common), LOG_NAME) };
}

/** A file's path relative to its checkout, written the same on every platform. */
export function relativeFile(checkout, file) {
  return path.relative(checkout, file).split(path.sep).join("/");
}

/**
 * Appends a record as one write of one line, so runs ending together never
 * interleave. A run never fails over its record, but says when it went unwritten.
 */
export function appendRun(log, record) {
  try {
    appendFileSync(log, `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.warn(`Test run log: this run went unrecorded (${error.message.split("\n")[0]}).`);
  }
}

/** Every record in a log, and how many lines could not be read (a write cut short). */
export function readRuns(log) {
  if (!existsSync(log)) return { runs: [], unreadable: 0 };
  const runs = [];
  let unreadable = 0;
  for (const line of readFileSync(log, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      runs.push(JSON.parse(line));
    } catch {
      unreadable++;
    }
  }
  return { runs, unreadable };
}

const SATURATED_PERCENT = 90;

/** What a failure was: a timeout under load, a timeout with capacity, or something else. */
export function failureClass({ timeout, verdict }) {
  if (!timeout) return "other";
  return verdict === "capacity" ? "timeout-capacity" : "timeout-load";
}

/**
 * Chains of reruns: a test failing, and the runs after it in the same checkout
 * that ran its file again, up to the first that passed it. A failure inside a
 * chain belongs to that chain, not a chain of its own.
 *
 * A chain's cost is the failed test's own time plus each rerun's time in the
 * test's file. A rerun that ran several failed tests' file is charged once, to
 * the chain that came first.
 */
export function rerunChains(runs) {
  const ordered = [...runs].sort((a, b) => a.start - b.start);
  const inChain = new Set();
  const charged = new Set();
  const chains = [];
  ordered.forEach((first, at) => {
    for (const failure of first.failures) {
      if (inChain.has(`${at}|${failure.id}`)) continue;
      const chain = {
        id: failure.id,
        checkout: first.checkout,
        kind: first.kind,
        class: failureClass(failure),
        failedMs: failure.ms,
        rerunMs: 0,
        reruns: 0,
        failures: 1,
        outcome: "not rerun",
      };
      for (let next = at + 1; next < ordered.length; next++) {
        const later = ordered[next];
        if (later.checkout !== first.checkout || later.kind !== first.kind || !(failure.file in later.files)) continue;
        chain.reruns++;
        const key = `${next}|${failure.file}`;
        if (!charged.has(key)) {
          charged.add(key);
          chain.rerunMs += later.files[failure.file];
        }
        if (later.failures.some((again) => again.id === failure.id)) {
          inChain.add(`${next}|${failure.id}`);
          chain.failures++;
          chain.outcome = "still failing";
        } else if (later.interrupted) {
          chain.outcome = "interrupted";
          break;
        } else {
          chain.outcome = "passed";
          break;
        }
      }
      chains.push(chain);
    }
  });
  return chains;
}

/**
 * The load over a window, second by second: how many recorded runs were going
 * at once, and the CPU's share (the busiest any run saw that second). Seconds
 * no run covered are left out: the log only sees the machine while it tests.
 */
export function loadTimeline(runs, from, to) {
  const seconds = new Map();
  for (const record of runs) {
    const first = Math.max(Math.floor(record.start / 1000), Math.ceil(from / 1000));
    const last = Math.min(Math.ceil(record.end / 1000) - 1, Math.floor(to / 1000));
    for (let second = first; second <= last; second++) {
      const at = seconds.get(second) ?? { runs: 0, cpu: null };
      at.runs++;
      const cpu = record.cpuSeconds[second - Math.floor(record.start / 1000)];
      if (cpu !== undefined) at.cpu = Math.max(at.cpu ?? 0, cpu);
      seconds.set(second, at);
    }
  }
  return seconds;
}

/** Everything the report says about the runs that ended in a window. */
export function summarize(allRuns, { from, to }) {
  const runs = allRuns.filter((record) => record.end >= from && record.start <= to);

  const kinds = new Map();
  for (const record of runs) {
    const kind = kinds.get(record.kind) ?? { runs: 0, failedRuns: 0, ms: 0 };
    kind.runs++;
    if (record.failed > 0) kind.failedRuns++;
    kind.ms += record.end - record.start;
    kinds.set(record.kind, kind);
  }

  const failures = { "timeout-load": { count: 0, ms: 0 }, "timeout-capacity": { count: 0, ms: 0 }, other: { count: 0, ms: 0 } };
  for (const failure of runs.flatMap((record) => record.failures)) {
    failures[failureClass(failure)].count++;
    failures[failureClass(failure)].ms += failure.ms;
  }

  const chains = rerunChains(runs);
  const rerun = chains.filter((chain) => chain.reruns > 0);
  const offenders = new Map();
  for (const chain of chains) {
    const offender = offenders.get(chain.id) ?? { id: chain.id, failures: 0, reruns: 0, ms: 0, classes: new Set() };
    offender.failures += chain.failures;
    offender.reruns += chain.reruns;
    offender.ms += chain.failedMs + chain.rerunMs;
    offender.classes.add(chain.class);
    offenders.set(chain.id, offender);
  }

  const timeline = loadTimeline(runs, from, to);
  const byConcurrency = new Map();
  let saturated = 0;
  let measured = 0;
  for (const { runs: going, cpu } of timeline.values()) {
    const level = byConcurrency.get(going) ?? { seconds: 0, measured: 0, saturated: 0 };
    level.seconds++;
    if (cpu !== null) {
      level.measured++;
      measured++;
      if (cpu >= SATURATED_PERCENT) {
        level.saturated++;
        saturated++;
      }
    }
    byConcurrency.set(going, level);
  }

  return {
    runs: runs.length,
    kinds,
    failures,
    reruns: {
      chains: rerun.length,
      reruns: rerun.reduce((sum, chain) => sum + chain.reruns, 0),
      passed: rerun.filter((chain) => chain.outcome === "passed").length,
      stillFailing: rerun.filter((chain) => chain.outcome === "still failing").length,
      fromLoadTimeouts: rerun.filter((chain) => chain.class === "timeout-load").length,
      ms: rerun.reduce((sum, chain) => sum + chain.rerunMs, 0),
    },
    notRerun: chains.length - rerun.length,
    offenders: [...offenders.values()].sort((a, b) => b.ms - a.ms),
    load: {
      seconds: timeline.size,
      peakRuns: Math.max(0, ...[...timeline.values()].map((at) => at.runs)),
      peakOthers: Math.max(0, ...runs.map((record) => (record.others === null ? 0 : record.others.runs + 1))),
      saturatedShare: measured > 0 ? saturated / measured : null,
      byConcurrency: [...byConcurrency.entries()].sort(([a], [b]) => a - b),
    },
  };
}

const seconds = (ms) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);
const share = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

/** The report as plain lines. */
export function formatSummary(summary, { hours, unreadable = 0 }) {
  const lines = [`Test runs over the last ${hours} h: ${summary.runs}.`];
  if (summary.runs === 0) return lines;
  for (const [kind, { runs, failedRuns, ms }] of summary.kinds) {
    lines.push(`  ${kind}: ${runs} ${runs === 1 ? "run" : "runs"}, ${failedRuns} with failures, ${seconds(ms)} of run time`);
  }

  const { failures } = summary;
  const total = failures["timeout-load"].count + failures["timeout-capacity"].count + failures.other.count;
  lines.push(`Failed tests: ${total}.`);
  if (total > 0) {
    lines.push(`  timed out under load (saturated or GPU-contended): ${failures["timeout-load"].count}, ${seconds(failures["timeout-load"].ms)} spent`);
    lines.push(`  timed out with capacity: ${failures["timeout-capacity"].count}, ${seconds(failures["timeout-capacity"].ms)} spent`);
    lines.push(`  other failures: ${failures.other.count}, ${seconds(failures.other.ms)} spent`);
  }

  const { reruns } = summary;
  lines.push(
    `Reruns (a failed test's file run again in the same checkout): ${reruns.chains} failed tests rerun, ${reruns.reruns} reruns, ${seconds(reruns.ms)} of worker time.`,
  );
  if (reruns.chains > 0) {
    lines.push(
      `  passed on a rerun: ${reruns.passed}; still failing at the last: ${reruns.stillFailing}; first failed as a timeout under load: ${reruns.fromLoadTimeouts}`,
    );
  }
  if (summary.notRerun > 0) lines.push(`  failed and not rerun since: ${summary.notRerun}`);

  const worst = summary.offenders.filter((offender) => offender.ms > 0).slice(0, 5);
  if (worst.length > 0) {
    lines.push("Worst offenders by time in failures and reruns:");
    for (const offender of worst) {
      lines.push(
        `  ${seconds(offender.ms)}  ${offender.failures} failed, ${offender.reruns} reruns (${[...offender.classes].join(", ")})  ${offender.id}`,
      );
    }
  }

  const { load } = summary;
  lines.push(
    `Load while tests ran (${seconds(load.seconds * 1000)} with a run going): peak ${load.peakRuns} recorded runs at once (${load.peakOthers} test runs seen at once in the process table, unrecorded ones included); CPU saturated ${load.saturatedShare === null ? "-" : share(load.saturatedShare, 1)} of the time.`,
  );
  for (const [going, level] of load.byConcurrency) {
    lines.push(`  ${going} at once: ${seconds(level.seconds * 1000)}, saturated ${share(level.saturated, level.measured)}`);
  }
  if (unreadable > 0) lines.push(`(${unreadable} lines of the log could not be read.)`);
  lines.push("Times are summed test and file durations: worker time, each about one core. Core use isn't attributable to one test.");
  return lines;
}
