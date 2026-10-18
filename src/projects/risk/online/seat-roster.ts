import type { Bot } from "../bots/bot";
import { gdAggressiveBot, gdContinentalBot, gdDefensiveBot, gdStackerBot } from "../bots/gd";
import { greedyBot } from "../bots/greedy";
import { ruleV1Bot } from "../bots/rule-v1";
import { ruleV2Bot } from "../bots/rule-v2";
import { ruleV3Bot } from "../bots/rule-v3";
import { ruleV4Bot } from "../bots/rule-v4";

// The roster apart from its ranking (`seat-bots.ts`), so the ratings run that measures a
// newly seated bot can read it before the bot has an Elo to rank it by.

/** A bot a table can seat, by the id its row keeps: the label the measuring harness seats it
 *  by. The bots themselves live in `bots/`, the one home of every Risk bot, measured or played. */
export type BotId = "greedy" | "rule-v1" | "rule-v2" | "rule-v3" | "rule-v4" | "gd-defensive" | "gd-continental" | "gd-aggressive" | "gd-stacker";

export interface SeatBot {
  /** What players call it, with its version beside it. */
  name: string;
  version: string;
  bot: Bot;
}

/** Every bot a table can seat. GD's four Expert personas stay seatable whatever they rank:
 *  they are the yardstick players know. Random isn't one: it never wins, so it is only the
 *  harness's sanity floor. */
export const SEAT_BOTS: Record<BotId, SeatBot> = {
  greedy: { name: "Greedy", version: "Baseline", bot: greedyBot },
  "rule-v1": { name: "Rule", version: "v1", bot: ruleV1Bot },
  "rule-v2": { name: "Rule", version: "v2", bot: ruleV2Bot },
  "rule-v3": { name: "Rule", version: "v3", bot: ruleV3Bot },
  "rule-v4": { name: "Rule", version: "v4", bot: ruleV4Bot },
  "gd-defensive": { name: "GD Defensive", version: "Expert", bot: gdDefensiveBot },
  "gd-continental": { name: "GD Continental", version: "Expert", bot: gdContinentalBot },
  "gd-aggressive": { name: "GD Aggressive", version: "Expert", bot: gdAggressiveBot },
  "gd-stacker": { name: "GD Stacker", version: "Expert", bot: gdStackerBot },
};
