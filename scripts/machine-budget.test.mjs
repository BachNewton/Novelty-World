import { describe, expect, it } from "vitest";
import { admit } from "./machine-budget.mjs";

const budget = { cores: 14, gpu: 8 };
const running = (id, cores, gpu = 0) => ({ id, state: "running", cores, gpu });
const waiting = (id, cores, gpu = 0) => ({ id, state: "waiting", cores, gpu });

describe("admit", () => {
  it("starts waiting runs in order while they fit beside what's running", () => {
    expect(admit([running("a", 6), waiting("b", 4), waiting("c", 4), waiting("d", 2)], budget)).toEqual(["b", "c"]);
  });

  it("never lets a small run slip past a big one that doesn't fit yet", () => {
    expect(admit([running("a", 10), waiting("big", 6), waiting("small", 2)], budget)).toEqual([]);
  });

  it("holds browser work to the GPU's pages whatever the cores", () => {
    expect(admit([running("e2e", 5, 6), waiting("e2e2", 5, 6)], budget)).toEqual([]);
    expect(admit([running("e2e", 5, 6), waiting("tool", 2, 2), waiting("tool2", 2, 2)], budget)).toEqual(["tool"]);
  });

  it("starts a run bigger than the budget only once it would be alone", () => {
    expect(admit([running("a", 1), waiting("huge", 20)], budget)).toEqual([]);
    expect(admit([waiting("huge", 20), waiting("next", 1)], budget)).toEqual(["huge"]);
  });
});
