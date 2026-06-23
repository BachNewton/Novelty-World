import { describe, expect, it } from "vitest";
import { simulateGame, type Contender } from "../../simulate";
import { OPT_V2_PARAMS, optV2Bot } from "../opt-v2";
import { DEFAULT_PARAMS } from "./bot";
import { CLAUDE_V43_PARAMS, claudeV43Bot } from "./index";

// claude-v43 = claude-v41's seller-side trade logic bound to the OPT-V2 base vector
// (the robust ex-crown). Sibling of claude-v42 (which uses opt-v3). These tests pin
// that (1) the vector IS opt-v2's verbatim plus the two v41 trade params, (2) the
// factory's DEFAULT_PARAMS carries the seller-side levers at their NEUTRAL settings,
// and (3) the trade logic is LIVE — claude-v43 plays differently from bare opt-v2.

function seatsAll(bot: Contender["bot"], label: string): Contender[] {
  return [0, 1, 2, 3].map((i) => ({ label: `${label}-${i.toString()}`, bot }));
}

describe("claude-v43 = opt-v2 base vector + claude-v41 seller-side trade params", () => {
  it("is opt-v2's vector verbatim plus rivalThreatFactor 0.4 / deployabilityDiscount 0.5", () => {
    expect(CLAUDE_V43_PARAMS).toEqual({
      ...OPT_V2_PARAMS,
      rivalThreatFactor: 0.4,
      deployabilityDiscount: 0.5,
    });
  });

  it("decouples rivalThreatFactor from denyFactor (the v41 thesis lever)", () => {
    expect(CLAUDE_V43_PARAMS.rivalThreatFactor).toBe(0.4);
    expect(CLAUDE_V43_PARAMS.rivalThreatFactor).not.toBe(CLAUDE_V43_PARAMS.denyFactor);
    expect(CLAUDE_V43_PARAMS.deployabilityDiscount).toBe(0.5);
  });
});

describe("claude-v43 factory — DEFAULT_PARAMS keeps the trade levers NEUTRAL", () => {
  // This factory always carries denialPositionCost (keyed off denyFactor), so the
  // default cannot reproduce claude-v38 byte-for-byte; the meaningful invariant is
  // that the two NEW levers are neutral at default (rivalThreatFactor = denyFactor,
  // deployabilityDiscount = 0), so only the explicit index.ts vector turns them on.
  it("pins rivalThreatFactor = denyFactor and deployabilityDiscount = 0", () => {
    expect(DEFAULT_PARAMS.rivalThreatFactor).toBe(DEFAULT_PARAMS.denyFactor);
    expect(DEFAULT_PARAMS.deployabilityDiscount).toBe(0);
  });
});

describe("claude-v43 is deterministic and its trade logic is live", () => {
  it("plays the same game twice for a fixed seed", () => {
    const seed = "v43-det-1";
    const a = simulateGame({ seed, seats: seatsAll(claudeV43Bot, "v43"), maxTurns: 2000, includeLog: true });
    const b = simulateGame({ seed, seats: seatsAll(claudeV43Bot, "v43"), maxTurns: 2000, includeLog: true });
    expect(b.turns).toBe(a.turns);
    expect(b.steps).toBe(a.steps);
    expect(b.eventCounts).toEqual(a.eventCounts);
    const winnerSeat = (r: typeof a): number => r.standings.findIndex((s) => s.id === r.winnerId);
    expect(winnerSeat(b)).toBe(winnerSeat(a));
  });

  it("plays DIFFERENTLY from the bare opt-v2 base — the seller-side trade logic changes decisions", () => {
    const seed = "v43-vs-opt2-1";
    const v43 = simulateGame({ seed, seats: seatsAll(claudeV43Bot, "v43"), maxTurns: 2000, includeLog: true });
    const opt = simulateGame({ seed, seats: seatsAll(optV2Bot, "opt2"), maxTurns: 2000, includeLog: true });
    const diverged =
      v43.turns !== opt.turns ||
      v43.steps !== opt.steps ||
      JSON.stringify(v43.eventCounts) !== JSON.stringify(opt.eventCounts);
    expect(diverged).toBe(true);
  });
});
