import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v3 with two causes from its scenario runs fixed:
 *  - each way to raise cash states what it loses beside the cash it raises: a
 *    house sale loses half the house's cost for good, a mortgage only its 10%
 *    to lift; a lot the seat would trade away shows what mortgaging it instead
 *    would raise. llm-v3 sold houses to "avoid the 10% interest" and sold a lot
 *    for less than its mortgage value, never shown either loss;
 *  - house counts are one number per set, every set named, where llm-v3's list
 *    of (set, houses) entries came back empty while the note said to sell, and
 *    once named one set three times with a count per lot. */
export const LLM_V4: AiVersion = {
  label: "llm-v4",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
