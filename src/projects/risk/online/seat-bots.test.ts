import { describe, expect, it } from "vitest";
import { RISK_BOTS } from "../bots";
import { BOT_IDS, botName, DEFAULT_BOT, RANKS, SEAT_BOTS, seatBot, strength, type BotId } from "./seat-bots";

describe("the seatable bots", () => {
  it("take the lowest rungs of the ladder, one each, in order of strength", () => {
    expect(new Set(RANKS).size).toBe(RANKS.length);
    expect(BOT_IDS.map((id) => SEAT_BOTS[id].rank)).toEqual(RANKS.slice(0, BOT_IDS.length));
    expect(BOT_IDS.map(strength)).toEqual(BOT_IDS.map((_, i) => i + 1));
  });

  it("are the measured bots themselves", () => {
    for (const id of BOT_IDS) expect(SEAT_BOTS[id].bot).toBe(RISK_BOTS[id]);
  });

  it("seat the strongest by default", () => {
    expect(DEFAULT_BOT).toBe("rule-v1");
    expect(strength(DEFAULT_BOT)).toBe(BOT_IDS.length);
  });

  it("fail loudly on a bot no longer seated", () => {
    expect(botName("random")).toBe("Recruit (bot)");
    expect(() => seatBot("retired" as BotId)).toThrow(/no seatable bot "retired"/);
  });
});
