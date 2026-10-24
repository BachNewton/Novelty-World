import { describe, expect, it } from "vitest";
import { riskBot } from "../bots";
import { playGame } from "./runner";
import { shapeLine, shapeOf, surveyGame, Trace, windows } from "./trace";

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

  it("reads a game's shape: the board's armies as a turn began, and its losses over its income", () => {
    const at = trace.turns[9];
    expect(shapeOf(trace, 10).armiesAtTurn).toBe(at.start.reduce((a, s) => a + (s.alive ? s.armies : 0), 0));
    expect(shapeOf(trace, record.turns + 1).armiesAtTurn).toBeNull();
    const losses = trace.turns.reduce((a, t) => a + t.attackerLosses + t.defenderLosses, 0);
    const income = trace.turns.reduce((a, t) => a + t.income + t.tradeArmies, 0);
    expect(shapeOf(trace).lossesPerIncome).toBeCloseTo(losses / income, 12);
  });

  it("surveys a game as the runner plays it, with its shape", () => {
    const result = surveyGame({ index: 0, seed: "trace-test-1", labels: ["greedy", "greedy", "greedy"], maxTurns: 600 });
    expect(result).toMatchObject({ winner: record.winner, turns: record.turns, places: record.places });
    expect(result.shape).toEqual(shapeOf(trace));
    expect(shapeLine([result, { ...result, shape: { armiesAtTurn: 200, lossesPerIncome: 0.5 } }])).toBe(
      `  shape: board armies at turn 100 mean 200 (1 of 2 games reached it), losses ÷ income ${((shapeOf(trace).lossesPerIncome + 0.5) / 2).toFixed(2)}`,
    );
  });
});
