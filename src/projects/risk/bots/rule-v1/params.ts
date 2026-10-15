// v1's parameters, in two kinds (`ideas/rule-bot-v1.md` §3, and Monopoly's
// "Dual-use parameters"): PREFERENCES say what v1 itself values and may be tuned;
// the OPPONENT MODEL says how other players behave and is pinned, because a model of
// others tuned for self-play learns a convenient fiction. Each field lists every
// place that reads it.

export interface Preferences {
  /** Turns of income a player's power counts (H), at set values up to `fallFrom`;
   *  it falls by one every `fallPer` of set value after, to `min`. Read by: power
   *  (every player's alike, so one job). */
  incomeHorizon: { base: number; min: number; fallFrom: number; fallPer: number };
  /** Multiplies the worth of MY cards only. Read by: my card equity → card grabs, kill
   *  payoffs from cards I'd take, trade-or-hold, next-turn kill opportunity. Others'
   *  cards are always valued objectively. */
  myCardWeight: number;
  /** Multiplies MY continent bonuses only. Read by: my power, setup's continent rule
   *  (as a switch). Breaking someone else's continent is valued by their objective
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
  /** Stack seeds built in setup, by player count. Read by: setup only. */
  stackTarget: Readonly<Record<number, number>>;
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
  /** A player whose power is this many times every other's is everyone's target. Read
   *  by: the common-threat test, for others (my gang-up) and for me (theirs). Rises from
   *  `early` at set values up to 10 to `late` from 25. */
  leaderRatio: { early: number; late: number };
  /** An opponent takes a kill of this chance or better whether or not it pays; below it,
   *  only a kill that pays (a mid-cash, or my hand) is likely. Read by: kill exposure. */
  killBar: number;
  /** How likely an opponent goes for a kill below the bar that doesn't pay. */
  unpaidKillChance: number;
  /** Cards a player draws per turn, on average. Read by: others' card equity. */
  drawsPerTurn: number;
}

/** Engineering, not strategy: it changes cost, never what a good move is. */
export interface Engine {
  /** A blitz stops when the rest of its run falls below this chance, to re-plan. */
  continueBar: number;
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

export const V1_PARAMS: Params = {
  prefs: {
    incomeHorizon: { base: 3, min: 1, fallFrom: 10, fallPer: 10 },
    myCardWeight: 1,
    myContinentWeight: 1,
    killCommitMargin: 0,
    vulnerabilityWeight: 1,
    borderWeight: 0.5,
    idleWeight: 0.3,
    stackTarget: { 3: 2, 4: 3, 5: 3, 6: 3 },
    opportunityWeight: 0.5,
    commonThreatWeight: 1,
    leadPenaltyWeight: 0.1,
  },
  opponents: {
    leaderRatio: { early: 1.5, late: 1.8 },
    killBar: 0.6,
    unpaidKillChance: 0.5,
    drawsPerTurn: 0.8,
  },
  engine: {
    continueBar: 0.15,
    outcomeSamples: 0,
  },
};

export function incomeHorizon(p: Preferences, nextSet: number): number {
  const h = p.incomeHorizon;
  return Math.max(h.min, Math.min(h.base, h.base - (nextSet - h.fallFrom) / h.fallPer));
}

export function leaderRatio(o: OpponentModel, nextSet: number): number {
  const t = Math.max(0, Math.min(1, (nextSet - 10) / 15));
  return o.leaderRatio.early + t * (o.leaderRatio.late - o.leaderRatio.early);
}
