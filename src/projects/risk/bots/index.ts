import type { Bot } from "./bot";
import { gdAggressiveBot, gdContinentalBot, gdDefensiveBot, gdStackerBot } from "./gd";
import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import { ruleV1Bot } from "./rule-v1";

/** Every bot the measuring harness can seat, by label. */
export const RISK_BOTS: Readonly<Record<string, Bot>> = {
  random: randomBot,
  greedy: greedyBot,
  "rule-v1": ruleV1Bot,
  "gd-defensive": gdDefensiveBot,
  "gd-continental": gdContinentalBot,
  "gd-aggressive": gdAggressiveBot,
  "gd-stacker": gdStackerBot,
};

export function riskBot(label: string): Bot {
  if (!Object.hasOwn(RISK_BOTS, label)) {
    throw new Error(`no Risk bot "${label}" (known: ${Object.keys(RISK_BOTS).join(", ")})`);
  }
  return RISK_BOTS[label];
}
