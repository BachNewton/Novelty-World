import { serverInfo, type ServerInfo } from "../eval/record";
import type { AiProfileId } from "../strategy";
import type { ModelAdapter } from "./adapter";
import { openAiCompatible } from "./openai-compatible";

const DEFAULT_TIMEOUT_MS = 120_000;

/** How each profile reaches its model, configured from server environment
 *  variables. How the model is called (thinking budget, sampling) belongs to
 *  the seat's AI version, not here. A new provider is a new adapter beside
 *  `openai-compatible.ts` and a profile here. */
/** Where the `ai:local` profile's server answers: an OpenAI-compatible API
 *  root, ending in `/v1`. */
export function localBaseUrl(): string {
  return process.env.MONOPOLY_AI_LOCAL_URL ?? "http://127.0.0.1:8090/v1";
}

/** Where the `ai:claude` profile's server answers: the Claude model server
 *  (`npm run ai:claude-server`), which speaks the same API through `claude -p`. */
export function claudeBaseUrl(): string {
  return process.env.MONOPOLY_AI_CLAUDE_URL ?? "http://127.0.0.1:8091/v1";
}

/** The key each profile's server takes, or null for a server that takes any
 *  caller. Its `/props` needs the key as much as its calls do. */
export function localKey(): string | null {
  return process.env.MONOPOLY_AI_LOCAL_KEY ?? null;
}

function claudeKey(): string | null {
  return process.env.MONOPOLY_AI_CLAUDE_KEY ?? null;
}

const ADAPTERS: Readonly<Record<AiProfileId, () => ModelAdapter>> = {
  "ai:local": () =>
    openAiCompatible({
      baseUrl: localBaseUrl(),
      model: process.env.MONOPOLY_AI_LOCAL_MODEL ?? "local",
      apiKey: localKey(),
      timeoutMs: numberEnv("MONOPOLY_AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    }),
  "ai:claude": () =>
    openAiCompatible({
      baseUrl: claudeBaseUrl(),
      model: "claude",
      apiKey: claudeKey(),
      timeoutMs: numberEnv("MONOPOLY_AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      // Claude thinks beside a structured answer; fed its own reasoning back
      // as a second turn, its safeguards can refuse the answer pass.
      thinksWithAnswer: true,
    }),
};

/** The model server behind a profile, as it describes itself, for the call
 *  record. Null when it won't say. */
export function describeServer(profile: AiProfileId): Promise<ServerInfo | null> {
  return SERVERS[profile]();
}

const SERVERS: Readonly<Record<AiProfileId, () => Promise<ServerInfo | null>>> = {
  "ai:local": () => serverInfo(localBaseUrl(), localKey()),
  "ai:claude": () => serverInfo(claudeBaseUrl(), claudeKey()),
};

/** The adapter a profile plays through. Server-only: it reads secrets, and only
 *  the route calls it. */
export function modelFor(profile: AiProfileId): ModelAdapter {
  return ADAPTERS[profile]();
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}
