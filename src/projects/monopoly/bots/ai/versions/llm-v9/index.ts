import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "../llm-v8/answers";
import { buildPrompt } from "../llm-v8/prompt";
import { turnStartFingerprint } from "../llm-v8/turn-start";
import { turnStartOwed } from "./turn-start";

/** llm-v8 asked at every turn start (NEXT item 13). Model-specific: measured
 *  on Claude Sonnet 5.5 only, where a turn start takes seconds; on a slow
 *  local model it would add a long call to every turn. Everything else is
 *  llm-v8's, which is frozen, so it is shared rather than copied. */
export const LLM_V9: AiVersion = {
  label: "llm-v9",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
