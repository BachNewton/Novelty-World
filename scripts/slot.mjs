/**
 * Runs a command inside the machine's budget (scripts/machine-budget.mjs): waits
 * its turn in the machine-wide queue, runs the command holding the cores (and GPU
 * slot) its kind takes, and leaves the queue however the command ends.
 *
 *   node scripts/slot.mjs <kind> -- <command...>   (npm run slot -- <kind> -- <command...>)
 *   node scripts/slot.mjs status                    what is running and waiting, machine-wide
 *
 * A run already inside a slot (MACHINE_SLOT set) runs its command at once, so
 * `npm run test:all` or a test that starts a tool doesn't queue behind itself.
 */
import { spawn, execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { demand, enqueue, leave, ledgerDir, status, tryStart } from "./machine-budget.mjs";

const [kind, ...rest] = process.argv.slice(2);
const dir = ledgerDir();

if (kind === "status") {
  const runs = status(dir);
  if (runs.length === 0) console.log("Nothing running or waiting.");
  for (const run of runs) {
    const since = run.state === "running" ? run.startedAt : run.queuedAt;
    console.log(`${run.state.padEnd(8)} ${run.kind.padEnd(8)} ${String(run.cores).padStart(4)} cores${run.gpu ? " +GPU" : "     "}  since ${since}  ${run.who}  ${run.command}`);
  }
  process.exit(0);
}

const split = rest.indexOf("--");
const command = split === -1 ? rest : rest.slice(split + 1);
if (kind === undefined || command.length === 0) {
  console.error("usage: node scripts/slot.mjs <unit|slow|e2e|browser|check|build|cores:N> -- <command...>  |  status");
  process.exit(2);
}
const wants = demand(kind);

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
const id = enqueue(dir, { kind, who: `${branch} (${process.cwd()})`, command: line });
const quit = () => leave(dir, id);
process.on("exit", quit);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

// The turn comes when another run leaves or starts, which changes the ledger's folder.
// A run killed outright leaves its file behind with no change to see, so the folder is
// also read every 30 seconds: that read is the liveness check that drops the dead.
if (!tryStart(dir, id)) {
  console.error(`[slot] waiting for ${wants.cores} cores${wants.gpu ? " and a GPU slot" : ""} (npm run slot -- status shows the queue)`);
  await new Promise((resolve) => {
    const check = () => {
      if (!tryStart(dir, id)) return;
      watcher.close();
      clearInterval(liveness);
      resolve();
    };
    // The lock comes and goes on every read, this one's included: watching it would never rest.
    const watcher = watch(dir, (_, file) => {
      if (file !== "lock") check();
    });
    const liveness = setInterval(check, 30_000);
  });
}
console.error(`[slot] running as ${kind}: ${wants.cores} cores${wants.gpu ? " and a GPU slot" : ""}`);

const env = { MACHINE_SLOT: kind };
if (wants.workers !== undefined) {
  env.VITEST_MAX_WORKERS = String(wants.workers);
  env.SLOT_WORKERS = String(wants.workers);
}
const code = await run(env);
quit();
process.exit(code);
