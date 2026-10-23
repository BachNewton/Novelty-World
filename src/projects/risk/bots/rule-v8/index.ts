import type { Seat } from "../../contract";
import type { Bot } from "../bot";
import type { Board } from "../rule-v1/board";
import { ruleBot, ruleV6Bot } from "../rule-v6";
import type { Breakdown } from "../rule-v6/evaluate";
import { V6_PARAMS, type Params } from "../rule-v6/params";
import { features, SLOTS } from "./features";
import { predict } from "./network";

// v8 (`ideas/rule-bot-v8.md`): v6 whole, its planner, plans, odds, opponent model and small
// decisions, with one change: every board v6 scores is scored instead by a network's chance
// that the seat wins it, read from v6's breakdown of the board and the board itself.

/** The chance `me` wins from `b`, as v8's network reads it. A seat out has none, and the last
 *  seat standing has won. */
export function winChance(b: Board, me: Seat, bd: Breakdown): number {
  if (!b.alive[me]) return 0;
  if (b.alive.filter(Boolean).length === 1) return 1;
  return predict(features(b, me, bd));
}

export const V8_PARAMS: Params = { ...V6_PARAMS, score: winChance };

const networked = ruleBot(V8_PARAMS);

/** v8, and v6 while more seats are alive than the network has slots for (a 6-player table's
 *  start): the choice is made per decision, so every board one decision compares is scored on
 *  one scale. */
export const ruleV8Bot: Bot = (input) => (input.view.seats.filter((s) => !s.eliminated).length > SLOTS ? ruleV6Bot : networked)(input);
