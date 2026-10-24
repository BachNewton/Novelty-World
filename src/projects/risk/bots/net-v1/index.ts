import type { Move } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { amountBuckets, decode, legalMain } from "./actions";
import { amountLogits, argmax, loadNet, mainLogits, trunk, values, type Net, type NetWeights } from "./network";
import { observe, type Observation } from "./observe";
import { WEIGHT_SETS } from "./weights";

// net-v1 (`ideas/gpu-engine.md`, phase 3): the network trained by self-play on the GPU engine,
// exported to TypeScript. It sees exactly what the trainer's network sees, built from its seat's
// view, options and history (`observe.ts`), runs the same network (`network.ts`), and plays its
// most likely move: the highest main logit among the legal choices, then the highest amount
// bucket, ties to the lower index, decoded as the trainer decodes them (`actions.ts`). No
// sampling, so a position always gets the same move.

/** The weight set the plain label plays. */
export const DEFAULT_WEIGHTS = "m1a-25";

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

export function decide(net: Net, input: BotInput): Decision {
  const obs = observe(input);
  const legal = legalMain(input.options);
  const y = trunk(net, obs);
  const logits = mainLogits(net, y, legal);
  const main = argmax(logits, legal);
  const amounts = amountLogits(net, y, main);
  if (amounts.length !== amountBuckets(main)) throw new Error(`choice ${main.toString()} has ${amountBuckets(main).toString()} amounts, not ${amounts.length.toString()}`);
  const amount = argmax(amounts);
  return { obs, legal, logits, value: values(net, y), main, amountLogits: amounts, amount, move: decode(main, amount, input.options, input.view) };
}

/** net-v1 with a weight set, its tensors read on its first decision. */
export function netBot(weights: NetWeights): Bot {
  let net: Net | null = null;
  return (input): Move => {
    net ??= loadNet(weights);
    return decide(net, input).move;
  };
}

/** net-v1 with a named weight set. */
export function netV1(weights: string): Bot {
  if (!Object.hasOwn(WEIGHT_SETS, weights)) throw new Error(`no net-v1 weight set "${weights}" (known: ${Object.keys(WEIGHT_SETS).join(", ")})`);
  return netBot(WEIGHT_SETS[weights]);
}

export const netV1Bot: Bot = netV1(DEFAULT_WEIGHTS);
