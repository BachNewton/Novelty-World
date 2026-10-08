import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v7 with the history of play in place of the log window: the whole
 *  game's decisions and what players said (offers and how they were answered,
 *  buys and passes, auctions, building and mortgaging, leaving jail), grouped
 *  by kind, with rolls, rent and cards left to the board and cash; and each
 *  question states its own cause (what put the seat in debt, who passed on the
 *  lot at auction, how it went to jail). */
export const LLM_V8: AiVersion = {
  label: "llm-v8",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
