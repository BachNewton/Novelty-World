import { describe, expect, it } from "vitest";
import type { GameEvent, Move, Options } from "../contract";
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
    const input = { seat: 0, options, history: [] } as unknown as BotInput;
    const agreement = new Agreement(() => place, new Map([["trades", () => trade], ["places", () => place]]));
    agreement.decided(input, place);
    const trades = agreement.tallies.get("trades");
    const places = agreement.tallies.get("places");
    expect(trades?.trade).toEqual({ asked: 1, same: 0 });
    expect(trades?.placement).toEqual({ asked: 0, same: 0 });
    expect(places?.placement).toEqual({ asked: 1, same: 1 });
    expect(places?.all).toEqual({ asked: 1, same: 1 });
  });

  it("doesn't ask a bot the rest of a reinforce phase once it answered one of its decisions otherwise", () => {
    const first: Move = { kind: "place", territory: "peru", armies: 2 };
    const second: Move = { kind: "place", territory: "brazil", armies: 1 };
    const elsewhere: Move = { kind: "place", territory: "argentina", armies: 2 };
    const reinforce = (history: readonly GameEvent[]) => ({ seat: 1, options: { kind: "reinforce" } as Options, history }) as unknown as BotInput;
    const phase: GameEvent = { kind: "phase", phase: "reinforce" } as GameEvent;
    const placed = { kind: "placed", territory: "peru", armies: 2 } as GameEvent;
    const asked: string[] = [];
    const bot = (label: string, answer: (input: BotInput) => Move) => (input: BotInput) => {
      asked.push(label);
      return answer(input);
    };
    // The base plays the phase as played; "strays" places elsewhere first, so its plan can't place the rest.
    const agreement = new Agreement(
      bot("base", (i) => (i.history.length === 1 ? first : second)),
      new Map([["follows", bot("follows", (i) => (i.history.length === 1 ? first : second))], ["strays", bot("strays", () => elsewhere)]]),
    );
    agreement.decided(reinforce([phase]), first);
    agreement.decided(reinforce([phase, placed]), second);
    expect(asked).toEqual(["base", "follows", "strays", "base", "follows"]);
    expect(agreement.tallies.get("follows")?.placement).toEqual({ asked: 2, same: 2 });
    expect(agreement.tallies.get("strays")?.placement).toEqual({ asked: 1, same: 0 });
    expect(agreement.tallies.get("strays")?.offPath).toBe(1);

    // A new phase puts every bot back on its path.
    agreement.decided(reinforce([phase, placed, phase]), first);
    expect(agreement.tallies.get("strays")?.placement).toEqual({ asked: 2, same: 0 });
  });
});
