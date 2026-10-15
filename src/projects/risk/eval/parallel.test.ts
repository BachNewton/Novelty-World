import { describe, expect, it } from "vitest";
import type { RiskGameResult } from "./runner";
import { candidateSeats, finishesOf, outcomeFor, tableSpecs } from "./parallel";

describe("tableSpecs", () => {
  it("rotates the lone bot through every seat of a group sharing one seed", () => {
    const specs = tableSpecs("cand", "base", "one-in", 4, "t", 0, 8, 600);
    expect(specs.map((s) => s.seed)).toEqual(["t-1", "t-1", "t-1", "t-1", "t-2", "t-2", "t-2", "t-2"]);
    expect(specs.map((s) => s.labels.indexOf("cand"))).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    for (const s of specs) expect(s.labels.filter((l) => l === "cand")).toHaveLength(1);
  });

  it("seats the opponent alone in one-out", () => {
    const specs = tableSpecs("cand", "base", "one-out", 6, "t", 6, 6, 600);
    expect(specs.map((s) => s.index)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(specs.every((s) => s.seed === "t-2")).toBe(true);
    expect(specs.map((s) => s.labels.indexOf("base"))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(candidateSeats("one-out", 6)).toBe(5);
    expect(candidateSeats("one-in", 6)).toBe(1);
  });

  it("is the same stream however it is cut into batches", () => {
    const whole = tableSpecs("cand", "base", "one-in", 3, "t", 0, 12, 600);
    const cut = [...tableSpecs("cand", "base", "one-in", 3, "t", 0, 5, 600), ...tableSpecs("cand", "base", "one-in", 3, "t", 5, 7, 600)];
    expect(cut).toEqual(whole);
  });

  it("refuses a pairing of a bot with itself", () => {
    expect(() => tableSpecs("cand", "cand", "one-in", 3, "t", 0, 3, 600)).toThrow();
  });
});

describe("a game's result", () => {
  const result = (winner: number | null, error?: string): RiskGameResult => ({
    index: 0,
    seed: "s",
    labels: ["base", "cand", "base"],
    winner,
    places: winner === null ? [1, 1, 3] : [2, 1, 3],
    turns: 40,
    decisions: 400,
    error,
  });

  it("is the candidate's win, loss, draw or error", () => {
    expect(outcomeFor(result(1), "cand")).toBe("win");
    expect(outcomeFor(result(0), "cand")).toBe("loss");
    expect(outcomeFor(result(null), "cand")).toBe("draw");
    expect(outcomeFor(result(null, "boom"), "cand")).toBe("error");
  });

  it("gives each seat's finish, and none for a game that threw", () => {
    expect(finishesOf(result(1))).toEqual([
      { label: "base", place: 2 },
      { label: "cand", place: 1 },
      { label: "base", place: 3 },
    ]);
    expect(finishesOf(result(null, "boom"))).toEqual([]);
  });
});
