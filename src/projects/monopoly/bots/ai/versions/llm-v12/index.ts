import type { AiVersion } from "../../spec";
import { buildPrompt } from "../llm-v8/prompt";
import { turnStartFingerprint } from "../llm-v8/turn-start";
import { DECISION_SPECS } from "../llm-v11/answers";
import { turnStartOwed } from "../llm-v9/turn-start";

/** llm-v8 with both Sonnet changes kept on their own: asked at every turn
 *  start (llm-v9) and auction notes shown live (llm-v11). Model-specific:
 *  measured on Claude Sonnet 5.5 only. Those versions and llm-v8 are frozen,
 *  so their parts are shared rather than copied. */
export const LLM_V12: AiVersion = {
  label: "llm-v12",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: false,
};
