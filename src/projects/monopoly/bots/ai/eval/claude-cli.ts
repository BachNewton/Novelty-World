import { claudeModel, describeClaudeModel, runClaude, type ClaudeModel, type ClaudeUsage } from "../claude/cli";
import type { CallMetrics, ModelAdapter, ModelRequest, ModelResult } from "../model/adapter";
import type { ServerInfo } from "./record";

// EVAL ONLY: a ceiling for the scenario suite. A Claude model, reached through
// the `claude` CLI in headless mode on the owner's subscription, given exactly
// the request the local model gets and scored by the same checks, tells a
// model's limits apart from the prompt's. Only the scenario CLI imports this
// adapter; live seats reach Claude through the model server (`claude/`), which
// runs the CLI the same way (`claude/cli.ts`).

export interface ClaudeCliConfig extends ClaudeModel {
  timeoutMs: number;
}

/** `claude-cli:<alias or model id>` as the scenario CLI's `--model` takes it,
 *  or null when the argument names no Claude model. */
export function parseClaudeCliModel(arg: string): ClaudeCliConfig | null {
  const match = /^claude-cli:(.+)$/.exec(arg);
  if (!match) return null;
  return { ...claudeModel(match[1]), timeoutMs: 600_000 };
}

/** The setup as the call record names it, so a run is never credited to the
 *  wrong model. Sampling can't be set through the CLI: a version's
 *  temperature is not applied. */
export function claudeCliServer(config: ClaudeCliConfig, slots: number): ServerInfo {
  return {
    model: `claude-cli/${describeClaudeModel(config)}`,
    contextPerSlot: null,
    slots,
    defaults: {},
  };
}

/** A short name for file names: `claude-cli-claude-sonnet-5-5`. */
export function claudeCliTag(config: ClaudeCliConfig): string {
  return `claude-cli-${config.model}`;
}

/** Answer each request with one clean `claude -p` call, thinking beside the
 *  structured answer when the request thinks. */
export function claudeCli(config: ClaudeCliConfig): ModelAdapter {
  return {
    async complete(request: ModelRequest): Promise<ModelResult> {
      const started = Date.now();
      const metrics = (usage: ClaudeUsage | null): CallMetrics => {
        const ms = Date.now() - started;
        return {
          ms,
          thinkMs: null,
          answerMs: ms,
          promptTokens: usage?.promptTokens ?? null,
          completionTokens: usage?.completionTokens ?? null,
          thinkHitBudget: null,
        };
      };
      const result = await runClaude({
        ...config,
        think: request.think,
        system: request.system,
        user: request.user,
        schema: request.schema,
      });
      if (result.ok) {
        const answer = result.structured;
        // The CLI keeps Claude's thinking to itself (the answer's notes carry
        // its reasons), but says how much there was.
        const thought = result.usage?.thinkingTokens ?? 0;
        const thoughts = thought > 0 ? `(${String(thought)} thinking tokens, not shown by the CLI)` : "";
        return { ok: true, answer, raw: JSON.stringify(answer), thoughts, metrics: metrics(result.usage) };
      }
      switch (result.kind) {
        case "wrong-model":
          // The record would credit the wrong model: stop the run.
          throw new Error(result.message);
        case "timeout":
          return { ok: false, kind: "timeout", message: result.message, metrics: metrics(null) };
        case "no-structured":
          return { ok: false, kind: "bad-answer", message: result.message, metrics: metrics(result.usage) };
        case "failed":
        case "error-reply":
          return { ok: false, kind: "unreachable", message: result.message.slice(0, 300), metrics: metrics(result.usage) };
      }
    },

    identify: () => Promise.resolve(`claude-cli/${config.model}`),
  };
}
