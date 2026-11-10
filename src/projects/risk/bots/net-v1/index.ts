import type { Bot } from "../bot";
import { netBot, type Pick } from "./play";
import { WEIGHT_SETS } from "./weights";

export { decide, isPick, netBot, PICKS, type Decision, type Pick } from "./play";

// net-v1 (`ideas/gpu-engine.md`, phase 3): the network trained on the GPU engine, exported to
// TypeScript. It sees exactly what the trainer's network sees, built from its seat's view, options
// and history (`observe.ts`), runs the same network (`network.ts`), and plays as it was trained
// (`play.ts`): it samples the main choice from the softmax of the legal main logits, then the
// amount bucket from the softmax of that choice's amount logits, decoded as the trainer decodes
// them (`actions.ts`). The draws come from the bot's own seed, one stream per decision, so the
// same seed and position give the same move. Its most likely move (the highest logit each time,
// ties to the lower index) is a mode of its own, `argmax`, which the parity test plays. Which mode
// plays better is measured per weight set: argmax stalled the from-scratch nets and imit-1, and
// plays as well as sampling once PPO has trained from imit-1 (`ideas/learned-bot.md`).

/** The weight set the plain label plays. */
export const DEFAULT_WEIGHTS = "m1a-50";

/** net-v1 with a named weight set. */
export function netV1(weights: string, pick: Pick = "sample"): Bot {
  if (!Object.hasOwn(WEIGHT_SETS, weights)) throw new Error(`no net-v1 weight set "${weights}" (known: ${Object.keys(WEIGHT_SETS).join(", ")})`);
  return netBot(WEIGHT_SETS[weights], pick);
}

export const netV1Bot: Bot = netV1(DEFAULT_WEIGHTS);
