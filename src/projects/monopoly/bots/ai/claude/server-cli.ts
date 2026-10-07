// `npm run ai:claude-server -- [--model sonnet|opus|haiku|<id>] [--port 8091]
//   [--concurrency 2] [--think <level>] [--quick <level>] [--timeout-ms N]`
//
// Serve AI seats through `claude -p` on the owner's subscription (see
// server.ts), on 127.0.0.1 only. `--think` and `--quick` set the thinking
// switch for a call that thinks and one that doesn't: an effort level
// (low…max) for a model that takes `--effort`, a token budget for one whose
// switch is its budget (Haiku; `default` leaves the CLI's). If
// MONOPOLY_AI_CLAUDE_KEY is set, callers must send it as their bearer key.
import { EFFORTS, claudeModel, describeClaudeModel, type ClaudeModel, type Effort, type Thinking } from "./cli";
import { claudeServer, type ClaudeServerConfig } from "./server";

const USAGE =
  "usage: npm run ai:claude-server -- [--model sonnet|opus|haiku|<id>] [--port 8091] [--concurrency 2] [--think <level>] [--quick <level>] [--timeout-ms N]";

function fail(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}

const flags = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const value = argv.at(i + 1);
  if (!argv[i].startsWith("--") || value === undefined) fail(`can't read "${argv[i]}"`);
  flags.set(argv[i].slice(2), value);
}
for (const name of flags.keys()) {
  if (!["model", "port", "concurrency", "think", "quick", "timeout-ms"].includes(name)) fail(`unknown flag --${name}`);
}

function positive(name: string, fallback: number): number {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) fail(`--${name} must be a positive whole number`);
  return value;
}

function thinkingFrom(defaults: Thinking): Thinking {
  const think = flags.get("think");
  const quick = flags.get("quick");
  if (defaults.by === "effort") {
    const effort = (name: string, raw: string | undefined, fallback: Effort): Effort => {
      if (raw === undefined) return fallback;
      const level = EFFORTS.find((e) => e === raw);
      return level ?? fail(`--${name} takes an effort level (${EFFORTS.join(", ")}) for this model`);
    };
    return { by: "effort", think: effort("think", think, defaults.think), quick: effort("quick", quick, defaults.quick) };
  }
  const budget = (name: string, raw: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) fail(`--${name} takes a thinking-token budget for this model`);
    return value;
  };
  return {
    by: "budget",
    think: think === undefined ? defaults.think : think === "default" ? null : budget("think", think),
    quick: quick === undefined ? defaults.quick : budget("quick", quick),
  };
}

const base: ClaudeModel = claudeModel(flags.get("model") ?? "sonnet");
const config: ClaudeServerConfig = {
  model: base.model,
  thinking: thinkingFrom(base.thinking),
  concurrency: positive("concurrency", 2),
  timeoutMs: positive("timeout-ms", 600_000),
  key: process.env.MONOPOLY_AI_CLAUDE_KEY ?? null,
};
const port = positive("port", 8091);

claudeServer(config).listen(port, "127.0.0.1", () => {
  console.log(
    `claude server on http://127.0.0.1:${String(port)}/v1: ${describeClaudeModel(config)}, ` +
      `${String(config.concurrency)} at once${config.key === null ? "" : ", key required"}. Ctrl+C stops it.`,
  );
});
