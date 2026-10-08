import type { AiDecision } from "../../../../types";
import type { DecisionSpec } from "../../spec";
import { DECISION_SPECS as LLM_V8_SPECS } from "../llm-v8/answers";

const HELD = "Your publicNote is shown only after the auction closes.";
const LIVE = "Your publicNote is shown to the table at once, while the auction runs.";

function llmV8Auction(): DecisionSpec {
  const spec = LLM_V8_SPECS.auction;
  if (!spec) throw new Error("llm-v8 has no auction spec");
  return spec;
}

/** llm-v8's auction question, telling the seat its note is shown at once
 *  instead of after the close. llm-v8 is frozen, so its question can't drift
 *  from the sentence replaced here; if it ever did, asking fails loudly. */
const auction: DecisionSpec = {
  ...llmV8Auction(),
  question: (state, seat) => {
    const question = llmV8Auction().question(state, seat);
    if (!question.includes(HELD)) throw new Error("llm-v8's auction question no longer says when the note is shown");
    return question.replace(HELD, LIVE);
  },
};

export const DECISION_SPECS: Readonly<Partial<Record<AiDecision, DecisionSpec>>> = { ...LLM_V8_SPECS, auction };
