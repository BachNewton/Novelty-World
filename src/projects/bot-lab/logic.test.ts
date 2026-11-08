import { describe, expect, it } from "vitest";
import { type LiveRow, type RunStatus } from "@/shared/lib/bot-lab/live-row";
import { botLabel, elapsedMs, mergeRow } from "./logic";

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
describe("botLabel", () => {

  it("splits a tuned bot into its base and its overrides", () => {
    expect(botLabel('rule-v3~{"incomeHorizon":2.4354,"borderWeight":0.347}')).toEqual({
      base: "rule-v3",
      tuning: '{"incomeHorizon":2.4354,"borderWeight":0.347}',
    });
  });
});
