/**
 * Runs a command inside the machine's budget (scripts/machine-budget.mjs): waits
 * its turn in the machine-wide queue, runs the command holding the cores and the
 * share of each GPU its kind takes, and leaves the queue however the command ends.
 *
 *   node scripts/slot.mjs <kind> -- <command...>   (npm run slot -- <kind> -- <command...>)
 *   node scripts/slot.mjs status                    what is running and waiting, machine-wide
 *   node scripts/slot.mjs history [--hours N] [--log <folder>]
 *                                                   whether it worked, judged from its log
 *
 * A run already inside a slot (MACHINE_SLOT set) runs its command at once, so
 * `npm run test:all` or a test that starts a tool doesn't queue behind itself; it
 * fails if it needs a GPU that slot doesn't hold.
 */
import { spawn, execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { parseArgs } from "node:util";
import { e2eClaim } from "./e2e-claims.mjs";
import { appendRecord, ensureRecorder, logDir, readRecords } from "./machine-log.mjs";
import { BUDGET, USAGE, admit, claimOf, demand, describe, egpuPlugged, enqueue, leave, ledgerDir, requireClaimed, status, tryStart } from "./machine-budget.mjs";

const RESOURCE_NAMES = { cores: "cores", radeon: "the Radeon", egpu: "the eGPU" };

const fail = (message, code = 1) => {
  console.error(`[slot] ${message}`);
  process.exit(code);
};

const [kind, ...rest] = process.argv.slice(2);
const dir = ledgerDir();

if (kind === "status") {
  const plugged = egpuPlugged();
  console.log(`The eGPU is ${plugged ? "plugged in" : "not plugged in"}.`);
  const runs = status(dir);
  const { waitsFor } = admit(runs, { plugged });
  if (runs.length === 0) console.log("Nothing running or waiting.");
  for (const run of runs) {
    const since = run.state === "running" ? run.startedAt : run.queuedAt;
    const wait = waitsFor.has(run.id) ? ` (waits for ${RESOURCE_NAMES[waitsFor.get(run.id)]})` : "";
    console.log(`${run.state.padEnd(8)} ${run.kind.padEnd(12)} ${describe(claimOf(run))}${wait}  since ${since}  ${run.who}  ${run.command}`);
  }
  process.exit(0);
}

if (kind === "history") {
  // Read only here: every run loads this file, and none needs the report.
  const { audit, formatHistory } = await import("./machine-history.mjs");
  const { values } = parseArgs({
    args: rest.filter((arg) => arg !== "--"),
    options: { hours: { type: "string", default: "24" }, log: { type: "string" } },
  });
  const hours = Number(values.hours);
  if (!(hours > 0)) fail(`--hours takes a positive number, not "${values.hours}"`, 2);
  const log = values.log ?? logDir(dir);
  const to = Date.now();
  const from = to - hours * 3_600_000;
  const { records, unreadable } = readRecords(log, { from, to });
  const report = audit(records, { from, to, budget: BUDGET });
  console.log(formatHistory(report, { hours, log, unreadable }).join("\n"));
  process.exit(0);
}

const split = rest.indexOf("--");
const command = split === -1 ? rest : rest.slice(split + 1);
if (kind === undefined || command.length === 0) {
  console.error(`usage: node scripts/slot.mjs <${USAGE}> -- <command...>  |  status  |  history [--hours N]`);
  process.exit(2);
}
let wants;
try {
  wants = kind === "e2e" ? e2eClaim(command) : demand(kind);
  // Inside a slot already there is no second wait, so the slot around it must hold this run's GPUs.
  if (process.env.MACHINE_SLOT !== undefined) requireClaimed(`"${kind}" inside a ${process.env.MACHINE_SLOT} slot`, wants);
} catch (error) {
  fail(error.message, 2);
}

const quote = (arg) => (/^[\w\-.,/:=@+\\]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
// One argument is a whole shell line (`npm run test:all` chains three runs in one slot).
const line = command.length === 1 ? command[0] : command.map(quote).join(" ");

const run = (env) =>
  new Promise((resolve) => {
    const child = spawn(line, { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    const stop = (signal) => child.kill(signal);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

if (process.env.MACHINE_SLOT !== undefined) process.exit(await run({}));

const branch = (() => {
  try {
    return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || "detached";
  } catch {
    return "?";
  }
})();
const who = `${branch} (${process.cwd()})`;
const id = enqueue(dir, { kind, claim: wants, who, command: line });
const log = logDir(dir);
appendRecord(log, { e: "queued", id, kind, who, command: line, claim: [wants.cores, wants.radeon, wants.egpu] });
ensureRecorder(dir);
let left = false;
const quit = (code) => {
  if (left) return;
  left = true;
  // The end is logged before the place is given up, so it comes before the start it makes room for.
  appendRecord(log, { e: "ended", id, code });
  leave(dir, id);
};
process.on("exit", quit);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

// The turn comes when another run leaves or starts, which changes the ledger's folder, so
// it is watched from before the first look. A run killed outright leaves its file behind
// and an eGPU pulled out changes no file, so the folder is also read every 30 seconds:
// that read is the liveness check for both.
const claim = await new Promise((resolve) => {
  let told = false;
  let waitingFor;
  const check = () => {
    const turn = tryStart(dir, id);
    for (const start of turn.started) appendRecord(log, { e: "started", ...start });
    if (turn.state === "unplugged") fail(`${kind} needs the eGPU, and it isn't plugged in (or its driver hasn't started it).`);
    if (turn.state === "waiting") {
      if (turn.waitsFor !== waitingFor) {
        waitingFor = turn.waitsFor;
        appendRecord(log, { e: "waits", id, for: waitingFor });
      }
      if (!told) console.error(`[slot] waiting for ${RESOURCE_NAMES[turn.waitsFor]}, to take ${describe(wants)} (npm run slot -- status shows the queue)`);
      told = true;
      return;
    }
    watcher.close();
    clearInterval(liveness);
    resolve(turn.claim);
  };
  // The lock comes and goes on every read, this one's included: watching it would never rest.
  const watcher = watch(dir, (_, file) => {
    if (file !== "lock") check();
  });
  const liveness = setInterval(() => {
    ensureRecorder(dir);
    check();
  }, 30_000);
  check();
});
// The recorder is looked for through the run too: one killed leaves no more than half a minute unrecorded.
setInterval(() => ensureRecorder(dir), 30_000).unref();
console.error(`[slot] running as ${kind}: ${describe(claim)}`);

const env = { MACHINE_SLOT: kind, MACHINE_CLAIM: JSON.stringify(claim) };
if (wants.testWorkers !== undefined) env.VITEST_MAX_WORKERS = String(wants.testWorkers);
if (wants.e2eWorkers !== undefined) env.SLOT_WORKERS = String(wants.e2eWorkers);
// Pinned to the GPU it claimed, which plugging the eGPU back in mid-run mustn't move.
if (wants.egpu > 0 && claim.egpu === 0) {
  console.error("[slot] the eGPU isn't plugged in, so this run is on the Radeon.");
  env.E2E_INTEGRATED_GPU = "1";
}
const code = await run(env);
quit(code);
process.exit(code);
