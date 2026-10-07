import type { AiVersion } from "../../spec";
import { DECISION_SPECS } from "./answers";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint, turnStartOwed } from "./turn-start";

/** The first AI version, frozen as it played its first real games (game
 *  `0a0e5y` was its review). Sampling is left to the model server: llama.cpp's
 *  defaults then were temperature 0.8, top-k 40, top-p 0.95, min-p 0.05 and a
 *  random seed. Thinking ran on a 1,200-token budget. */
export const LLM_V1: AiVersion = {
  label: "llm-v1",
  specs: DECISION_SPECS,
  buildPrompt,
  turnStartOwed,
  turnStartFingerprint,
  call: { thinkTokens: 1200, sampling: null },
  holdAuctionNotes: false,
};
