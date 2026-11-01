import type { GameState } from "../../../types";
import type { AiVersion } from "../spec";
import { aiStrategyOf } from "../strategy";
import type { AiVersionLabel } from "./labels";
import { LLM_V1 } from "./llm-v1";
import { LLM_V2 } from "./llm-v2";
import { LLM_V3 } from "./llm-v3";
import { LLM_V4 } from "./llm-v4";
import { LLM_V5 } from "./llm-v5";
import { LLM_V6 } from "./llm-v6";
import { LLM_V7 } from "./llm-v7";
import { LLM_V8 } from "./llm-v8";
import { LLM_V9 } from "./llm-v9";
import { LLM_V11 } from "./llm-v11";
import { LLM_V12 } from "./llm-v12";

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
  "llm-v11": LLM_V11,
  "llm-v12": LLM_V12,
} as const satisfies Readonly<Record<AiVersionLabel, AiVersion>>;

/** The AI version a seat plays, or null when it isn't an AI seat. */
export function aiVersionOf(state: GameState, playerId: string): AiVersion | null {
  const strategy = aiStrategyOf(state, playerId);
  return strategy === null ? null : AI_VERSIONS[strategy.version];
}
