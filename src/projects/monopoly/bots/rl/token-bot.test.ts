import { describe, expect, it } from "vitest";
import { simulateGame } from "../eval/simulate";
import { botFor } from "../registry";
import { tokenStubBot } from "./token-bot";

describe("token-driven bot (atomic vocabulary)", () => {
  it("plays a full game with only legal moves (atomic layer drives the game)", () => {
    // Four token-stub seats. The headless sim's applyOrThrow throws on ANY illegal
    // move, so a clean return proves every atomic action emitted was legal across
    // a whole game. The outcome is expected to be a DRAW (turn cap): a purely
    // reactive bot never develops, so no rent pressure ever busts anyone — the same
    // property the whole-action value-stub has. We assert the game ran and stayed
    // legal, not that it produced a winner (strength comes from search, not this).
    const result = simulateGame({
      seed: "token-full",
      seats: [
        { label: "token-stub", bot: tokenStubBot },
        { label: "token-stub", bot: tokenStubBot },
        { label: "token-stub", bot: tokenStubBot },
        { label: "token-stub", bot: tokenStubBot },
      ],
      maxTurns: 2000,
    });
    expect(result.standings.length).toBe(4);
    expect(result.turns).toBeGreaterThan(10);
  });

  it("competes against rule bots without erroring", () => {
    // Mixed table — exercises reactive decisions (voting on the rule bots' trade
    // proposals, must-raise settlements) through the atomic mask.
    const result = simulateGame({
      seed: "token-vs-rule",
      seats: [
        { label: "token-stub", bot: tokenStubBot },
        { label: "claude-v2", bot: botFor("claude-v2") },
        { label: "token-stub", bot: tokenStubBot },
        { label: "claude-v2", bot: botFor("claude-v2") },
      ],
      maxTurns: 2000,
    });
    expect(result.winnerId).not.toBeNull();
  });
});
