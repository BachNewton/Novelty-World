import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v5 with two answer shapes changed, found on Gemma 4 12B: a counter's
 *  terms start with the counter in one sentence, so the lot choices and cash
 *  follow the seat's message instead of drifting from it; and a debt plan is
 *  answered mortgages first, then what they leave owed, then house sales, with
 *  the notes after, so the plan sells houses only for what mortgages can't
 *  cover. */
export const LLM_V6: AiVersion = {
  label: "llm-v6",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
