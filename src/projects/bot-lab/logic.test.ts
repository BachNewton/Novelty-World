import { describe, expect, it } from "vitest";
import { STALE_MS, type LiveRow, type RunStatus } from "@/shared/lib/bot-lab/live-row";
import { elapsedMs, formatDuration, formatElo, mergeRow, orderRuns } from "./logic";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const iso = (agoMs: number) => new Date(NOW - agoMs).toISOString();

function row(id: string, status: RunStatus, startedAgoMs: number, updatedAgoMs = 0): LiveRow {
  return {
    id,
    game: "risk",
    tool: "risk:gauntlet",
    bots: [],
    args: [],
    seeds: "train",
    workers: 1,
    status,
    started_at: iso(startedAgoMs),
    updated_at: iso(updatedAgoMs),
    progress: { games: 0, decisions: 0, gamesPerSecond: 0, fraction: null, eta: null, steps: [] },
    result: null,
  };
}

describe("orderRuns", () => {
  it("lists live runs first and everything else after, newest first", () => {
    const rows = [
      row("old-done", "done", 9000),
      row("lost", "running", 5000, STALE_MS + 1),
      row("live-old", "running", 4000),
      row("new-done", "done", 1000),
      row("live-new", "running", 2000),
    ];
    const { live, ended } = orderRuns(rows, NOW);
    expect(live.map((r) => r.id)).toEqual(["live-new", "live-old"]);
    expect(ended.map((r) => r.id)).toEqual(["new-done", "lost", "old-done"]);
  });
});

describe("mergeRow", () => {
  it("adds a new row and replaces an older write of the same one", () => {
    const first = row("a", "running", 1000, 500);
    const later = { ...row("a", "done", 1000, 0) };
    expect(mergeRow([], first)).toEqual([first]);
    expect(mergeRow([first], later)).toEqual([later]);
  });

  it("keeps the newer write when an older one arrives late", () => {
    const newer = row("a", "done", 1000, 0);
    expect(mergeRow([newer], row("a", "running", 1000, 500))).toEqual([newer]);
  });
});

describe("elapsedMs", () => {
  it("runs to now while the run plays, and stops at its last write once lost", () => {
    expect(elapsedMs(row("a", "running", 60_000), "running", NOW)).toBe(60_000);
    expect(elapsedMs(row("a", "running", 60_000, 40_000), "lost", NOW)).toBe(20_000);
  });
});

describe("formatDuration", () => {
  it("reads at the grain worth reading", () => {
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(425_000)).toBe("7m 05s");
    expect(formatDuration(3 * 3600_000 + 12 * 60_000)).toBe("3h 12m");
  });
});

describe("formatElo", () => {
  it("signs every rating", () => {
    expect(formatElo(12.4)).toBe("+12");
    expect(formatElo(-30.6)).toBe("−31");
  });
});
