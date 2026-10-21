import { V4_PARAMS, type Params as V4Params } from "../rule-v4/params";
import type { Scorer } from "./evaluate";

// v6 plays v5's settings (v4's preferences, opponent model and work knob) and adds the fixes
// `ideas/rule-bot-v6.md` takes from the human games G4FR and 9VFL. Each fix is its own
// hypothesis, so each is a switch: with every switch off v6 plays exactly as v5 does, and a
// screen can seat v5 with any one of them (`rule-v6~{"fork":1,...}`) to tell which pay.

/** The fixes, each on (1) or off (0). */
export interface Fixes {
  /** A kill whose victim's land has split in two is costed cheap group first, so the stack
   *  leaves its detachment for the cheap branch and goes on with the rest. */
  fork: number;
  /** A single capture is scored on the move-in the bot would make, the best of v4's even split
   *  and the fewest armies in, so a sure card no longer costs half a stack. */
  movein: number;
  /** The table's preferences follow the seats still alive, not the seats at the start. */
  alive: number;
  /** When an opponent's sweep is believed to take a third of my territories or more, the
   *  fortify is the move that most cuts what the believed sweeps cost me. */
  gather: number;
  /** A plan is scored with the turn's fortify still to come: its biggest idle stack isn't
   *  idle, since one fortify can take it back to the front. */
  homeward: number;
  /** An opponent's sweep may start from a stack a third player's territories away. */
  thirdParty: number;
  /** Next turn's kill is weighed with the victim's income placed where my stack enters. */
  reinforced: number;
}

export type FixName = keyof Fixes;

export const NO_FIXES: Fixes = { fork: 0, movein: 0, alive: 0, gather: 0, homeward: 0, thirdParty: 0, reinforced: 0 };

export interface Params extends V4Params {
  fixes: Fixes;
  /** How a board is scored from its breakdown, wherever the planner, the move-in and the
   *  fortify score one: v6's own value when unset. A later version may swap in its own. */
  score?: Scorer;
}

/** v6: v5's settings with the fixes the 6-player screens kept: all but `movein`, which leaned
 *  worse and cost most (`ideas/rule-bot-v6.md`). */
export const V6_PARAMS: Params = {
  ...V4_PARAMS,
  fixes: { fork: 1, movein: 0, alive: 1, gather: 1, homeward: 1, thirdParty: 1, reinforced: 1 },
};
