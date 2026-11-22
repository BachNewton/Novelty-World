/**
 * The machine's recorder: while the budget's ledger holds a run, samples what the
 * hardware really does beside what the runs claim, into the budget's log
 * (scripts/machine-log.mjs). Every run's slot starts it if it isn't running
 * (`ensureRecorder`); it is one per ledger, and ends once the ledger has stayed empty.
 *
 *   node scripts/machine-recorder.mjs <ledger folder> [log folder]
 *
 * It decides nothing: killed, the queue works the same and the report shows the gap.
 */
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import { createInterface } from "node:readline";
import { admit, claimOf, egpuPlugged, status } from "./machine-budget.mjs";
import { cpuShare, cpuTimes } from "./machine-load.mjs";
import { appendRecord, logDir, pruneLog, recorderPipe } from "./machine-log.mjs";
import { COUNTERS_SCRIPT, measure, parseCounters } from "./machine-sample.mjs";

/** The time between samples: short enough to see a browser test, long enough that sampling costs next to nothing. */
export const SAMPLE_MS = 5000;
/** Empty samples in a row before it ends, so a queue that empties between two runs keeps its recorder. */
const IDLE_SAMPLES = 24;
/** A reading of the eGPU's use older than this is no reading: its card may have gone, or hung nvidia-smi. */
const BUSY_FRESH_MS = 3 * SAMPLE_MS;

const ledger = process.argv[2];
if (ledger === undefined) throw new Error("usage: node scripts/machine-recorder.mjs <ledger folder> [log folder]");
const log = process.argv[3] ?? logDir(ledger);

const stop = (why) => {
  appendRecord(log, { e: "recorder", failed: why });
  process.exit(1);
};
// Nobody sees this process's output, so whatever stops it goes in the log, where the report shows it.
process.on("uncaughtException", (error) => stop(error.stack ?? String(error)));
process.on("unhandledRejection", (error) => stop(String(error?.stack ?? error)));

const server = createServer((socket) => socket.destroy());
// Another recorder has the pipe: that one records.
server.on("error", (error) => (error.code === "EADDRINUSE" ? process.exit(0) : stop(error.message)));
server.listen(recorderPipe(ledger), () => {
  pruneLog(log);
  appendRecord(log, { e: "recorder", pid: process.pid });
  record();
});

function record() {
  const counters = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", COUNTERS_SCRIPT], { windowsHide: true });
  let errors = "";
  counters.stderr.on("data", (data) => (errors = `${errors}${data}`.slice(-2000)));
  counters.on("exit", (code) => stop(`the counters' PowerShell exited (${code}): ${errors.trim()}`));

  let before;
  let idle = 0;
  const seen = new Map();
  let lines = [];
  let next;
  let busy = { at: 0, value: null };
  let asking = false;
  // Asked beside the counters and never waited for, since a card that has faulted can hang nvidia-smi.
  const askBusy = () => {
    if (asking) return;
    asking = true;
    execFile("nvidia-smi", ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], { windowsHide: true, timeout: BUSY_FRESH_MS }, (error, stdout) => {
      asking = false;
      const value = error ? NaN : Number.parseFloat(stdout);
      // No card to ask is no reading, which the report never takes for an idle one.
      if (Number.isFinite(value)) busy = { at: Date.now(), value };
    });
  };

  const take = (after) => {
    const runs = status(ledger).map((run) => ({ ...run, ...claimOf(run) }));
    const now = { at: Date.now(), after, cpu: cpuTimes() };
    const last = before;
    before = now;
    for (const run of runs) {
      if (seen.get(run.id) === run.state) continue;
      seen.set(run.id, run.state);
      const { id, state, kind, who, command, cores, radeon, egpu, queuedAt, startedAt } = run;
      appendRecord(log, {
        e: "seen",
        id,
        state,
        kind,
        who,
        command,
        claim: [cores, radeon, egpu],
        queued: Date.parse(queuedAt),
        started: startedAt === undefined ? undefined : Date.parse(startedAt),
      });
    }
    idle = runs.length === 0 ? idle + 1 : 0;
    if (idle >= IDLE_SAMPLES) {
      counters.removeAllListeners("exit");
      counters.stdin.end();
      process.exit(0);
    }
    // The first reading only sets what the next is measured from.
    if (last === undefined || runs.length === 0) return;
    const plugged = egpuPlugged();
    const { start, waitsFor } = admit(runs, { plugged });
    appendRecord(log, {
      e: "sample",
      plugged,
      running: runs.filter((run) => run.state === "running").map((run) => run.id),
      waiting: runs.filter((run) => run.state === "waiting").map((run) => [run.id, waitsFor.get(run.id) ?? null]),
      // What could start right now: left like this, the queue is stuck.
      ready: start,
      ...measure({
        before: last.after,
        after,
        seconds: (now.at - last.at) / 1000,
        cores: cpuShare(last.cpu, now.cpu) * os.cpus().length,
        runs,
        egpuBusy: now.at - busy.at < BUSY_FRESH_MS ? busy.value : null,
      }),
    });
  };

  const ask = () => {
    askBusy();
    counters.stdin.write("sample\n");
  };
  createInterface({ input: counters.stdout }).on("line", (line) => {
    if (line !== "end") {
      lines.push(line);
      return;
    }
    take(parseCounters(lines));
    lines = [];
    clearTimeout(next);
    // Sampling on an interval is the recorder's whole job; the next is asked for only once this one is in.
    next = setTimeout(ask, SAMPLE_MS);
  });
  ask();
}
