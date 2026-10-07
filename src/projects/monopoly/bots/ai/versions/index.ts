import type { AiVersion } from "../spec";
import { LLM_V1 } from "./llm-v1";
import { LLM_V2 } from "./llm-v2";
import { LLM_V3 } from "./llm-v3";
import { LLM_V4 } from "./llm-v4";

/** Every AI version a seat can play, by label. A version is a frozen bundle of
 *  everything we control about how a model plays (`AiVersion`): changing any of
 *  it means registering a new `llm-vN`, never editing one that is here, so a
 *  game's record always names exactly what played it. */
export const AI_VERSIONS = {
  "llm-v1": LLM_V1,
  "llm-v2": LLM_V2,
  "llm-v3": LLM_V3,
  "llm-v4": LLM_V4,
} as const satisfies Readonly<Record<string, AiVersion>>;

export type AiVersionLabel = keyof typeof AI_VERSIONS;

/** Newest first: the order the lobby lists them in. */
export const AI_VERSION_LABELS: readonly AiVersionLabel[] = ["llm-v4", "llm-v3", "llm-v2", "llm-v1"];

/** The version a new AI seat plays unless another is picked: the newest. */
export const DEFAULT_AI_VERSION: AiVersionLabel = AI_VERSION_LABELS[0];
