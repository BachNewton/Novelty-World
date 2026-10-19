import { V3_PARAMS, type Engine, type Preferences } from "../rule-v3/params";
import type { TakenRecord } from "./beliefs";

// v4's parameters, v1's kinds (`ideas/rule-bot-v1.md` §3, and Monopoly's
// "Dual-use parameters"): PREFERENCES say what the bot itself values and may be tuned;
// the OPPONENT MODEL says how other players behave and is pinned, because a model of
// others tuned for self-play learns a convenient fiction. The preferences and the work
// knob are v3's (`rule-v3/params.ts`, where each preference lists every place that reads it).

export type { Engine, Preferences };

/** Fixed by reasoning and measurement, out of any search: it models other players, not me. */
export interface OpponentModel {
  /** A player whose power is this many times every other's is everyone's target, at 4
   *  players; the bar rises by `leaderRatioPerPlayer` for each player more (Domination's
   *  fixed-card AI is "more lenient with more players"). Read by: the common-threat test,
   *  for others (my gang-up) and for me (theirs). */
  leaderRatio: number;
  leaderRatioPerPlayer: number;
  /** An opponent takes a kill of this chance or better whether or not it pays; below it,
   *  only a kill that pays (its cards force a trade, or the victim's hand is worth taking) is
   *  likely. Read by: kill exposure. */
  killBar: number;
  /** How likely an opponent goes for a kill below the bar that doesn't pay. */
  unpaidKillChance: number;
  beliefs: Beliefs;
}

/** What v4 believes of the other seats where v3's model measured wrong (`ideas/rule-bot-v4.md`),
 *  measured by `risk:opponents`. Read by: the opponent model only (`opponents.ts`). */
export interface Beliefs {
  /** An opponent's aim at me with no common threat: v3's share of what its turn could do to
   *  each neighbour, pulled toward an even split among them, keeping this much of the gap. */
  aimSlope: number;
  /** The aim at me while I am the common threat (v3: 1, every opponent's turn). */
  leaderAim: number;
  /** The aim at me while another seat is the common threat and the opponent isn't it (v3: 0.25). */
  allyAim: number;
  /** How many territories taken this game the aim counts as evidence against its prior: the
   *  aim is (prior × this + taken from me) / (this + taken from its neighbours). */
  historyPrior: number;
  /** Each turn of an opponent's counts this much of the one after it in its record. */
  historyDecay: number;
  /** The chance an opponent takes a kill open to it, per unit of the kill's chance: of a third
   *  player, and of me. */
  killRate: number;
  myKillRate: number;
}

export interface Params {
  /** The preferences at a table of more than `smallTable.players`. */
  prefs: Preferences;
  /** The preferences at a table of `players` or fewer while three or more are alive (v3). */
  smallTable: { players: number; prefs: Preferences };
  opponents: OpponentModel;
  engine: Engine;
  /** What this game has shown of the opponents, read from the history at each decision;
   *  null before it is read. */
  record: TakenRecord | null;
}

/** v4: on v4's opponent model, small-table preferences retuned against a mixed field;
 *  above the small table, v3's preferences. */
export const V4_PARAMS: Params = {
  smallTable: {
    players: V3_PARAMS.smallTable.players,
    // `risk:tune -- --tunable rule-v4-small --opponent rule-v3,gd-defensive,gd-stacker,greedy
    // --baseline rule-v3 --players 3,4 --gens 10 --pop 8 --groups 40 --prefix tune-v4mix`, the
    // final mean; gauntleted against v4 on v3's preferences in `bot-log.md`.
    prefs: {
      incomeHorizon: 1.5,
      myCardWeight: 1.229,
      myContinentWeight: 1.8312,
      killCommitMargin: -0.0292,
      vulnerabilityWeight: 0.4289,
      borderWeight: 0.4862,
      idleWeight: 0.2252,
      opportunityWeight: 0,
      commonThreatWeight: 1.9327,
      leadPenaltyWeight: 0.0076,
    },
  },
  prefs: V3_PARAMS.prefs,
  opponents: {
    ...V3_PARAMS.opponents,
    // Measured by `risk:opponents` over v3 among v3s, v3 among v2s and a mixed field of the
    // rule bots and GD's personas (`ideas/bot-log.md`).
    beliefs: {
      aimSlope: 0.5,
      leaderAim: 0.7,
      allyAim: 0.3,
      historyPrior: 6,
      historyDecay: 0.7,
      killRate: 0.25,
      myKillRate: 0.5,
    },
  },
  engine: V3_PARAMS.engine,
  record: null,
};
