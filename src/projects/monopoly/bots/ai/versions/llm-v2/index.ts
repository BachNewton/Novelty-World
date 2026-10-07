import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** llm-v1 with the fixes from reviewing its first game (`0a0e5y`):
 *  - trades are written from the seat's own side (you give, you get, cash you
 *    receive) and must state the cash they leave it with, which is checked;
 *  - an auction question gives the lot's stakes and a rule of thumb instead of
 *    the most the seat could pay, and its public note waits until the auction
 *    closes;
 *  - the buy question states what owning the lot would complete or block;
 *  - the carried plan is framed as a note that may be wrong;
 *  - brevity is asked for in words, with length limits only as a backstop;
 *  - the turn-start question is asked only when the seat could build, lift a
 *    mortgage, or trade toward a set it shares, and a turn start that does
 *    nothing logs no public line;
 *  - the board reads set by set, with railroad and utility counts, and the log
 *    names every square and card.
 *  Sampling is pinned low (temperature 0.3) so the same board gets the same
 *  play more often than at the server's default 0.8. */
export const LLM_V2: AiVersion = {
  label: "llm-v2",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: { temperature: 0.3 } },
  holdAuctionNotes: true,
};
