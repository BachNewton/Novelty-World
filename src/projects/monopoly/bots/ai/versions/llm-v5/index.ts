import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v4 with the trade vote asked in two steps: the vote alone, beside what
 *  each side holds, then, only once "counter" is chosen, the counter's terms in
 *  a second, quick call, as one choice per lot or card each side holds. llm-v4
 *  asked for a counter's terms with every vote and in the proposal's give/get
 *  form: its counters came back empty when the note meant decline, wrote the
 *  seat's own lot under "I get", or dropped a lot the other side didn't hold
 *  and gave the seat's lot away for nothing. */
export const LLM_V5: AiVersion = {
  label: "llm-v5",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
