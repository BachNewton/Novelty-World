import { V3_PARAMS } from "../rule-v3/params";
import type { TakenRecord } from "./beliefs";

// v4's parameters, v1's kinds (`ideas/rule-bot-v1.md` §3, and Monopoly's
// "Dual-use parameters"): PREFERENCES say what the bot itself values and may be tuned;
// the OPPONENT MODEL says how other players behave and is pinned, because a model of
// others tuned for self-play learns a convenient fiction. Each field lists every
// place that reads it.

export interface Preferences {
  /** Turns of income a player's power counts (H). Read by: power (every player's alike,
   *  so one job), and the turns a held continent of mine is worth when broken. */
  incomeHorizon: number;
  /** Multiplies the worth of MY cards only. Read by: my card equity → card grabs, kill
   *  payoffs from cards I'd take, trade-or-hold, next-turn kill opportunity. Others'
   *  cards are always valued objectively (`cards.ts`). */
  myCardWeight: number;
  /** Multiplies MY continent bonuses only. Read by: my power. Breaking someone else's continent is valued by their objective
   *  income loss, never by this. */
  myContinentWeight: number;
  /** A kill plan must beat the best plan that isn't a kill by this much equity. Read
   *  by: the kill commit (and so the trade-to-kill, which exists only for it). */
  killCommitMargin: number;
  /** How much I fear being eliminated before my next turn. Read by: my equity's kill
   *  exposure → trade-to-shrink, defence, occupy, fortify. */
  vulnerabilityWeight: number;
  /** How much I mind expected border losses. Read by: my equity's border exposure →
   *  defence, occupy, fortify. */
  borderWeight: number;
  /** Armies with no enemy neighbour do nothing: how much that costs. Read by: my equity
   *  (the stack-structure term) → fortify, occupy. */
  idleWeight: number;
  /** Worth of next turn's best kill, as a share of its payoff. Read by: my equity's kill
   *  opportunity → fortify, occupy, placement. */
  opportunityWeight: number;
  /** When another player is the common threat, their share counts against me by this
   *  much. Read by: my equity only. */
  commonThreatWeight: number;
  /** When I am the common threat, my share is cut by this much. Read by: my equity
   *  only; it never feeds the leader test. */
  leadPenaltyWeight: number;
}

/** Fixed by reasoning, out of any search: it models other players, not me. */
export interface OpponentModel {
  /** A player whose power is this many times every other's is everyone's target, at 4
   *  players; the bar rises by `leaderRatioPerPlayer` for each player more (Domination's
   *  fixed-card AI is "more lenient with more players"). Read by: the common-threat test,
   *  for others (my gang-up) and for me (theirs). */
  leaderRatio: number;
  leaderRatioPerPlayer: number;
  /** An opponent takes a kill of this chance or better whether or not it pays; below it,
   *  only a kill that pays (its cards force a trade, or the victim's hand is worth taking) is likely. Read by: kill exposure. */
  killBar: number;
  /** How likely an opponent goes for a kill below the bar that doesn't pay. */
  unpaidKillChance: number;
  /** v4's beliefs, measured against how opponents play (`eval/opponent-model.ts`); null is
   *  v3's model exactly. */
  beliefs: Beliefs | null;
}

/** What v4 believes of the other seats where v3's model measured wrong
 *  (`ideas/rule-bot-v4.md`). Read by: the opponent model only (`opponents.ts`). */
export interface Beliefs {
  /** An opponent's aim at me with no common threat: v3's share of what its turn could do to
   *  each neighbour, pulled toward an even split among them, keeping this much of the gap. */
  aimSlope: number;
  /** The aim at me while I am the common threat (v3: 1, every opponent's turn). */
  leaderAim: number;
  /** The aim at me while another seat is the common threat and the opponent isn't it (v3: 0.25). */
  allyAim: number;
  /** How many territories taken this game the aim counts as evidence against its prior: the
   *  aim is (prior × this + taken from me) / (this + taken from its neighbours). Null ignores
   *  the game's record. */
  historyPrior: number | null;
  /** Each turn of an opponent's counts this much of the one after it in its record. */
  historyDecay: number;
  /** The chance an opponent takes its best kill, per unit of the kill's chance: of a third
   *  player, and of me. */
  killRate: number;
  myKillRate: number;
}

/** Engineering, not strategy: it changes cost, never what a good move is. */
export interface Engine {
  /** Outcomes sampled per plan; 0 scores a plan on its success and a typical failure,
   *  computed exactly. The one work knob, measured before it may grow (CLAUDE.md:
   *  "More thinking is earned, not assumed"). */
  outcomeSamples: number;
}

export interface Params {
  /** The preferences at a table of more than `smallTable.players`. */
  prefs: Preferences;
  /** The preferences at a table of `players` or fewer while three or more are alive (v3): the game there is a race to the
   *  first kill with fewer opponents to share the blows, and preferences proposed by
   *  `risk:tune` at 3 players beat v2 at 3 and 4 but not at 6, where v2's do. */
  smallTable: { players: number; prefs: Preferences };
  opponents: OpponentModel;
  engine: Engine;
  /** What this game has shown of the opponents, read from the history at each decision (v4);
   *  null before it is read, or when the beliefs don't use it. */
  record: TakenRecord | null;
}

/** v4: v3's opponent model with the beliefs `ideas/rule-bot-v4.md` measured, and the
 *  small-table preferences retuned on them; above the small table, v3's preferences. */
export const V4_PARAMS: Params = {
  smallTable: {
    players: 4,
    // `risk:tune -- --tunable rule-v4-small --opponent rule-v3 --players 3,4 --gens 10 --pop 8
    // --groups 40`, the final mean (`ideas/bot-log.md`).
    prefs: {
      incomeHorizon: 2.0556,
      myCardWeight: 1.4948,
      myContinentWeight: 2.0759,
      killCommitMargin: -0.0138,
      vulnerabilityWeight: 2.2528,
      borderWeight: 1.1178,
      idleWeight: 0,
      opportunityWeight: 0,
      commonThreatWeight: 0.0096,
      leadPenaltyWeight: 0,
    },
  },
  prefs: {
    incomeHorizon: 3,
    myCardWeight: 1,
    myContinentWeight: 1,
    killCommitMargin: 0,
    vulnerabilityWeight: 1,
    borderWeight: 0.5,
    idleWeight: 0.3,
    opportunityWeight: 0.5,
    commonThreatWeight: 1,
    leadPenaltyWeight: 0.1,
  },
  opponents: {
    leaderRatio: 1.3,
    leaderRatioPerPlayer: 0.1,
    killBar: 0.6,
    unpaidKillChance: 0.5,
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
  engine: {
    outcomeSamples: 0,
  },
  record: null,
};

/** v3's model and preferences on v4's code, for measuring against: the same moves as rule-v3. */
export const AS_V3_PARAMS: Params = { ...V4_PARAMS, smallTable: V3_PARAMS.smallTable, opponents: { ...V4_PARAMS.opponents, beliefs: null } };

