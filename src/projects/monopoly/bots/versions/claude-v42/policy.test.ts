import { describe, expect, it } from "vitest";
import { simulateGame, type Contender } from "../../simulate";
import { OPT_V3_PARAMS, optV3Bot } from "../opt-v3";
import { DEFAULT_PARAMS } from "./bot";
import { CLAUDE_V42_PARAMS, claudeV42Bot } from "./index";

// claude-v42 = claude-v41's seller-side trade logic bound to the OPT-V3 base vector.
// These tests pin that (1) the vector IS opt-v3's verbatim plus the two v41 trade
// params, (2) the factory's DEFAULT_PARAMS carries the seller-side levers at their
// NEUTRAL settings (the fidelity fix), and (3) the trade logic is LIVE — claude-v42
// plays differently from the bare opt-v3 base.

function seatsAll(bot: Contender["bot"], label: string): Contender[] {
  return [0, 1, 2, 3].map((i) => ({ label: `${label}-${i.toString()}`, bot }));
}

describe("claude-v42 = opt-v3 base vector + claude-v41 seller-side trade params", () => {
  it("is opt-v3's vector verbatim plus rivalThreatFactor 0.4 / deployabilityDiscount 0.5", () => {
    expect(CLAUDE_V42_PARAMS).toEqual({
      ...OPT_V3_PARAMS,
      rivalThreatFactor: 0.4,
      deployabilityDiscount: 0.5,
    });
  });

  it("decouples rivalThreatFactor from denyFactor (the v41 thesis lever)", () => {
    expect(CLAUDE_V42_PARAMS.rivalThreatFactor).toBe(0.4);
    expect(CLAUDE_V42_PARAMS.rivalThreatFactor).not.toBe(CLAUDE_V42_PARAMS.denyFactor);
    expect(CLAUDE_V42_PARAMS.deployabilityDiscount).toBe(0.5);
  });
});

describe("claude-v42 factory — DEFAULT_PARAMS keeps the trade levers NEUTRAL", () => {
  // This factory always carries denialPositionCost (keyed off denyFactor), so the
  // default cannot reproduce claude-v38 byte-for-byte; the meaningful invariant is
  // that the two NEW levers are neutral at default (rivalThreatFactor = denyFactor,
  // deployabilityDiscount = 0), so only the explicit index.ts vector turns them on.
  it("pins rivalThreatFactor = denyFactor and deployabilityDiscount = 0", () => {
    expect(DEFAULT_PARAMS.rivalThreatFactor).toBe(DEFAULT_PARAMS.denyFactor);
    expect(DEFAULT_PARAMS.deployabilityDiscount).toBe(0);
  });
});

describe("claude-v42 is deterministic and its trade logic is live", () => {
  it("plays the same game twice for a fixed seed", () => {
    const seed = "v42-det-1";
    const a = simulateGame({ seed, seats: seatsAll(claudeV42Bot, "v42"), maxTurns: 2000, includeLog: true });
    const b = simulateGame({ seed, seats: seatsAll(claudeV42Bot, "v42"), maxTurns: 2000, includeLog: true });
    expect(b.turns).toBe(a.turns);
    expect(b.steps).toBe(a.steps);
    expect(b.eventCounts).toEqual(a.eventCounts);
    const winnerSeat = (r: typeof a): number => r.standings.findIndex((s) => s.id === r.winnerId);
    expect(winnerSeat(b)).toBe(winnerSeat(a));
  });

  it("plays DIFFERENTLY from the bare opt-v3 base — the seller-side trade logic changes decisions", () => {
    const seed = "v42-vs-opt3-1";
    const v42 = simulateGame({ seed, seats: seatsAll(claudeV42Bot, "v42"), maxTurns: 2000, includeLog: true });
    const opt = simulateGame({ seed, seats: seatsAll(optV3Bot, "opt3"), maxTurns: 2000, includeLog: true });
    const diverged =
      v42.turns !== opt.turns ||
      v42.steps !== opt.steps ||
      JSON.stringify(v42.eventCounts) !== JSON.stringify(opt.eventCounts);
    expect(diverged).toBe(true);
  });
});
