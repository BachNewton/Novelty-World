import { describe, expect, it } from "vitest";
import { greedyBot } from "../bots/greedy";
import { playGame } from "../eval/runner";
import { estimateBelief } from "./estimate";
import { cardOdds } from "./index";
import { summarise } from "./odds";
import { SCENARIOS } from "./scenarios";
import { bruteForceBelief, oddsGap } from "./test-kit";
import { buildTimeline } from "./timeline";

describe("estimateBelief", () => {
  for (const [name, s] of Object.entries(SCENARIOS)) {
    it(`comes close to the brute force: ${name}`, () => {
      const timeline = buildTimeline(s);
      if (!timeline) throw new Error("the viewer is in the game");
      const gap = oddsGap(summarise(estimateBelief(timeline)), summarise(bruteForceBelief(s)));
      expect(Math.max(gap.holdsSet, gap.bestSet, gap.nextDraw)).toBeLessThan(0.01);
    });
  }
});

describe("cardOdds", () => {
  it("reads every seat's history through a whole game", () => {
    let asked = 0;
    playGame({
      seed: "card-odds",
      bots: Array.from({ length: 4 }, () => greedyBot),
      maxTurns: 200,
      observe: {
        decided(input) {
          const odds = cardOdds(input.seat, input.view, input.history);
          if (!odds) throw new Error("a seat to move is in the game");
          odds.hands.forEach((hand, seat) => {
            if (!hand) return;
            expect(hand.cards).toBe(input.view.seats[seat].handSize);
            expect(hand.holdsSet).toBeGreaterThanOrEqual(0);
            expect(hand.holdsSet).toBeLessThanOrEqual(1 + 1e-9);
          });
          expect(odds.nextDraw.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 9);
          asked++;
        },
      },
    });
    expect(asked).toBeGreaterThan(100);
  });
});
