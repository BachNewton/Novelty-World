import type { Bot } from "../bots/bot";
import { gdAggressiveBot, gdContinentalBot, gdDefensiveBot, gdStackerBot } from "../bots/gd";
import { greedyBot } from "../bots/greedy";
import { ruleV1Bot } from "../bots/rule-v1";
import { ruleV2Bot } from "../bots/rule-v2";
import { ruleV3Bot } from "../bots/rule-v3";
import { ruleV4_1Bot } from "../bots/rule-v4.1";
import { ruleV5_1Bot } from "../bots/rule-v5.1";
import { ruleV6_1Bot } from "../bots/rule-v6.1";
import { ruleV7_1Bot } from "../bots/rule-v7.1";

// The roster apart from its ranking (`seat-bots.ts`), so the ratings run that measures a
// newly seated bot can read it before the bot has an Elo to rank it by.

/** A bot a table can seat, by the id its row keeps: the label the measuring harness seats it
 *  by. The bots themselves live in `bots/`, the one home of every Risk bot, measured or played. */
export type BotId = "greedy" | "rule-v1" | "rule-v2" | "rule-v3" | "rule-v4.1" | "rule-v5.1" | "rule-v6.1" | "rule-v7.1" | "gd-defensive" | "gd-continental" | "gd-aggressive" | "gd-stacker";

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
  "rule-v4.1": { name: "Rule", version: "v4.1", bot: ruleV4_1Bot },
  "rule-v5.1": { name: "Rule", version: "v5.1", bot: ruleV5_1Bot },
  "rule-v6.1": { name: "Rule", version: "v6.1", bot: ruleV6_1Bot },
  "rule-v7.1": { name: "Rule", version: "v7.1", bot: ruleV7_1Bot },
  "gd-defensive": { name: "GD Defensive", version: "Expert", bot: gdDefensiveBot },
  "gd-continental": { name: "GD Continental", version: "Expert", bot: gdContinentalBot },
  "gd-aggressive": { name: "GD Aggressive", version: "Expert", bot: gdAggressiveBot },
  "gd-stacker": { name: "GD Stacker", version: "Expert", bot: gdStackerBot },
};

/** A bot no table seats any more: a version that fixed its flaw took its place (the Risk
 *  `CLAUDE.md`). Its code stays registered in `bots/`, untouched. */
export type RetiredBotId = "rule-v4" | "rule-v5" | "rule-v6";

/** Any bot a row's seat may name: one a table can seat, or one retired since the game was played. */
export type RowBotId = BotId | RetiredBotId;

export interface RetiredBot {
  name: string;
  version: string;
  /** Its last measured win Elo, on the seatable bots' scale: a finished game that seated it is
   *  rated with it, as it was when it was played. */
  elo: number;
}

/** What a finished game that seated a retired bot needs to be drawn and rated as it always was.
 *  A game still in progress with one in a seat was deleted when it retired, so nothing plays it. */
export const RETIRED_BOTS: Record<RetiredBotId, RetiredBot> = {
  "rule-v4": { name: "Rule", version: "v4", elo: 1510.5 },
  "rule-v5": { name: "Rule", version: "v5", elo: 1538.4 },
  "rule-v6": { name: "Rule", version: "v6", elo: 1560.3 },
};
