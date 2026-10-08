import type { AiVersion } from "../../spec";
import { buildPrompt } from "../llm-v8/prompt";
import { turnStartFingerprint, turnStartOwed } from "../llm-v8/turn-start";
import { DECISION_SPECS } from "./answers";

/** llm-v8 with its auction notes shown live: the public note goes on the
 *  board as soon as the seat answers, and the question says so. llm-v2 began
 *  holding them until the auction closed because weaker models wrote their
 *  maximum into the note. Model-specific: measured on Claude Sonnet 5.5 only.
 *  Everything else is llm-v8's, which is frozen, so it is shared rather than
 *  copied. */
export const LLM_V11: AiVersion = {
  label: "llm-v11",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: false,
};
