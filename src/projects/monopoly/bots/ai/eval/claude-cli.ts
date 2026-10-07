import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallMetrics, ModelAdapter, ModelRequest, ModelResult } from "../model/adapter";
import { isRecord } from "../spec";
import type { ServerInfo } from "./record";

// EVAL ONLY: a ceiling for the scenario suite. A Claude model, reached through
// the `claude` CLI in headless mode on the owner's subscription, given exactly
// the request the local model gets and scored by the same checks, tells a
// model's limits apart from the prompt's. Only the scenario CLI imports this;
// the route and live seats never can.

/** The CLI's thinking control. */
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** A version's thinking switch, as the model takes it: a decision that thinks
 *  gets `think`, a quick one `quick`. Sonnet and Opus take `--effort` (`low`
 *  thinks little or not at all). Haiku 4.5 accepts `--effort` but ignores it,
 *  thinking the same at `low` and `max`, so its switch is the CLI's thinking
 *  budget, `MAX_THINKING_TOKENS`: 0 turns thinking off, null leaves the CLI's
 *  default. */
type Thinking =
  | { by: "effort"; think: Effort; quick: Effort }
  | { by: "budget"; think: number | null; quick: number };

export interface ClaudeCliConfig {
  /** The full model id, e.g. `claude-sonnet-5-5`. */
  model: string;
  thinking: Thinking;
  timeoutMs: number;
}

const ALIASES: Readonly<Record<string, string>> = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  haiku: "claude-haiku-4-5-20251001",
};

/** `claude-cli:<alias or model id>` as the scenario CLI's `--model` takes it,
 *  or null when the argument names no Claude model. */
export function parseClaudeCliModel(arg: string): ClaudeCliConfig | null {
  const match = /^claude-cli:(.+)$/.exec(arg);
  if (!match) return null;
  const model = ALIASES[match[1]] ?? match[1];
  return {
    model,
    thinking: model.startsWith("claude-haiku-4-5")
      ? { by: "budget", think: null, quick: 0 }
      : { by: "effort", think: "high", quick: "low" },
    timeoutMs: 600_000,
  };
}

/** The setup as the call record names it, so a run is never credited to the
 *  wrong model. Sampling can't be set through the CLI: a version's
 *  temperature is not applied. */
export function claudeCliServer(config: ClaudeCliConfig, slots: number): ServerInfo {
  return {
    model: `${claudeCliName(config)} (${thinkingLabel(config.thinking)})`,
    contextPerSlot: null,
    slots,
    defaults: {},
  };
}

/** A short name for file names: `claude-cli-claude-sonnet-5-5`. */
export function claudeCliTag(config: ClaudeCliConfig): string {
  return claudeCliName(config).replace("/", "-");
}

function thinkingLabel(thinking: Thinking): string {
  if (thinking.by === "effort") return `effort: think=${thinking.think}, quick=${thinking.quick}`;
  return `thinking budget: think=${thinking.think === null ? "CLI default" : String(thinking.think)}, quick=${String(thinking.quick)}`;
}

function claudeCliName(config: ClaudeCliConfig): string {
  return `claude-cli/${config.model}`;
}

interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Run `claude -p` clean: no tools, no settings, no CLAUDE.md, no MCP, no saved
 *  session, from an empty folder, with only the request's system prompt. The
 *  answer comes back as the CLI's structured output, checked against the
 *  request's schema. */
export function claudeCli(config: ClaudeCliConfig): ModelAdapter {
  return {
    async complete(request: ModelRequest): Promise<ModelResult> {
      const started = Date.now();
      const metrics = (usage: unknown): CallMetrics => {
        const ms = Date.now() - started;
        const u = isRecord(usage) ? usage : {};
        const num = (key: string): number => (typeof u[key] === "number" ? u[key] : 0);
        return {
          ms,
          thinkMs: null,
          answerMs: ms,
          promptTokens: isRecord(usage)
            ? num("input_tokens") + num("cache_creation_input_tokens") + num("cache_read_input_tokens")
            : null,
          completionTokens: isRecord(usage) ? num("output_tokens") : null,
          thinkHitBudget: null,
        };
      };
      const run = await runCli(config, request);
      if (run.timedOut) {
        return { ok: false, kind: "timeout", message: `no answer within ${String(config.timeoutMs / 1000)}s`, metrics: metrics(null) };
      }
      let out: unknown;
      try {
        out = JSON.parse(run.stdout);
      } catch {
        return {
          ok: false,
          kind: "unreachable",
          message: `claude exited ${String(run.code)}: ${(run.stderr || run.stdout).slice(0, 300)}`,
          metrics: metrics(null),
        };
      }
      if (!isRecord(out)) throw new Error("claude -p printed JSON that isn't an object");
      const answered = isRecord(out.modelUsage) ? Object.keys(out.modelUsage) : [];
      if (answered.length > 0 && !answered.every((m) => m === config.model)) {
        // The record would credit the wrong model: stop the run.
        throw new Error(`asked ${config.model}, but ${answered.join(", ")} answered`);
      }
      if (out.is_error === true) {
        return {
          ok: false,
          kind: "unreachable",
          message: `claude reported an error: ${String(out.api_error_status ?? out.subtype)} ${String(out.result).slice(0, 300)}`,
          metrics: metrics(out.usage),
        };
      }
      if (!isRecord(out.structured_output)) {
        return {
          ok: false,
          kind: "bad-answer",
          message: `no structured answer: ${String(out.result).slice(0, 200)}`,
          metrics: metrics(out.usage),
        };
      }
      const answer = out.structured_output;
      // The CLI keeps Claude's thinking to itself (the answer's notes carry its
      // reasons), but says how much there was.
      const details = isRecord(out.usage) && isRecord(out.usage.output_tokens_details) ? out.usage.output_tokens_details : {};
      const thought = typeof details.thinking_tokens === "number" ? details.thinking_tokens : 0;
      const thoughts = thought > 0 ? `(${String(thought)} thinking tokens, not shown by the CLI)` : "";
      return { ok: true, answer, raw: JSON.stringify(answer), thoughts, metrics: metrics(out.usage) };
    },

    identify: () => Promise.resolve(claudeCliName(config)),
  };
}

function runCli(config: ClaudeCliConfig, request: ModelRequest): Promise<CliRun> {
  const dir = mkdtempSync(join(tmpdir(), "claude-cli-"));
  const cwd = join(dir, "empty");
  const systemFile = join(dir, "system.txt");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a folder this call just made in the OS temp dir
  writeFileSync(systemFile, request.system);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- an empty folder inside it, so no CLAUDE.md or settings load
  mkdirSync(cwd);
  const thinking = config.thinking;
  const args = [
    "-p",
    "--system-prompt-file", systemFile,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model", config.model,
    ...(thinking.by === "effort" ? ["--effort", request.think ? thinking.think : thinking.quick] : []),
    "--output-format", "json",
    "--json-schema", JSON.stringify(request.schema),
  ];
  const env = { ...process.env };
  if (thinking.by === "budget") {
    const budget = request.think ? thinking.think : thinking.quick;
    if (budget === null) delete env.MAX_THINKING_TOKENS;
    else env.MAX_THINKING_TOKENS = String(budget);
  }
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // The deadline on an outside process, not a race: a CLI that never answers
    // would otherwise hang the run.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, config.timeoutMs);
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
    child.stdin.end(request.user, "utf8");
  });
}
