import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { amountBuckets, decode, legalMain } from "./actions";
import { amountLogits, argmax, loadNet, mainLogits, sampleIndex, trunk, values, type Net, type NetWeights } from "./network";
import { observe, type Observation } from "./observe";

// How net-v1 plays a weight set it is handed, apart from the registry of every weight set
// (`weights/index.ts`), so a bot built on one set (a seated one) carries only that set.

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
