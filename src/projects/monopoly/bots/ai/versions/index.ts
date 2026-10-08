import type { AiVersion } from "../spec";
import { LLM_V1 } from "./llm-v1";
import { LLM_V2 } from "./llm-v2";
import { LLM_V3 } from "./llm-v3";
import { LLM_V4 } from "./llm-v4";
import { LLM_V5 } from "./llm-v5";
import { LLM_V6 } from "./llm-v6";
import { LLM_V7 } from "./llm-v7";
import { LLM_V8 } from "./llm-v8";
import { LLM_V9 } from "./llm-v9";
import { LLM_V10 } from "./llm-v10";
import { LLM_V11 } from "./llm-v11";

/** Every AI version a seat can play, by label. A version is a frozen bundle of
 *  everything we control about how a model plays (`AiVersion`): changing any of
 *  it means registering a new `llm-vN`, never editing one that is here, so a
 *  game's record always names exactly what played it. */
export const AI_VERSIONS = {
  "llm-v1": LLM_V1,
  "llm-v2": LLM_V2,
  "llm-v3": LLM_V3,
  "llm-v4": LLM_V4,
  "llm-v5": LLM_V5,
  "llm-v6": LLM_V6,
  "llm-v7": LLM_V7,
  "llm-v8": LLM_V8,
  "llm-v9": LLM_V9,
  "llm-v10": LLM_V10,
  "llm-v11": LLM_V11,
} as const satisfies Readonly<Record<string, AiVersion>>;

export type AiVersionLabel = keyof typeof AI_VERSIONS;

/** Newest first: the order the lobby lists them in. */
export const AI_VERSION_LABELS: readonly AiVersionLabel[] = ["llm-v11", "llm-v10", "llm-v9", "llm-v8", "llm-v7", "llm-v6", "llm-v5", "llm-v4", "llm-v3", "llm-v2", "llm-v1"];

/** Versions tuned and measured on one model only (METHOD.md, "model-specific"),
 *  by the model they were measured on. They stay selectable, but are never a
 *  new seat's default: a model-specific setting may hold another model back. */
export const MODEL_SPECIFIC: Readonly<Partial<Record<AiVersionLabel, string>>> = {
  "llm-v9": "Claude Sonnet 5.5",
  "llm-v10": "Claude Sonnet 5.5",
  "llm-v11": "Claude Sonnet 5.5",
};

/** The version a new AI seat plays unless another is picked: the newest one
 *  that isn't model-specific. */
export const DEFAULT_AI_VERSION: AiVersionLabel = newestGeneral();

function newestGeneral(): AiVersionLabel {
  const label = AI_VERSION_LABELS.find((candidate) => !(candidate in MODEL_SPECIFIC));
  if (label === undefined) throw new Error("every AI version is model-specific");
  return label;
}
