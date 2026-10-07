import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v2 with three causes from the scenario suite fixed:
 *  - a debt plan is answered in the model's own terms (how many houses to sell
 *    from each set, which lots to mortgage), with every option's cash listed;
 *    the code works out the lots' levels, where llm-v2 asked for end levels and
 *    the model read them as houses to sell;
 *  - trade cash is two amounts that are never negative (pay, receive), after
 *    the deal said in words, where llm-v2's one signed amount let a proposer
 *    ask to be paid for a lot it was buying;
 *  - the thinking pass is told to reason only about the decision, briefly, and
 *    to leave the answer's format to the answer step: llm-v2's thinking spent
 *    its whole budget restating the board and debating the JSON fields. */
export const LLM_V3: AiVersion = {
  label: "llm-v3",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
