import { describe, expect, it } from "vitest";
import type { Move, Options } from "../contract";
import { Agreement, sameMove } from "./agreement";
import type { BotInput } from "../bots/bot";

describe("risk:agreement's tally", () => {
  it("reads two moves with their fields in another order as the same", () => {
    expect(sameMove({ kind: "place", territory: "peru", armies: 3 }, { armies: 3, territory: "peru", kind: "place" } as Move)).toBe(true);
    expect(sameMove({ kind: "place", territory: "peru", armies: 3 }, { kind: "place", territory: "peru", armies: 2 })).toBe(false);
  });

  it("counts a reinforce decision with a trade in either answer as a trade, and one without as a placement", () => {
    const place: Move = { kind: "place", territory: "peru", armies: 3 };
    const trade: Move = { kind: "trade", cards: ["peru", "brazil", "venezuela"] } as Move;
    const options = { kind: "reinforce" } as Options;
    const input = { options } as BotInput;
    const agreement = new Agreement(() => place, new Map([["trades", () => trade], ["places", () => place]]));
    agreement.decided(input, place);
    const trades = agreement.tallies.get("trades");
    const places = agreement.tallies.get("places");
    expect(trades?.trade).toEqual({ asked: 1, same: 0 });
    expect(trades?.placement).toEqual({ asked: 0, same: 0 });
    expect(places?.placement).toEqual({ asked: 1, same: 1 });
    expect(places?.all).toEqual({ asked: 1, same: 1 });
  });
});
