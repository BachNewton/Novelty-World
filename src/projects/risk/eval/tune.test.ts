import { describe, expect, it } from "vitest";
import { riskBot, tunedLabel } from "../bots";
import { V1_PARAMS } from "../bots/rule-v1/params";
import { cellScores, fitness, fromUnit, luceElo, PREF_KEYS, toUnit } from "./tune";
import type { RiskGameResult } from "./runner";

describe("tuning", () => {
  it("reads a side's win share as Elo per seat by the Luce model", () => {
    // At par (k of n seats winning k/n of games) the edge is nothing.
    expect(luceElo(25, 100, 1, 4)).toBeCloseTo(0, 9);
    expect(luceElo(75, 100, 3, 4)).toBeCloseTo(0, 9);
    // One seat of two winning 10 to 1 in strength wins 10/11 of games: +400.
    expect(luceElo(1000, 1100, 1, 2)).toBeCloseTo(400, 6);
    // A sweep is a large finite edge, not infinity.
    expect(Number.isFinite(luceElo(10, 10, 1, 4))).toBe(true);
  });

  it("maps preferences to the unit cube and back", () => {
    const back = fromUnit(toUnit(V1_PARAMS.prefs));
    for (const key of PREF_KEYS) expect(back[key]).toBeCloseTo(V1_PARAMS.prefs[key], 3);
  });

  it("seats a tuned bot by its label, and refuses a preference it doesn't have", () => {
    const label = tunedLabel("rule-v1", { borderWeight: 0.7 });
    expect(riskBot(label)).toBe(riskBot(label));
    expect(riskBot(label)).not.toBe(riskBot("rule-v1"));
    expect(() => riskBot(`rule-v1~{"killBar":0.9}`)).toThrow(/no setting "killBar"/);
    expect(() => riskBot(`greedy~{}`)).toThrow(/no tunable Risk bot "greedy"/);
  });

  it("scores each cell from its own games", () => {
    const game = (labels: string[], winner: number): RiskGameResult => ({ index: 0, seed: "s", labels, winner, places: labels.map(() => 1), turns: 1, decisions: 1 });
    const results = [
      game(["c", "o", "o", "o"], 0),
      game(["o", "c", "o", "o"], 0),
      game(["c", "c", "c", "o"], 1),
      game(["c", "c", "c", "o"], 3),
    ];
    const scores = cellScores("c", [{ opponent: "o", players: 4, format: "one-in" }, { opponent: "o", players: 4, format: "one-out" }], results);
    expect(scores.map((s) => [s.wins, s.decisive])).toEqual([[1, 2], [1, 2]]);
    expect(fitness(scores)).toBeCloseTo((scores[0].elo + scores[1].elo) / 2, 9);
    // The worst table counts, not the average.
    const three = { opponent: "o", players: 3, format: "one-in" as const, wins: 0, decisive: 0, elo: -50 };
    expect(fitness([...scores, three, { ...three, format: "one-out" }])).toBe(-50);
  });

  it("scores each opponent apart, and reads a table against the baseline's score there", () => {
    const game = (labels: string[], winner: number): RiskGameResult => ({ index: 0, seed: "s", labels, winner, places: labels.map(() => 1), turns: 1, decisions: 1 });
    const cells = [
      { opponent: "strong", players: 3, format: "one-in" as const },
      { opponent: "weak", players: 3, format: "one-in" as const },
    ];
    const results = [game(["c", "strong", "strong"], 0), game(["c", "weak", "weak"], 1), game(["c", "weak", "weak"], 0)];
    expect(cellScores("c", cells, results).map((s) => [s.wins, s.decisive])).toEqual([[1, 1], [1, 2]]);
    const cell = (opponent: string, elo: number) => ({ opponent, players: 3, format: "one-in" as const, wins: 0, decisive: 0, elo });
    // Beating the weak bot by far more than the strong one is no edge when the baseline beats it by more still.
    expect(fitness([cell("strong", 20), cell("weak", 200)])).toBe(20);
    expect(fitness([cell("strong", 20), cell("weak", 200)], [cell("weak", 300)])).toBe(-100);
  });
});
