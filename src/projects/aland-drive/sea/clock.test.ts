import { afterEach, describe, expect, it, vi } from "vitest";
import { seaClock } from "./clock";

describe("the world's clock", () => {
  afterEach(() => vi.useRealTimers());

  it("starts at the moment `?sea=` asks for on its first read, however long the page took to get there, and runs at real speed", () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-04T09:00:00Z") });
    const clock = seaClock("?sea=2026-11-04T12:18:00Z");
    vi.advanceTimersByTime(40_000);
    expect(clock()).toBe(Date.parse("2026-11-04T12:18:00Z") / 1000);
    vi.advanceTimersByTime(90_000);
    expect(clock()).toBe(Date.parse("2026-11-04T12:19:30Z") / 1000);
  });

  it("refuses a time it can't read rather than showing the boats somewhere else", () => {
    expect(() => seaClock("?sea=noon")).toThrow(/takes a time/);
  });
});
