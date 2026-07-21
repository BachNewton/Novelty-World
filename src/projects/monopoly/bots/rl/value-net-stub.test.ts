import { describe, expect, it } from "vitest";
import { botFor } from "../registry";
import { simulateGame, type Contender } from "../eval/simulate";
import { valueNetBot, valueNetStubBot } from "./value-net-stub";

const CLAUDE: Contender = { label: "claude-v2", bot: botFor("claude-v2") };

describe("value-net stub bot", () => {
  it("plays a full, legal game to completion via the hybrid loop", () => {
    // `simulateGame` applies every decision through `applyOrThrow`, so an illegal
    // move from the stub would throw — reaching a winner is proof the loop only
    // ever emits legal decisions.
    const result = simulateGame({
      seed: "stub-vs-claude",
      seats: [{ label: "value-stub", bot: valueNetStubBot }, CLAUDE],
    });

    expect(result.terminated).toBe(true);
    expect(result.standings.some((s) => s.label === "value-stub")).toBe(true);
    // It actually acts on the reactive surface (buys property via lookahead),
    // not just rolls.
    expect(result.eventCounts.buy).toBeGreaterThan(0);
  });

  it("the factory yields a legal bot for any value function", () => {
    // A degenerate constant value makes every candidate tie, so the bot always
    // takes the first (tie-break) candidate. It must still only ever play legal
    // moves — `simulateGame` would throw otherwise.
    const flatBot = valueNetBot(() => 0);
    const result = simulateGame({
      seed: "flat-value",
      seats: [{ label: "flat", bot: flatBot }, CLAUDE],
      maxTurns: 500,
    });
    // No assertion on the winner — a flat value is a weak (but legal) player; the
    // point is that driving it never produced an illegal move.
    expect(result.steps).toBeGreaterThan(0);
  });
});
