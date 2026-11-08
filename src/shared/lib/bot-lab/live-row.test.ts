import { describe, expect, it } from "vitest";
import { runState, sprtNeedle, STALE_MS } from "./live-row";
import { sprtBounds } from "./sprt";
describe("runState", () => {
  const at = Date.parse("2026-10-16T12:00:00Z");
  const row = (status: "running" | "done", agoMs: number, quietMs?: number) => ({
    status,
    updated_at: new Date(at - agoMs).toISOString(),
    progress: quietMs === undefined ? {} : { quietUntil: new Date(at - agoMs + quietMs).toISOString() },
  });

  it("reads a running row as running while it beats", () => {
    expect(runState(row("running", STALE_MS), at)).toBe("running");
  });

  it("reads a running row gone quiet as lost", () => {
    expect(runState(row("running", STALE_MS + 1), at)).toBe("lost");
  });

  it("reads a remote run quiet between rounds as running until its quiet ends", () => {
    expect(runState(row("running", 10 * STALE_MS, 10 * STALE_MS), at)).toBe("running");
    expect(runState(row("running", 10 * STALE_MS, 10 * STALE_MS - 1), at)).toBe("lost");
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
