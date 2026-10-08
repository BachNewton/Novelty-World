import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v6 with facts added to the view: each player's line states their full
 *  sets and what they can build on; the rules say what a player controls (its
 *  choices, never where it lands) and ask for a plan made of those choices; a
 *  trade vote shows the proposer's public message with the offer and the
 *  largest rent on the board; and a trade that completes a set states what
 *  building it costs, beside the cash its new owner would have. */
export const LLM_V7: AiVersion = {
  label: "llm-v7",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
