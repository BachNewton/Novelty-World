import type { Bot } from "./bot";
import { greedyBot } from "./greedy";
import { randomBot } from "./random";

/** Every bot the measuring harness can seat, by label. */
export const RISK_BOTS: Readonly<Record<string, Bot>> = {
  random: randomBot,
  greedy: greedyBot,
};

export function riskBot(label: string): Bot {
  if (!Object.hasOwn(RISK_BOTS, label)) {
    throw new Error(`no Risk bot "${label}" (known: ${Object.keys(RISK_BOTS).join(", ")})`);
  }
  return RISK_BOTS[label];
}
