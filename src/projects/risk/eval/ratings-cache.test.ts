import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOT_MODULES, RISK_BOTS } from "../bots";
import { sourceClosure } from "./source-hash";

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
