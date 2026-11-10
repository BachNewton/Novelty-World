import { describe, expect, it } from "vitest";
import { byHourAndDay, MAX_GAP_MS, planCheck, type SpotWindow } from "./logic";

const T = Date.parse("2026-11-10T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function window(up: boolean, startedAt: number, endedAt: number): SpotWindow {
  return { id: 7, up, started_at: iso(startedAt), ended_at: iso(endedAt) };
}

describe("planCheck", () => {
  it("opens the first window on the first-ever check", () => {
    expect(planCheck(null, true, T)).toEqual({ update: null, insert: { up: true, startedAt: iso(T), endedAt: iso(T) } });
  });

  it("extends the current window when the state holds, writing no new row", () => {
    const latest = window(true, T - 600_000, T - 60_000);
    expect(planCheck(latest, true, T)).toEqual({
      update: { id: 7, expectedEndedAt: iso(T - 60_000), endedAt: iso(T) },
      insert: null,
    });
  });

  it("splits a flip halfway between the two checks, so the windows meet", () => {
    const latest = window(true, T - 600_000, T - 60_000);
    expect(planCheck(latest, false, T)).toEqual({
      update: { id: 7, expectedEndedAt: iso(T - 60_000), endedAt: iso(T - 30_000) },
      insert: { up: false, startedAt: iso(T - 30_000), endedAt: iso(T) },
    });
  });

  it("tolerates one missed check", () => {
    const latest = window(false, T - 600_000, T - 120_000);
    expect(planCheck(latest, false, T).update?.endedAt).toBe(iso(T));
  });

  it("leaves a gap after missed checks rather than assuming what happened, whether or not the state changed", () => {
    for (const up of [true, false]) {
      const latest = window(true, T - 3_600_000, T - MAX_GAP_MS - 1);
      expect(planCheck(latest, up, T)).toEqual({ update: null, insert: { up, startedAt: iso(T), endedAt: iso(T) } });
    }
  });

  it("refuses a check that isn't after the last one", () => {
    expect(() => planCheck(window(true, T - 60_000, T), true, T)).toThrow();
  });
});

describe("byHourAndDay", () => {
  it("splits a window at hour boundaries in local time", () => {
    const start = new Date(2026, 10, 10, 9, 45).getTime();
    const grid = byHourAndDay([window(true, start, start + 30 * 60_000)], 0, Infinity);
    const day = new Date(start).getDay();
    expect(grid[day][9]).toEqual({ upMs: 15 * 60_000, observedMs: 15 * 60_000 });
    expect(grid[day][10]).toEqual({ upMs: 15 * 60_000, observedMs: 15 * 60_000 });
  });
});
