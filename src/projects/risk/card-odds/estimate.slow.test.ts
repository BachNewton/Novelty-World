import { expect, it } from "vitest";
import { FULL_DECK } from "../cards";
import { greedyBot } from "../bots/greedy";
import type { BotInput } from "../bots/bot";
import { playGame } from "../eval/runner";
import { estimateBelief } from "./estimate";
import { summarise } from "./odds";
import { sampleBelief } from "./sample";
import { oddsGap } from "./test-kit";
import { buildTimeline } from "./timeline";

// The estimate against the sampler at real positions: the brute force reaches only tiny
// decks, so this is what holds the estimate to the exact odds in games as they are played,
// where timing matters most. Positions every sixth turn of a 4- and a 6-player game, where
// the sampler's effective samples keep its own error to about a point and a half.
const SAMPLES = 4000;
const MIN_EFFECTIVE = 1000;
const MAX_GAP = 0.04;
const MEAN_GAP = 0.015;

it("comes within a few points of the sampler at real positions", () => {
  const gaps: number[] = [];
  for (const [seed, players] of [["odds-4", 4], ["odds-6", 6]] as const) {
    const inputs: BotInput[] = [];
    let lastTurn = -1;
    playGame({
      seed,
      bots: Array.from({ length: players }, () => greedyBot),
      maxTurns: 200,
      observe: {
        decided(input) {
          if (input.view.turn !== lastTurn && input.view.turn % 6 === 0) inputs.push({ ...input, history: [...input.history] });
          lastTurn = input.view.turn;
        },
      },
    });
    for (const input of inputs) {
      const timeline = buildTimeline({ players, viewer: input.seat, history: input.history, hand: input.view.cards.hand, deck: FULL_DECK });
      if (!timeline) continue;
      const sampled = sampleBelief(timeline, SAMPLES, `${seed}/${input.view.turn}`);
      if (sampled.effective < MIN_EFFECTIVE) continue;
      const gap = oddsGap(summarise(estimateBelief(timeline)), summarise(sampled.belief));
      gaps.push(gap.holdsSet, gap.bestSet, gap.nextDraw);
    }
  }
  expect(gaps.length).toBeGreaterThan(30);
  expect(Math.max(...gaps)).toBeLessThan(MAX_GAP);
  expect(gaps.reduce((s, g) => s + g, 0) / gaps.length).toBeLessThan(MEAN_GAP);
}, 120_000);
