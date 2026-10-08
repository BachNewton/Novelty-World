import { describe, expect, it } from "vitest";
import type { GameState } from "../../../../types";
import { AI, mortgaging, offered, owning, RIVAL, table, turnStart } from "../../eval/board";
import { DECISION_SPECS as LLM_V8_SPECS } from "../llm-v8/answers";
import { DECISION_SPECS } from "./answers";

// The AI holds New York and Oriental (mortgaged); Sam holds the other two
// oranges and offers $400 for New York.
const board: GameState = mortgaging(owning(table("ai:claude@llm-v10"), { [AI]: [19, 6], [RIVAL]: [16, 18] }), [6]);
const vote = offered(board, RIVAL, { propertyTo: { 19: RIVAL }, cashDelta: { [AI]: 400, [RIVAL]: -400 } });

describe("llm-v10: no mortgage value beside a lot the seat would trade away", () => {
  it("leaves it out of the trade vote, where llm-v8 states it twice", () => {
    const v8 = LLM_V8_SPECS["trade-vote"]?.question(vote, AI) ?? "";
    const v10 = DECISION_SPECS["trade-vote"]?.question(vote, AI) ?? "";
    expect(v8).toContain("you could mortgage it instead for $100 and keep it");
    expect(v8).toContain("Mortgaging raises:");
    expect(v10).toContain("#19 New York Avenue: you -> Sam");
    expect(v10).not.toMatch(/mortgage it instead|Mortgaging raises/);
  });

  it("still marks a mortgaged lot", () => {
    const swap = offered(board, RIVAL, { propertyTo: { 6: RIVAL }, cashDelta: { [AI]: 60, [RIVAL]: -60 } });
    expect(DECISION_SPECS["trade-vote"]?.question(swap, AI)).toContain("#6 Oriental Avenue (mortgaged): you -> Sam");
  });

  it("leaves it out of a proposal and a counter's terms", () => {
    expect(DECISION_SPECS["turn-start"]?.question(turnStart(board), AI)).not.toMatch(/mortgage it and keep it|Mortgaging raises/);
    const counter = DECISION_SPECS["trade-vote"]?.followUp?.(vote, AI, { vote: "counter", privateNote: "x", publicNote: "$650 for New York." });
    expect(counter?.question).toContain("#19 New York Avenue: you -> Sam");
    expect(counter?.question).not.toContain("mortgage it instead");
  });
});
