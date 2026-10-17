// v3's parameters, v1's kinds (`ideas/rule-bot-v1.md` §3, and Monopoly's
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
}

/** Engineering, not strategy: it changes cost, never what a good move is. */
export interface Engine {
  /** Outcomes sampled per plan; 0 scores a plan on its success and a typical failure,
   *  computed exactly. The one work knob, measured before it may grow (CLAUDE.md:
   *  "More thinking is earned, not assumed"). */
  outcomeSamples: number;
}

export interface Params {
  prefs: Preferences;
  opponents: OpponentModel;
  engine: Engine;
}

export const V3_PARAMS: Params = {
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
  },
  engine: {
    outcomeSamples: 0,
  },
};
