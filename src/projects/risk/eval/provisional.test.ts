import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import RATINGS from "../bots/ratings.json";
import { SEAT_BOTS, type RowBotId } from "../online/seat-roster";
import { keptFingerprints } from "./frozen-games";
import { readGauntlets, type GauntletRecord } from "./gauntlet-log";
import { keepProvisional, provisionalElo, provisionalProblems, type RatingsFile } from "./provisional";

const FROZEN = { "frozen-a": "aaa", "frozen-b": "bbb" };

function gauntlet(run: string, candidate: string, field: string[], elo: Record<string, number>, error: number): GauntletRecord {
  return {
    run,
    commit: "c",
    candidate,
    base: field[0],
    field,
    players: [3, 4, 5, 6],
    formats: ["one-in", "one-out"],
    prefix: "train",
    margin: 30,
    alpha: 0.05,
    beta: 0.05,
    elo,
    eloError: { [candidate]: error },
    pairings: [],
    accepted: true,
    errors: 0,
    frozen: FROZEN,
  };
}

const measured = { greedy: 1000, "rule-v7.1": 1630, "learned-v1": 1690 };
const train = gauntlet("t1", "net~x", ["learned-v1"], { "net~x": 250, "learned-v1": 0 }, 30);
const holdout = gauntlet("t2", "net~x", ["learned-v1"], { "net~x": 240, "learned-v1": 0 }, 60);

describe("a provisional Elo", () => {
  it("reads each gauntlet on the ladder's scale through its field's measured bots", () => {
    const suite = gauntlet("s", "net~x", ["rule-v7.1", "greedy"], { "net~x": 400, "rule-v7.1": 0, greedy: -650 }, 40);
    // The field sits at 1630 and 1000 on the ladder and 0 and −650 in the gauntlet: shifted by their mean gap, 1640.
    expect(provisionalElo("net~x", [suite], measured).estimates[0].elo).toBeCloseTo(2040, 9);
  });

  it("combines its gauntlets by the inverse of their variances", () => {
    const { entry } = provisionalElo("net~x", [train, holdout], measured);
    // (1940/900 + 1930/3600) / (1/900 + 1/3600) = 1938; its error 1/sqrt(1/900 + 1/3600) = 26.8.
    expect(entry).toEqual({ elo: 1938, error: 26.8, as: "net~x", gauntlets: ["t1", "t2"] });
  });

  it("leaves out a gauntlet whose games threw or whose field no ladder measured, and fails loudly when none is left", () => {
    const threw = { ...holdout, run: "t3", errors: 2 };
    const unrated = gauntlet("t4", "net~x", ["net-v2"], { "net~x": 100, "net-v2": 0 }, 30);
    expect(provisionalElo("net~x", [train, threw, unrated], measured).entry.gauntlets).toEqual(["t1"]);
    expect(() => provisionalElo("net~x", [threw, unrated], measured)).toThrow(/no gauntlet of "net~x"/);
  });

  it("gives way to the ladder's Elo once a ladder measures the bot, and is read again on a ladder's new scale when it doesn't", () => {
    const was: RatingsFile = { measured: "old", anchor: "greedy = 1000", elo: measured, provisional: { "learned-v2": provisionalElo("net~x", [train], measured).entry } };
    const measuredIt = keepProvisional(was, { measured: "new", anchor: "greedy = 1000", elo: { ...measured, "learned-v2": 1958 } }, [train]);
    expect(measuredIt).toEqual({ measured: "new", anchor: "greedy = 1000", elo: { ...measured, "learned-v2": 1958 } });
    const rescaled = keepProvisional(was, { measured: "new", anchor: "greedy = 1000", elo: { ...measured, "learned-v1": 1700 } }, [train]);
    expect(rescaled.provisional?.["learned-v2"].elo).toBe(1950);
  });
});

describe("a provisional entry that no gauntlet backs", () => {
  const seatable = new Set(["learned-v2"]);
  const runs = new Set(["t1", "t2"]);
  const fingerprints = () => FROZEN;
  const file = (entry: object): RatingsFile => ({ measured: "m", anchor: "greedy = 1000", elo: measured, provisional: { "learned-v2": entry as never } });
  const problems = (entry: object, gauntlets = [train, holdout], runLog = runs, prints = fingerprints) =>
    provisionalProblems(file(entry), gauntlets, runLog, seatable, prints);
  const right = provisionalElo("net~x", [train, holdout], measured).entry;

  it("is accepted only as its gauntlets make it", () => {
    expect(problems(right)).toEqual([]);
  });

  it("fails when typed by hand: another number, a gauntlet left out, or no gauntlet at all", () => {
    expect(problems({ ...right, elo: 2000 })).toHaveLength(1);
    expect(problems({ ...provisionalElo("net~x", [train], measured).entry })).toHaveLength(1);
    expect(problems({ ...right, as: "typed" })).toEqual([expect.stringMatching(/no gauntlet of "typed"/)]);
  });

  it("fails when a gauntlet has no run behind it, or measured a bot that plays otherwise", () => {
    expect(problems(right, [train, holdout], new Set(["t1"]))).toEqual([expect.stringMatching(/t2 has no record in the run log/)]);
    expect(problems(right, [train, holdout], runs, () => ({ ...FROZEN, "frozen-b": "other" }))).toHaveLength(2);
  });
});

describe("the seatable bots' provisional Elo", () => {
  it("is backed by the gauntlet log, the run log and the bots' frozen games", () => {
    const runLog = fileURLToPath(new URL("./runs.jsonl", import.meta.url));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run log beside this test
    const runs = new Set(readFileSync(runLog, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => (JSON.parse(l) as { started: string }).started));
    const file: RatingsFile = RATINGS;
    expect(provisionalProblems(file, readGauntlets(), runs, new Set(Object.keys(SEAT_BOTS)), (bot) => keptFingerprints(bot as RowBotId))).toEqual([]);
  });
});
