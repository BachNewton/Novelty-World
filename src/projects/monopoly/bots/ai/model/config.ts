import type { AiProfileId } from "../profiles";
import type { ModelAdapter } from "./adapter";
import { openAiCompatible } from "./openai-compatible";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_THINK_TOKENS = 1200;

/** How each profile reaches its model, configured from server environment
 *  variables. A new provider is a new adapter beside `openai-compatible.ts` and
 *  a profile here. */
const ADAPTERS: Readonly<Record<AiProfileId, () => ModelAdapter>> = {
  "ai:local": () =>
    openAiCompatible({
      baseUrl: process.env.MONOPOLY_AI_LOCAL_URL ?? "http://127.0.0.1:8090/v1",
      model: process.env.MONOPOLY_AI_LOCAL_MODEL ?? "local",
      apiKey: process.env.MONOPOLY_AI_LOCAL_KEY ?? null,
      timeoutMs: numberEnv("MONOPOLY_AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      thinkTokens: numberEnv("MONOPOLY_AI_THINK_TOKENS", DEFAULT_THINK_TOKENS),
    }),
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
