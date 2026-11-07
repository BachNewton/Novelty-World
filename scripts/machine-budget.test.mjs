import { describe, expect, it } from "vitest";
import { admit } from "./machine-budget.mjs";

const budget = { cores: 14, gpu: 2 };
const running = (id, cores, gpu = false) => ({ id, state: "running", cores, gpu });
const waiting = (id, cores, gpu = false) => ({ id, state: "waiting", cores, gpu });

describe("admit", () => {
  it("starts waiting runs in order while they fit beside what's running", () => {
    expect(admit([running("a", 6), waiting("b", 4), waiting("c", 4), waiting("d", 2)], budget)).toEqual(["b", "c"]);
  });

  it("never lets a small run slip past a big one that doesn't fit yet", () => {
    expect(admit([running("a", 10), waiting("big", 6), waiting("small", 2)], budget)).toEqual([]);
  });

  it("holds browser work to the GPU's slots whatever the cores", () => {
    expect(admit([running("a", 2, true), running("b", 2, true), waiting("c", 2, true)], budget)).toEqual([]);
    expect(admit([running("a", 2, true), waiting("b", 2, true), waiting("c", 2, true)], budget)).toEqual(["b"]);
  });

  it("starts a run bigger than the budget only once it would be alone", () => {
    expect(admit([running("a", 1), waiting("huge", 20)], budget)).toEqual([]);
    expect(admit([waiting("huge", 20), waiting("next", 1)], budget)).toEqual(["huge"]);
  });
});
