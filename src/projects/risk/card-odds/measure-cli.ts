import { FULL_DECK } from "../cards";
import { greedyBot } from "../bots/greedy";
import type { BotInput } from "../bots/bot";
import { playGame } from "../eval/runner";
import { estimateBelief } from "./estimate";
import { summarise } from "./odds";
import { sampleBelief } from "./sample";
import { SCENARIOS } from "./scenarios";
import { beliefGap, bruteForceBelief, oddsGap } from "./test-kit";
import { buildTimeline } from "./timeline";

// Measures the card odds' two yardsticks, run on demand while the module is worked on:
//  1. the sampler against the brute force on the small scenarios, within 4 standard errors;
//  2. the estimate against the sampler at real positions (every sixth turn of a 4- and a 6-player
//     game), where the brute force can't reach and timing matters most.
// Exits non-zero when either falls outside its bar.

const SAMPLES = 4000;
const MIN_EFFECTIVE = 1000;
const MAX_GAP = 0.04;
const MEAN_GAP = 0.015;

let failed = false;

console.log("sampler against brute force");
for (const [name, s] of Object.entries(SCENARIOS)) {
  const timeline = buildTimeline(s);
  if (!timeline) throw new Error(`${name}: the viewer is in the game`);
  const sampled = sampleBelief(timeline, 20_000, name);
  const tolerance = (4 * 0.5) / Math.sqrt(sampled.effective);
  const gap = beliefGap(sampled.belief, bruteForceBelief(s));
  const ok = sampled.effective > 2_000 && gap < tolerance;
  failed ||= !ok;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: gap ${gap.toFixed(4)} (bar ${tolerance.toFixed(4)}), ${sampled.effective.toFixed(0)} effective samples`);
}

console.log("estimate against sampler at real positions");
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
    const sampled = sampleBelief(timeline, SAMPLES, `${seed}/${input.view.turn.toString()}`);
    if (sampled.effective < MIN_EFFECTIVE) continue;
    const gap = oddsGap(summarise(estimateBelief(timeline)), summarise(sampled.belief));
    gaps.push(gap.holdsSet, gap.bestSet, gap.nextDraw);
  }
}
const max = Math.max(...gaps);
const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
const ok = gaps.length > 30 && max < MAX_GAP && mean < MEAN_GAP;
failed ||= !ok;
console.log(`  ${ok ? "ok  " : "FAIL"} ${gaps.length.toString()} odds: worst gap ${max.toFixed(4)} (bar ${MAX_GAP.toString()}), mean ${mean.toFixed(4)} (bar ${MEAN_GAP.toString()})`);

if (failed) process.exitCode = 1;
