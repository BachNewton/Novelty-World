import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonSchema } from "../model/adapter";
import { isRecord } from "../spec";

// One `claude -p` call, run clean, on the owner's subscription. Shared by the
// scenario suite's ceiling adapter (`eval/claude-cli.ts`) and the Claude model
// server (`server.ts`), so both ask Claude exactly the same way. Node-only: the
// route never imports it; a live seat reaches Claude through the server.

/** The CLI's thinking control. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** A model's thinking switch, as the model takes it: a call that thinks gets
 *  `think`, a quick one `quick`. Sonnet and Opus take `--effort` (`low` thinks
 *  little or not at all). Haiku 4.5 accepts `--effort` but ignores it, thinking
 *  the same at `low` and `max`, so its switch is the CLI's thinking budget,
 *  `MAX_THINKING_TOKENS`: 0 turns thinking off, null leaves the CLI's default. */
export type Thinking =
  | { by: "effort"; think: Effort; quick: Effort }
  | { by: "budget"; think: number | null; quick: number };

export interface ClaudeModel {
  /** The full model id, e.g. `claude-sonnet-5-5`. */
  model: string;
  thinking: Thinking;
}

const ALIASES: Readonly<Record<string, string>> = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  haiku: "claude-haiku-4-5-20251001",
};

/** A model by alias (`sonnet`, `opus`, `haiku`) or full id, with its default
 *  thinking switch. */
export function claudeModel(aliasOrId: string): ClaudeModel {
  const model = ALIASES[aliasOrId] ?? aliasOrId;
  return {
    model,
    thinking: model.startsWith("claude-haiku-4-5")
      ? { by: "budget", think: null, quick: 0 }
      : { by: "effort", think: "high", quick: "low" },
  };
}

/** The model and its thinking switch as a record names them, so a call is
 *  never credited to the wrong setup. */
export function describeClaudeModel({ model, thinking }: ClaudeModel): string {
  if (thinking.by === "effort") return `${model} (effort: think=${thinking.think}, quick=${thinking.quick})`;
  const think = thinking.think === null ? "CLI default" : String(thinking.think);
  return `${model} (thinking budget: think=${think}, quick=${String(thinking.quick)})`;
}

/** One call: the system prompt, the user's message on stdin, and the schema
 *  the answer must match (null for a free-text answer). */
export interface ClaudeCall extends ClaudeModel {
  think: boolean;
  system: string;
  user: string;
  schema: JsonSchema | null;
  timeoutMs: number;
}

/** The CLI's arguments for a call: no tools, no settings, no MCP, no saved
 *  session, only the call's system prompt (read from `systemFile`), and JSON
 *  output carrying the structured answer when there is a schema. */
export function claudeArgs(call: ClaudeCall, systemFile: string): string[] {
  const { thinking } = call;
  return [
    "-p",
    "--system-prompt-file", systemFile,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model", call.model,
    ...(thinking.by === "effort" ? ["--effort", call.think ? thinking.think : thinking.quick] : []),
    "--output-format", "json",
    ...(call.schema === null ? [] : ["--json-schema", JSON.stringify(call.schema)]),
  ];
}

/** The CLI's environment for a call: the caller's, with the thinking budget
 *  set (or cleared, for the CLI's default) when that is the model's switch. */
export function claudeEnv(call: ClaudeCall, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  if (call.thinking.by === "budget") {
    const budget = call.think ? call.thinking.think : call.thinking.quick;
    if (budget === null) delete env.MAX_THINKING_TOKENS;
    else env.MAX_THINKING_TOKENS = String(budget);
  }
  return env;
}

export interface ClaudeRun {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Token counts as the CLI reports them: everything read (cached or not), and
 *  everything written. */
export interface ClaudeUsage {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
}

/** What one run came to. `wrong-model` is a run some other model answered,
 *  which a record would credit to the wrong one. */
export type ClaudeResult =
  | { ok: true; text: string; structured: Record<string, unknown> | null; usage: ClaudeUsage | null }
  | {
      ok: false;
      kind: "timeout" | "failed" | "error-reply" | "no-structured" | "wrong-model";
      message: string;
      usage: ClaudeUsage | null;
    };

/** Read a run's JSON output, checking that the asked-for model answered and,
 *  when there was a schema, that a structured answer came back. */
export function readClaudeRun(call: ClaudeCall, run: ClaudeRun): ClaudeResult {
  if (run.timedOut) {
    return { ok: false, kind: "timeout", message: `no answer within ${String(call.timeoutMs / 1000)}s`, usage: null };
  }
  let out: unknown;
  try {
    out = JSON.parse(run.stdout);
  } catch {
    return {
      ok: false,
      kind: "failed",
      message: `claude exited ${String(run.code)}: ${run.stderr || run.stdout}`,
      usage: null,
    };
  }
  if (!isRecord(out)) throw new Error("claude -p printed JSON that isn't an object");
  const usage = readUsage(out.usage);
  const answered = isRecord(out.modelUsage) ? Object.keys(out.modelUsage) : [];
  if (answered.length > 0 && !answered.every((m) => m === call.model)) {
    return { ok: false, kind: "wrong-model", message: `asked ${call.model}, but ${answered.join(", ")} answered`, usage };
  }
  if (out.is_error === true) {
    return {
      ok: false,
      kind: "error-reply",
      message: `claude reported an error: ${String(out.api_error_status ?? out.subtype)} ${String(out.result)}`,
      usage,
    };
  }
  const text = typeof out.result === "string" ? out.result : "";
  if (call.schema === null) return { ok: true, text, structured: null, usage };
  if (!isRecord(out.structured_output)) {
    return { ok: false, kind: "no-structured", message: `no structured answer: ${text.slice(0, 200)}`, usage };
  }
  return { ok: true, text, structured: out.structured_output, usage };
}

function readUsage(usage: unknown): ClaudeUsage | null {
  if (!isRecord(usage)) return null;
  const num = (from: Record<string, unknown>, key: string): number => (typeof from[key] === "number" ? from[key] : 0);
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  return {
    promptTokens:
      num(usage, "input_tokens") + num(usage, "cache_creation_input_tokens") + num(usage, "cache_read_input_tokens"),
    completionTokens: num(usage, "output_tokens"),
    thinkingTokens: num(details, "thinking_tokens"),
  };
}

/** Run one call from an empty temp folder (so no CLAUDE.md or settings load),
 *  with the user's message on stdin. An aborted `signal` kills the CLI. */
export async function runClaude(call: ClaudeCall, signal?: AbortSignal): Promise<ClaudeResult> {
  return readClaudeRun(call, await spawnClaude(call, signal));
}

function spawnClaude(call: ClaudeCall, signal: AbortSignal | undefined): Promise<ClaudeRun> {
  const dir = mkdtempSync(join(tmpdir(), "claude-cli-"));
  const cwd = join(dir, "empty");
  const systemFile = join(dir, "system.txt");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a folder this call just made in the OS temp dir
  writeFileSync(systemFile, call.system);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- an empty folder inside it, so no CLAUDE.md or settings load
  mkdirSync(cwd);
  return new Promise((resolve, reject) => {
    const child = spawn("claude", claudeArgs(call, systemFile), {
      cwd,
      env: claudeEnv(call, process.env),
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // The deadline on an outside process, not a race: a CLI that never answers
    // would otherwise hold its caller forever.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, call.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.end(call.user, "utf8");
  });
}
