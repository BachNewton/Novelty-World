import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { amountBuckets, decode, legalMain } from "./actions";
import { amountLogits, argmax, loadNet, mainLogits, sampleIndex, trunk, values, type Net, type NetWeights } from "./network";
import { observe, type Observation } from "./observe";
import { WEIGHT_SETS } from "./weights";

// net-v1 (`ideas/gpu-engine.md`, phase 3): the network trained by self-play on the GPU engine,
// exported to TypeScript. It sees exactly what the trainer's network sees, built from its seat's
// view, options and history (`observe.ts`), runs the same network (`network.ts`), and plays as it
// was trained: it samples the main choice from the softmax of the legal main logits, then the
// amount bucket from the softmax of that choice's amount logits, decoded as the trainer decodes
// them (`actions.ts`). The draws come from the bot's own seed, one stream per decision, so the
// same seed and position give the same move. Its most likely move (the highest logit each time,
// ties to the lower index) is a mode of its own, `argmax`, which the parity test plays: played
// that way the network stalls, capping far more games than when it samples.

/** The weight set the plain label plays. */
export const DEFAULT_WEIGHTS = "m1a-50";

/** How a choice is made from the logits: drawn from their softmax (as trained), or the highest. */
export const PICKS = ["sample", "argmax"] as const;
export type Pick = (typeof PICKS)[number];

export function isPick(value: unknown): value is Pick {
  return PICKS.some((p) => p === value);
}

/** Everything one decision computed, for tests and tools. */
export interface Decision {
  obs: Observation;
  legal: Uint8Array;
  /** The main logits, −∞ where the choice isn't legal. */
  logits: Float64Array;
  value: Float64Array;
  main: number;
  amountLogits: Float64Array;
  amount: number;
  move: Move;
}

export function decide(net: Net, input: BotInput, pick: Pick): Decision {
  const rng = pick === "sample" ? createRng(input.seed) : null;
  const choose = (z: ArrayLike<number>, allowed?: Uint8Array): number => (rng ? sampleIndex(z, rng.next(), allowed) : argmax(z, allowed));
  const obs = observe(input);
  const legal = legalMain(input.options);
  const y = trunk(net, obs);
  const logits = mainLogits(net, y, legal);
  const main = choose(logits, legal);
  const amounts = amountLogits(net, y, main);
  if (amounts.length !== amountBuckets(main)) throw new Error(`choice ${main.toString()} has ${amountBuckets(main).toString()} amounts, not ${amounts.length.toString()}`);
  const amount = choose(amounts);
  return { obs, legal, logits, value: values(net, y), main, amountLogits: amounts, amount, move: decode(main, amount, input.options, input.view) };
}

/** net-v1 with a weight set, its tensors read on its first decision. */
export function netBot(weights: NetWeights, pick: Pick = "sample"): Bot {
  let net: Net | null = null;
  return (input): Move => {
    net ??= loadNet(weights);
    return decide(net, input, pick).move;
  };
}

/** net-v1 with a named weight set. */
export function netV1(weights: string, pick: Pick = "sample"): Bot {
  if (!Object.hasOwn(WEIGHT_SETS, weights)) throw new Error(`no net-v1 weight set "${weights}" (known: ${Object.keys(WEIGHT_SETS).join(", ")})`);
  return netBot(WEIGHT_SETS[weights], pick);
}

export const netV1Bot: Bot = netV1(DEFAULT_WEIGHTS);
