import { describe, expect, it } from "vitest";
import { riskBot } from "../bots";
import { playGame } from "./runner";
import { Trace, windows } from "./trace";

describe("trace", () => {
  const trace = new Trace();
  const record = playGame({ seed: "trace-test-1", bots: ["greedy", "greedy", "greedy"].map((l) => riskBot(l)), maxTurns: 600, observe: trace });

  it("keeps one entry per player-turn, in order", () => {
    expect(trace.turns.map((t) => t.turn)).toEqual(Array.from({ length: record.turns }, (_, i) => i + 1));
    expect(trace.winner).toBe(record.winner);
  });

  it("counts every elimination, and the board's armies as the views do", () => {
    expect(trace.turns.flatMap((t) => t.eliminated)).toHaveLength(2);
    for (const t of trace.turns) {
      for (const s of t.start) if (s.alive) expect(s.biggest).toBeLessThanOrEqual(s.armies);
    }
  });

  it("sums its windows from the turns", () => {
    const all = windows(trace, 1000)[0];
    const captures = trace.turns.reduce((a, t) => a + t.captures, 0);
    expect(all.capturesPerTurn * all.turns).toBeCloseTo(captures);
    expect(all.eliminations).toBe(2);
  });
});
