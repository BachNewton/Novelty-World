import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { argmax, mainLogits, sampleIndex, trunk, values, type NetWeights } from "../net-v1/network";
import { observe, type Observation } from "../net-v1/observe";
import type { Pick } from "../net-v1/play";
import { candidates, legalMainExact } from "./actions";
import { argLogits, loadNet, type Net } from "./network";

// How net-v2 plays a weight set it is handed, apart from the registry of every weight set
// (`weights/index.ts`), so a bot built on one set carries only that set.

/** Everything one decision computed, for tests and tools. */
export interface Decision {
  obs: Observation;
  legal: Uint8Array;
  /** The main logits, −∞ where the choice isn't legal. */
  logits: Float64Array;
  value: Float64Array;
  main: number;
  /** The argument logits over the slots, −∞ where a slot isn't legal. */
  argLogits: Float64Array;
  argLegal: Uint8Array;
  /** The argument's slot. */
  slot: number;
  move: Move;
}

export function decide(net: Net, input: BotInput, pick: Pick): Decision {
  const rng = pick === "sample" ? createRng(input.seed) : null;
  const choose = (z: ArrayLike<number>, allowed: Uint8Array): number => (rng ? sampleIndex(z, rng.next(), allowed) : argmax(z, allowed));
  const obs = observe(input);
  const legal = legalMainExact(input.options);
  const y = trunk(net, obs);
  const logits = mainLogits(net, y, legal);
  const main = choose(logits, legal);
  const c = candidates(main, input.options, input.view);
  const z = argLogits(net, y, c);
  const slot = choose(z, c.legal);
  const move = c.moves[slot];
  if (move === null) throw new Error(`net-v2's slot ${slot.toString()} of choice ${main.toString()} is no move`);
  return { obs, legal, logits, value: values(net, y), main, argLogits: z, argLegal: c.legal, slot, move };
}

/** net-v2 with a weight set, its tensors read on its first decision. */
export function netBot(weights: NetWeights, pick: Pick = "sample"): Bot {
  let net: Net | null = null;
  return (input): Move => {
    net ??= loadNet(weights);
    return decide(net, input, pick).move;
  };
}
