import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Socket } from "node:net";
import { createInterface } from "node:readline";
import { assertFreshBinary, NATIVE_BINARY } from "./binary";

// One `risk-native` subcommand as a child process speaking JSON lines: each request a line
// tagged with an id, each answer a line echoing it, so any number of requests may be in flight.
// Everything here waits on the child's events (a line, its exit), never on a clock.
//
// The child's end is read from its `exit`, not its `close`: on Windows a child spawned at the
// same moment from another worker thread can inherit this child's ends of its pipes, and holds
// them open until it exits itself, so this child's output may not close when it does.

interface Waiting {
  resolve: (answer: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class NativeChild {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly waiting = new Map<number, Waiting>();
  private readonly exit: Promise<number | null>;
  private nextId = 0;
  private failure: Error | null = null;
  private stderr = "";
  private closing = false;

  constructor(private readonly args: readonly string[]) {
    assertFreshBinary();
    this.child = spawn(NATIVE_BINARY, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.exit = new Promise((resolve) => this.child.on("exit", (code) => resolve(code)));
    createInterface({ input: this.child.stdout }).on("line", (line) => this.onLine(line));
    this.child.stderr.setEncoding("utf8").on("data", (text: string) => (this.stderr += text));
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    void this.exit.then((code) => {
      if (code !== 0 || this.waiting.size > 0 || !this.closing) this.fail(new Error(this.exitMessage(code)));
    });
    this.hold(false);
  }

  private exitMessage(code: number | null): string {
    const said = this.stderr.trim();
    return `risk-native ${this.args.join(" ")} exited (${code === null ? "killed" : `code ${code.toString()}`})${said === "" ? "" : `: ${said}`}`;
  }

  /** Keeps the process alive only while an answer is awaited, so an idle child (a native seat
   *  between games, or after the run's last) never holds the run open; it ends with our stdin. */
  private hold(on: boolean): void {
    for (const handle of [this.child, this.child.stdin as unknown as Socket, this.child.stdout as Socket, this.child.stderr as Socket]) {
      if (on) handle.ref();
      else handle.unref();
    }
  }

  private onLine(line: string): void {
    const answer = JSON.parse(line) as Record<string, unknown>;
    const id = answer.id as number;
    const waiting = this.waiting.get(id);
    if (waiting === undefined) {
      this.fail(new Error(`risk-native ${this.args.join(" ")} answered ${id.toString()}, which nobody asked`));
      return;
    }
    this.waiting.delete(id);
    if (this.waiting.size === 0) this.hold(false);
    waiting.resolve(answer);
  }

  /** The child failed: every request in flight fails with its error, and so does every later one. */
  private fail(error: Error): void {
    this.failure ??= error;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of waiting) w.reject(this.failure);
  }

  /** Sends `request` with an id of its own and resolves with the child's answer to it. */
  ask(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (this.closing) return Promise.reject(new Error(`risk-native ${this.args.join(" ")} is closed`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.waiting.size === 0) this.hold(true);
      this.waiting.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
    });
  }

  /** Ends the child's input and waits for it to exit; fails if it exits with an error. */
  async close(): Promise<void> {
    this.closing = true;
    this.hold(true);
    this.child.stdin.end();
    const code = await this.exit;
    if (code !== 0) throw this.failure ?? new Error(this.exitMessage(code));
  }
}
