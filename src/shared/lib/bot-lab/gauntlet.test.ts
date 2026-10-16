import { describe, expect, it } from "vitest";
import { crownGate, runSprtPairing, type TrialOutcome } from "./gauntlet";
import type { GauntletSprtConfig } from "./sprt";

const CFG: GauntletSprtConfig = { margin: 20, alpha: 0.05, beta: 0.05 };

/** A deterministic stream of outcomes: game i is a win, loss or draw by a fixed rule. */
function stream(rule: (i: number) => TrialOutcome) {
  const played: number[] = [];
  return {
    played,
    play: (from: number, count: number) => {
      played.push(count);
      return Promise.resolve(Array.from({ length: count }, (_, k) => rule(from + k)));
    },
  };
}

describe("runSprtPairing", () => {
  it("reaches the same verdict and stop point whatever the batch size", async () => {
    const rule = (i: number): TrialOutcome => (i % 5 === 4 ? "draw" : i % 3 === 0 ? "loss" : "win");
    const small = await runSprtPairing({ play: stream(rule).play, sprt: CFG, maxDecisive: 4000, batchGames: 7 });
    const large = await runSprtPairing({ play: stream(rule).play, sprt: CFG, maxDecisive: 4000, batchGames: 200 });
    expect(small.verdict).toBe("better");
    expect({ ...small, generated: 0, draws: 0 }).toEqual({ ...large, generated: 0, draws: 0 });
  });

  it("discards draws and errors from the test but counts them", async () => {
    const rule = (i: number): TrialOutcome => (i % 4 === 0 ? "draw" : i % 4 === 1 ? "error" : "win");
    const run = await runSprtPairing({ play: stream(rule).play, sprt: CFG, maxDecisive: 4000, batchGames: 40 });
    expect(run.losses).toBe(0);
    expect(run.draws).toBeGreaterThan(0);
    expect(run.errors).toBeGreaterThan(0);
    expect(run.decisive).toBe(run.wins);
  });

  it("generates whole groups only", async () => {
    const s = stream((i) => (i % 2 === 0 ? "win" : "loss"));
    const run = await runSprtPairing({ play: s.play, sprt: CFG, maxDecisive: 60, batchGames: 10, groupSize: 6 });
    expect(s.played.every((n) => n === 12)).toBe(true);
    expect(run.verdict).toBe("inconclusive");
    expect(run.decisive % 6).toBe(0);
  });

  it("stops generating when every game is a draw", async () => {
    const run = await runSprtPairing({ play: stream(() => "draw").play, sprt: CFG, maxDecisive: 100, batchGames: 50 });
    expect(run.verdict).toBe("inconclusive");
    expect(run.generated).toBe(600);
  });
});

describe("crownGate", () => {
  it("accepts a candidate that beats its base and regresses against no one", () => {
    const gate = crownGate(
      [
        { opponent: "base", verdict: "better" },
        { opponent: "old", verdict: "even" },
      ],
      "base",
    );
    expect(gate).toEqual({ improvesVsBase: true, regressions: [], accepted: true });
  });

  it("rejects a counter that beats the base but loses to another field member", () => {
    const gate = crownGate(
      [
        { opponent: "base", verdict: "better" },
        { opponent: "rival", verdict: "worse" },
      ],
      "base",
    );
    expect(gate.accepted).toBe(false);
    expect(gate.regressions).toEqual(["rival"]);
  });

  it("needs every format against the base to be better", () => {
    const gate = crownGate(
      [
        { opponent: "base", verdict: "better" },
        { opponent: "base", verdict: "inconclusive" },
      ],
      "base",
    );
    expect(gate.improvesVsBase).toBe(false);
  });

  it("does not improve on a base it never met", () => {
    expect(crownGate([{ opponent: "x", verdict: "better" }], "base").improvesVsBase).toBe(false);
  });
});
