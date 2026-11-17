import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOT_MODULES, RISK_BOTS } from "../bots";
import { carriedCode, carryable } from "./ratings-cache";
import { sourceClosure } from "./source-hash";

describe("carrying a record across an edit", () => {
  const matchup = { lone: "gd-defensive", rest: "learned-v1", players: 6 };
  const now = { game: "g1", lone: "d1", rest: "l2" };

  it("takes a record whose only change is a carried bot's code over to the code now", () => {
    expect(carriedCode("g1.d1.l1", now, matchup, new Set(["learned-v1"]))).toBe("g1.d1.l2");
  });

  it("never carries a bot that isn't carried, nor a change to the game's own code", () => {
    expect(carriedCode("g1.d1.l1", now, matchup, new Set())).toBeNull();
    expect(carriedCode("g1.d0.l1", now, matchup, new Set(["learned-v1"]))).toBeNull();
    expect(carriedCode("g0.d1.l1", now, matchup, new Set(["learned-v1", "gd-defensive"]))).toBeNull();
  });

  it("offers only records stale through frozen bots alone: a research bot's edit, or the game's, plays again", () => {
    const stale = (changed: string[], game = false) => ({ ...matchup, changed, game, groups: 3 });
    const seated = (l: string) => l === "learned-v1" || l === "gd-defensive";
    const records = [stale(["learned-v1"]), stale(["net-v2"]), stale(["learned-v1", "net-v2"]), stale([], true), stale(["learned-v1"], true)];
    expect(carryable(records, seated)).toEqual([records[0]]);
  });

  it("never carries a record played wholly in the native crate", () => {
    expect(carriedCode("native.abc", now, matchup, new Set(["learned-v1", "gd-defensive"]))).toBeNull();
  });
});

const BOTS = fileURLToPath(new URL("../bots/", import.meta.url));

describe("the ratings cache's view of the code", () => {
  it("knows the module of every registered bot, so a change to one replays its matchups", () => {
    expect(Object.keys(BOT_MODULES).sort()).toEqual(Object.keys(RISK_BOTS).sort());
    for (const entry of Object.values(BOT_MODULES)) expect(sourceClosure([path.join(BOTS, entry)])).toContain(path.join(BOTS, entry));
  });

  it("follows a bot's imports into the frozen versions it shares code with, and no further", () => {
    const files = sourceClosure([path.join(BOTS, "rule-v3/index.ts")]).map((f) => path.relative(BOTS, f).replaceAll("\\", "/"));
    expect(files).toEqual(expect.arrayContaining(["rule-v3/planner.ts", "rule-v1/odds.ts"]));
    expect(files.some((f) => f.startsWith("rule-v2/") || f.startsWith("gd/"))).toBe(false);
  });
});
