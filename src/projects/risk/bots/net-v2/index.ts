import type { Bot } from "../bot";
import type { Pick } from "../net-v1/play";
import { netBot } from "./play";
import { WEIGHT_SETS } from "./weights";

export { decide, netBot, type Decision } from "./play";

// net-v2 (`ideas/learned-bot.md`, "The action space, rebuilt"): net-v1's observation and network with
// the trainer's exact action space, so it places, blitzes, moves in and fortifies exact counts and
// chooses its trade's set and bonus territory (`actions.ts`). It plays the weight sets of networks
// trained in that space (`python -m riskgpu.selfplay.export` writes them to `weights/`), sampling as
// trained or, `argmax`, its most likely move, as net-v1 does. A harness label only, until a weight
// set earns a seat.

/** net-v2 with a named weight set. */
export function netV2(weights: string, pick: Pick = "sample"): Bot {
  if (!Object.hasOwn(WEIGHT_SETS, weights)) throw new Error(`no net-v2 weight set "${weights}" (known: ${Object.keys(WEIGHT_SETS).join(", ")})`);
  return netBot(WEIGHT_SETS[weights], pick);
}
