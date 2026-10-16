import { describe, expect, it } from "vitest";
import { estimateFinish, runState, sprtNeedle, STALE_MS, winShare } from "./live-row";
import { sprtBounds } from "./sprt";

describe("estimateFinish", () => {
  it("extrapolates the pace kept so far", () => {
    expect(estimateFinish(1000, 3000, 0.5)).toBe(5000);
  });

  it("has nothing to go on before any progress, or for a run that can't tell", () => {
    expect(estimateFinish(1000, 3000, 0)).toBeNull();
    expect(estimateFinish(1000, 3000, null)).toBeNull();
  });

  it("is now once the work is done", () => {
    expect(estimateFinish(1000, 3000, 1)).toBe(3000);
  });
});

describe("runState", () => {
  const at = Date.parse("2026-10-16T12:00:00Z");
  const row = (status: "running" | "done", agoMs: number) => ({ status, updated_at: new Date(at - agoMs).toISOString() });

  it("reads a running row as running while it beats", () => {
    expect(runState(row("running", STALE_MS), at)).toBe("running");
  });

  it("reads a running row gone quiet as lost", () => {
    expect(runState(row("running", STALE_MS + 1), at)).toBe("lost");
  });

  it("never reads an ended row as lost", () => {
    expect(runState(row("done", 10 * STALE_MS), at)).toBe("done");
  });
});

describe("sprtNeedle", () => {
  const bounds = sprtBounds(0.05, 0.05);

  it("rests in the middle before any evidence", () => {
    expect(sprtNeedle({ llrImprove: 0, llrRegress: 0, ...bounds })).toEqual({ position: 0.5, even: 0 });
  });

  it("reaches either end at its bound", () => {
    expect(sprtNeedle({ llrImprove: bounds.upper, llrRegress: -5, ...bounds }).position).toBe(1);
    expect(sprtNeedle({ llrImprove: -5, llrRegress: bounds.upper, ...bounds }).position).toBe(0);
    expect(sprtNeedle({ llrImprove: bounds.upper / 2, llrRegress: -1, ...bounds }).position).toBeCloseTo(0.75);
  });

  it("fills toward a tie only as both tests near their lower bound", () => {
    expect(sprtNeedle({ llrImprove: bounds.lower, llrRegress: bounds.lower, ...bounds }).even).toBe(1);
    expect(sprtNeedle({ llrImprove: bounds.lower, llrRegress: bounds.lower / 2, ...bounds }).even).toBeCloseTo(0.5);
    expect(sprtNeedle({ llrImprove: bounds.lower, llrRegress: 1, ...bounds }).even).toBe(0);
  });
});

describe("winShare", () => {
  it("is the share of decisive games won", () => {
    expect(winShare({ wins: 3, losses: 1 })).toBe(0.75);
    expect(winShare({ wins: 0, losses: 0 })).toBeNull();
  });
});
