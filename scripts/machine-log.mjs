/**
 * The budget's log: what the queue decided and what the hardware really did, so it
 * can be judged afterwards (`npm run slot -- history`, scripts/machine-history.mjs).
 * A folder beside the ledger in the git common directory, one file of JSON lines per
 * UTC day, kept for two weeks and never committed.
 *
 * Two writers, each record one line with `t` (ms since the epoch) and `e`:
 *   slot.mjs              queued   a run joined: its id, kind, who, command and claim
 *                         waits    what it waits for, each time that changes
 *                         started  with the claim it started on and, as whoever started it saw
 *                                  them, what was already running and who was waiting ahead
 *                         ended    with its exit code
 *   machine-recorder.mjs  seen     a run in the ledger, for one whose checkout doesn't log
 *                         sample   every few seconds while the ledger holds a run: real CPU and
 *                                  GPU use, each run's share of it, and what no run accounts for
 *                         recorder that the recorder started, or why it failed
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DAY_MS = 86_400_000;
const KEPT_DAYS = 14;

/** The log's folder for a ledger's. */
export function logDir(ledger) {
  return path.join(path.dirname(ledger), "machine-log");
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Appends one record as one write of one line, so writers never interleave. A run
 * never fails over the log, but says when a record went unwritten.
 */
export function appendRecord(dir, record) {
  const full = { t: Date.now(), ...record };
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${dayOf(full.t)}.jsonl`), `${JSON.stringify(full)}\n`);
  } catch (error) {
    console.warn(`[slot] the machine's log missed a "${record.e}" record (${error.message.split("\n")[0]}).`);
  }
}

/** The records from the day before `from` (for runs already going then) to `to`, by time, and how many lines couldn't be read. */
export function readRecords(dir, { from, to }) {
  if (!existsSync(dir)) return { records: [], unreadable: 0 };
  const first = `${dayOf(from - DAY_MS)}.jsonl`;
  const last = `${dayOf(to)}.jsonl`;
  const records = [];
  let unreadable = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl") || name < first || name > last) continue;
    for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (line === "") continue;
      try {
        const record = JSON.parse(line);
        if (record.t <= to) records.push(record);
      } catch {
        unreadable++; // A write cut short: the report says how many.
      }
    }
  }
  records.sort((a, b) => a.t - b.t);
  return { records, unreadable };
}

/** Deletes the days past the two weeks kept. */
export function pruneLog(dir, now = Date.now()) {
  if (!existsSync(dir)) return;
  const oldest = `${dayOf(now - KEPT_DAYS * DAY_MS)}.jsonl`;
  for (const name of readdirSync(dir)) {
    if (/^\d{4}-\d\d-\d\d\.jsonl$/.test(name) && name < oldest) unlinkSync(path.join(dir, name));
  }
}

/**
 * The recorder's named pipe, one per ledger. Listening on it is what makes a recorder
 * the only one, and Windows frees it however the recorder dies.
 */
export function recorderPipe(ledger) {
  const key = createHash("sha1").update(path.resolve(ledger).toLowerCase()).digest("hex").slice(0, 16);
  return `\\\\.\\pipe\\novelty-world-machine-recorder-${key}`;
}

/**
 * Starts the recorder unless one is running. It outlives the run that started it and
 * ends itself once the ledger has stayed empty, so it works from the ledger's folder:
 * holding the checkout's would stop a worktree being removed.
 */
export function ensureRecorder(ledger) {
  if (process.platform !== "win32") return;
  const socket = connect(recorderPipe(ledger));
  socket.unref();
  socket.on("connect", () => socket.destroy());
  socket.on("error", (error) => {
    if (error.code !== "ENOENT") {
      console.warn(`[slot] the machine's recorder couldn't be reached (${error.message}).`);
      return;
    }
    const script = fileURLToPath(new URL("./machine-recorder.mjs", import.meta.url));
    spawn(process.execPath, [script, ledger], { cwd: path.dirname(ledger), detached: true, stdio: "ignore", windowsHide: true }).unref();
  });
}
