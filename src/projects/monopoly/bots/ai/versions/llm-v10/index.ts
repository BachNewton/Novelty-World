import type { AiVersion } from "../../spec";
import { buildPrompt } from "../llm-v8/prompt";
import { turnStartFingerprint, turnStartOwed } from "../llm-v8/turn-start";
import { DECISION_SPECS } from "./answers";

/** llm-v8 without "you could mortgage it instead for $X and keep it": no
 *  mortgage value is stated beside a lot the seat would trade away, in a trade
 *  vote, a counter or a proposal. llm-v4 added it so a weak model wouldn't sell
 *  below what a mortgage raises; on a strong model the number may anchor what
 *  it asks. Model-specific: measured on Claude Sonnet 5.5 only. The prompt,
 *  the gate and every other answer are llm-v8's, which is frozen, so they are
 *  shared rather than copied. */
export const LLM_V10: AiVersion = {
  label: "llm-v10",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
