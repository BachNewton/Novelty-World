import { describe, expect, it } from "vitest";
import { randomFor } from "./random";

describe("randomFor", () => {
  it("gives the same rolls for the same seed and key, so a client predicts the server's roll", () => {
    expect(randomFor("game-1", "d7").dice(8)).toEqual(
      randomFor("game-1", "d7").dice(8),
    );
  });

  it("gives independent rolls to different decisions", () => {
    const a = randomFor("game-1", "d7").dice(16);
    const b = randomFor("game-1", "d8").dice(16);
    expect(a).not.toEqual(b);
  });

  it("rolls only the faces of a Betrayal die, in the right proportions", () => {
    const rolls = randomFor("faces", "k").dice(6000);
    const counts = [0, 1, 2].map(
      (face) => rolls.filter((r) => r === face).length,
    );
    expect(counts.reduce((a, b) => a + b)).toBe(6000);
    for (const count of counts) expect(count).toBeGreaterThan(1800);
  });

  it("shuffles into a permutation without changing its input", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    const shuffled = randomFor("s", "setup").shuffle(items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
