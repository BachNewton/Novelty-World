import { describe, expect, it } from "vitest";
import type { GameState } from "../../../../types";
import { aiDecisionFor } from "../../decisions";
import { withAiSeat } from "../../seat";
import { AI, owning, table, turnStart } from "../../eval/board";
import { turnStartFingerprint } from "../llm-v8/turn-start";

const at = (version: string, turns: number): GameState => {
  const game = owning(table(`ai:claude@${version}`), { [AI]: [6, 39] });
  return turnStart({ ...game, turns: Array.from({ length: turns }, (_, i) => ({ turn: i + 1, playerId: AI, events: [] })) });
};

describe("llm-v9 turn start: asked every turn", () => {
  it("is asked with nothing to build and no shared set, where llm-v8 rolls without a call", () => {
    expect(aiDecisionFor(at("llm-v8", 5), AI)).toBeNull();
    expect(aiDecisionFor(at("llm-v9", 5), AI)).toBe("turn-start");
  });

  it("is asked again over a board unchanged since it was last asked, but once per turn-group", () => {
    const state = at("llm-v9", 9);
    const askedBefore = withAiSeat(state, AI, { turnStart: { turn: 5, fingerprint: turnStartFingerprint(state, AI) } });
    expect(aiDecisionFor(askedBefore, AI)).toBe("turn-start");
    const askedNow = withAiSeat(state, AI, { turnStart: { turn: 9, fingerprint: "" } });
    expect(aiDecisionFor(askedNow, AI)).toBeNull();
  });
});
