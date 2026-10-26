import { describe, expect, it } from "vitest";
import { RISK_BOTS } from "../bots";
import { BOT_IDS, botName, DEFAULT_BOT, ELO, eloOf, fullName, isBotId, isRetired, RANKS, rankOf, RETIRED_BOTS, SEAT_BOTS, seatBot, strength, type BotId, type RetiredBotId } from "./seat-bots";

describe("the seatable bots", () => {
  it("take the lowest rungs of the ladder, one each, in order of measured Elo", () => {
    expect(new Set(RANKS).size).toBe(RANKS.length);
    expect(BOT_IDS.map(rankOf)).toEqual(RANKS.slice(0, BOT_IDS.length));
    expect(BOT_IDS.map(strength)).toEqual(BOT_IDS.map((_, i) => i + 1));
    expect(BOT_IDS.map(eloOf)).toEqual(BOT_IDS.map(eloOf).sort((a, b) => a - b));
  });

  it("each have a measured Elo, and random, which never wins, isn't one of them", () => {
    expect(Object.keys(ELO).sort()).toEqual([...BOT_IDS].sort());
    expect(isBotId("random")).toBe(false);
    expect(eloOf("greedy")).toBe(1000);
  });

  it("include GD's four Expert personas, whatever they rank", () => {
    for (const id of ["gd-defensive", "gd-continental", "gd-aggressive", "gd-stacker"] as const) {
      expect(BOT_IDS).toContain(id);
      expect(seatBot(id).version).toBe("Expert");
    }
  });

  it("are the measured bots themselves", () => {
    for (const id of BOT_IDS) expect(SEAT_BOTS[id].bot).toBe(RISK_BOTS[id]);
  });

  it("seat the strongest by default", () => {
    expect(strength(DEFAULT_BOT)).toBe(BOT_IDS.length);
    for (const id of BOT_IDS) expect(eloOf(id)).toBeLessThanOrEqual(eloOf(DEFAULT_BOT));
  });

  it("are named by rank, name and version, and fail loudly on a bot no longer seated", () => {
    expect(botName(BOT_IDS[0])).toBe(`Recruit · ${fullName(BOT_IDS[0])}`);
    expect(botName("rule-v1")).toBe(`${rankOf("rule-v1")} · Rule v1`);
    expect(() => seatBot("retired" as BotId)).toThrow(/no seatable bot "retired"/);
  });
});

describe("retired bots", () => {
  const retired = Object.keys(RETIRED_BOTS) as RetiredBotId[];

  it("are none of the seatable bots, and are still registered for replaying their games", () => {
    for (const id of retired) {
      expect(isRetired(id)).toBe(true);
      expect(isBotId(id)).toBe(false);
      expect(RISK_BOTS[id]).toBeDefined();
    }
  });

  it("are named with their version, rated at their last Elo, and play no game", () => {
    expect(botName("rule-v6")).toBe("Retired · Rule v6");
    expect(fullName("rule-v6")).toBe("Rule v6");
    expect(eloOf("rule-v6")).toBe(RETIRED_BOTS["rule-v6"].elo);
    expect(() => seatBot("rule-v6")).toThrow(/"rule-v6": it is retired/);
  });
});
