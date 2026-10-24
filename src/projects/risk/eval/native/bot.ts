import { execFileSync } from "node:child_process";
import process from "node:process";
import { isMainThread } from "node:worker_threads";
import type { GameEvent, Move } from "../../contract";
import { riskBot, RISK_BOTS } from "../../bots";
import type { AsyncBot } from "../runner";
import { assertFreshBinary, NATIVE_BINARY } from "./binary";
import { NativeChild } from "./child";

// Native bots seated at a table the TypeScript runner plays (`ideas/native-port.md`, "How a Rust
// bot is measured"): the seat's decisions are asked of one `risk-native bots-serve` process per
// thread, over a pipe. A label names a native bot when the TypeScript registry doesn't know it
// and the crate does, or when it ends in `@native` (`gd-stacker@native`), which forces a bot
// both sides have onto the native path, for checking a mixed table against the all-TypeScript one.

export const NATIVE_SUFFIX = "@native";

/** The crate's name for a label: without its `@native`. */
export function nativeName(label: string): string {
  return label.endsWith(NATIVE_SUFFIX) ? label.slice(0, -NATIVE_SUFFIX.length) : label;
}

/** Where the main thread leaves the native labels for the worker threads it starts afterwards,
 *  which copy its environment. */
const LABELS_ENV = "RISK_NATIVE_LABELS";

/** Every native bot's label, asked of the crate once, on the main thread. A worker thread reads
 *  them from the environment the main thread left: asking the crate itself, at the moment other
 *  workers start their native processes, can hang on Windows, where a process started from one
 *  thread may inherit another's pipes and hold them open. */
export function nativeLabels(): readonly string[] {
  let listed = process.env[LABELS_ENV];
  if (listed === undefined) {
    if (!isMainThread) throw new Error("the native bots are listed on the main thread, before the worker pool starts: check the run's labels there (`checkBots`)");
    assertFreshBinary();
    listed = execFileSync(NATIVE_BINARY, ["bots"], { encoding: "utf8" }).trim();
    process.env[LABELS_ENV] = listed;
  }
  return JSON.parse(listed) as string[];
}

/** Whether every seat of a table seated by these labels can play wholly in the crate. */
export function checkNative(seated: readonly string[]): void {
  const missing = seated.filter((label) => !nativeLabels().includes(nativeName(label)));
  if (missing.length > 0) {
    throw new Error(`--native plays every seat in the crate, which has no ${missing.join(", ")} (native: ${nativeLabels().join(", ")})`);
  }
}

/** A label the TypeScript registry seats: its own bots and tuned labels. */
function knownToTypeScript(label: string): boolean {
  return Object.hasOwn(RISK_BOTS, label) || label.includes("~");
}

/** Whether a label seats a native bot at a table the TypeScript runner plays. */
export function isNativeSeat(label: string): boolean {
  if (label.endsWith(NATIVE_SUFFIX)) return true;
  if (knownToTypeScript(label)) return false;
  let native: readonly string[];
  try {
    native = nativeLabels();
  } catch (e) {
    throw new Error(`no Risk bot "${label}" in TypeScript, and the native bots can't be listed: ${(e as Error).message}`);
  }
  return native.includes(label);
}

// Each thread's one native process, started at its first native decision.
let child: NativeChild | null = null;

/** How many seats' games the process keeps at once. A thread plays one game at a time (a few at
 *  once inline), so the oldest session is long over by the time its slot is reused. */
const SLOTS = 64;

/** A seat's game as the process holds it: the slot it is kept in, and how many of its history's
 *  events were sent. A seat's game is its history: the runner grows one array a seat a game. */
interface Session {
  slot: number;
  sent: number;
}

const sessions = new Map<readonly GameEvent[], Session>();

/** The session of a seat's game, the most recently used last; a new game takes a fresh slot, or
 *  the least recently used one's, starting its history from the beginning. */
function sessionOf(history: readonly GameEvent[]): Session {
  let session = sessions.get(history);
  if (session !== undefined) {
    sessions.delete(history);
  } else if (sessions.size < SLOTS) {
    session = { slot: sessions.size, sent: 0 };
  } else {
    const [oldest, old] = sessions.entries().next().value as [readonly GameEvent[], Session];
    sessions.delete(oldest);
    session = { slot: old.slot, sent: 0 };
  }
  sessions.set(history, session);
  return session;
}

/** The native bot `label`, answering through this thread's native process. Its input reaches the
 *  crate whole: the view, the options, and the history as it grew since the seat's last decision. */
export function nativeBot(label: string): AsyncBot {
  if (!nativeLabels().includes(label)) throw new Error(`no native Risk bot "${label}" (native: ${nativeLabels().join(", ")})`);
  return async (input) => {
    child ??= new NativeChild(["bots-serve"]);
    const session = sessionOf(input.history);
    const from = session.sent;
    session.sent = input.history.length;
    const answer = await child.ask({
      slot: session.slot,
      label,
      seat: input.seat,
      view: input.view,
      options: input.options,
      latest: input.events.length,
      history: { from, events: input.history.slice(from) },
      humans: input.humans,
      seed: input.seed,
    });
    return answer.move as Move;
  };
}

/** The bot a label seats at a table the TypeScript runner plays: a native bot for a native label
 *  (see `isNativeSeat`), the TypeScript registry's otherwise. A label both sides know (`greedy`)
 *  is the TypeScript bot, so frozen bots stay TypeScript unless the whole table is `--native`. */
export function riskBotAsync(label: string): AsyncBot {
  return isNativeSeat(label) ? nativeBot(nativeName(label)) : riskBot(label);
}
