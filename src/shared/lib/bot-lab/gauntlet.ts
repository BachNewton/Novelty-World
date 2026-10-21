import {
  walkGroupedSprt,
  type GauntletSprtConfig,
  type GauntletVerdict,
  type GauntletWalk,
} from "./sprt";

// ---------------------------------------------------------------------------
// The gauntlet — how a candidate bot earns promotion. A candidate doesn't just
// face its predecessor; it plays the whole FIELD (past champions, or a fixed
// panel spanning the archive). Each candidate-vs-opponent pairing is decided by
// SPRT, so strong edges resolve in dozens of games and marginal ones play long or
// are rejected. The bar to accept a candidate as the new champion — the CROWN
// GATE:
//
//     IMPROVES vs its base   AND   REGRESSES against none.
//
// The no-regression half is the guard against non-transitivity: a counter to the
// champion can clear the base but never the whole field. On top of the verdict a
// game fits an Elo across the field (`elo.ts`), so "champion" means HIGHEST Elo,
// not "beat the last guy". This module is the game-agnostic machinery; each game
// says how a pairing's games are seated and what counts as the candidate winning.
// ---------------------------------------------------------------------------

/** A decision-ready reading of a single pairing's SPRT outcome. `even` is a
 *  CONFIDENT tie (both one-sided tests rejected ±E); `inconclusive` ran out of
 *  games. Both mean "not an improvement and not a regression". */
export type PairVerdict = "better" | "worse" | "even" | "inconclusive";

function classify(v: GauntletVerdict): PairVerdict {
  if (v === "better" || v === "worse" || v === "even") return v;
  return "inconclusive"; // inconclusive or (defensively) need-more
}

/** One game's result from the candidate's side. A draw (a capped game) carries no
 *  signal and is discarded from the test; an error is excluded and surfaced. */
export type TrialOutcome = "win" | "loss" | "draw" | "error";

/** A pairing run to its SPRT verdict. */
export interface SprtPairingRun {
  verdict: PairVerdict;
  /** Candidate wins / losses AT the SPRT stop point (the sample the verdict and
   *  the Elo estimate are built from). */
  wins: number;
  losses: number;
  decisive: number;
  /** Capped games to the stop point: discarded from the test, reported as the
   *  deadlock health metric. */
  draws: number;
  errors: number;
  /** Games up to the stop point, draws and errors included: the games the verdict
   *  rests on, the same whatever the batch size. */
  games: number;
  /** Total games generated (including any past the stop point and any draws). */
  generated: number;
  /** LLRs of the improvement ([0,+E]) and regression ([0,−E]) tests at the stop. */
  llrImprove: number;
  llrRegress: number;
}

export interface SprtPairingOptions {
  /** Plays games `from` to `from + count − 1` of the pairing's deterministic game
   *  stream and resolves with the candidate's outcome in each, in order. */
  play: (from: number, count: number) => Promise<readonly TrialOutcome[]>;
  sprt: GauntletSprtConfig;
  /** Decisive-game cap before declaring the pairing inconclusive. */
  maxDecisive: number;
  /** Games generated per round; bigger = fewer round-trips, more overshoot past
   *  the crossing. Rounded up to whole groups. */
  batchGames: number;
  /** Consecutive games that form one group (a seed in every seat rotation); the
   *  test is checked only after whole groups. 1 when games stand alone. */
  groupSize?: number;
  /** Fired after every round with the walk so far — purely cosmetic (a progress
   *  line), never affects the game stream or the verdict. */
  onRound?: (walk: GauntletWalk, draws: number) => void;
}

/** A pairing's games so far, from the first, as the SPRT reads them: each group's
 *  decisive outcomes, and its capped and failed games, which the test leaves out. */
interface PairingStream {
  groups: boolean[][];
  draws: number[];
  errors: number[];
}

function emptyStream(): PairingStream {
  return { groups: [], draws: [], errors: [] };
}

/** Adds games `from` onward of a pairing's stream. */
function extend(stream: PairingStream, from: number, outcomes: readonly TrialOutcome[], groupSize: number): void {
  for (let k = 0; k < outcomes.length; k++) {
    const g = Math.floor((from + k) / groupSize);
    stream.groups[g] ??= [];
    stream.draws[g] ??= 0;
    stream.errors[g] ??= 0;
    const o = outcomes[k];
    if (o === "error") stream.errors[g]++;
    else if (o === "draw") stream.draws[g]++;
    else stream.groups[g].push(o === "win");
  }
}

const sumTo = (xs: readonly number[], n: number) => xs.slice(0, n).reduce((s, x) => s + x, 0);

/** Games a pairing may play while its test is undecided: a bound so that an
 *  all-draws pathology can't loop forever; a healthy field rarely caps, so this is
 *  only a safety net. Rounded up to whole groups. */
export function sprtGameCap(maxDecisive: number, groupSize: number): number {
  return Math.ceil((maxDecisive * 3 + 300) / groupSize) * groupSize;
}

function pairingRun(walk: GauntletWalk, stream: PairingStream, groupSize: number, generated: number): SprtPairingRun {
  return {
    verdict: classify(walk.verdict),
    wins: walk.wins,
    losses: walk.losses,
    decisive: walk.decisive,
    draws: sumTo(stream.draws, walk.groups),
    errors: sumTo(stream.errors, walk.groups),
    games: walk.groups * groupSize,
    generated,
    llrImprove: walk.llrImprove,
    llrRegress: walk.llrRegress,
  };
}

/** Run one candidate-vs-opponent pairing to an SPRT verdict, generating games in
 *  rounds until the test crosses a boundary or hits the decisive cap. The stop
 *  point is a deterministic function of the (seeded) game stream, so the verdict
 *  reproduces regardless of the batch size or the pool's size; so does every
 *  figure of the run but `generated`, which counts the games past the stop point. */
export async function runSprtPairing(opts: SprtPairingOptions): Promise<SprtPairingRun> {
  const groupSize = opts.groupSize ?? 1;
  const batchGames = Math.ceil(opts.batchGames / groupSize) * groupSize;
  const stream = emptyStream();
  let generated = 0;
  const cap = sprtGameCap(opts.maxDecisive, groupSize);

  let walk = walkGroupedSprt(stream.groups, opts.sprt, opts.maxDecisive);
  while (walk.verdict === "need-more") {
    extend(stream, generated, await opts.play(generated, batchGames), groupSize);
    generated += batchGames;
    walk = walkGroupedSprt(stream.groups, opts.sprt, opts.maxDecisive);
    opts.onRound?.(walk, sumTo(stream.draws, stream.draws.length));
    if (walk.verdict === "need-more" && generated >= cap) break;
  }
  return pairingRun(walk, stream, groupSize, generated);
}

export interface SprtRoundOptions {
  sprt: GauntletSprtConfig;
  maxDecisive: number;
  groupSize: number;
  /** The fewest games a round plays, rounded up to whole groups. */
  minRound: number;
}

/** Where a pairing stands after the games played so far, for a run that plays its
 *  rounds elsewhere (several machines at once) and tests them here. */
export interface SprtRoundPlan {
  /** The run as it stands; once `next` is 0 it is the run's result, the same as
   *  `runSprtPairing` gives (`generated` aside) on the same game stream. */
  run: SprtPairingRun;
  /** Games to play next, from `played` on: 0 once the test has decided, reached its
   *  cap, or the pairing has played its game cap. A round at least doubles the games
   *  played, so a pairing takes few rounds however long its test runs. */
  next: number;
  played: number;
}

/** Plans a pairing's next round from its first `outcomes.length` games, whole groups. */
export function planSprtRound(outcomes: readonly TrialOutcome[], opts: SprtRoundOptions): SprtRoundPlan {
  const { groupSize } = opts;
  const played = outcomes.length;
  if (played % groupSize !== 0) throw new Error(`a pairing's games come in groups of ${groupSize}, not ${played} games`);
  const stream = emptyStream();
  extend(stream, 0, outcomes, groupSize);
  const walk = walkGroupedSprt(stream.groups, opts.sprt, opts.maxDecisive);
  const run = pairingRun(walk, stream, groupSize, played);
  const cap = sprtGameCap(opts.maxDecisive, groupSize);
  if (walk.verdict !== "need-more" || played >= cap) return { run, next: 0, played };
  const round = Math.ceil(Math.max(opts.minRound, played) / groupSize) * groupSize;
  return { run, next: Math.min(round, cap - played), played };
}

export interface CrownGate {
  improvesVsBase: boolean;
  /** Opponents the candidate significantly REGRESSED against (regression test). */
  regressions: readonly string[];
  /** The promotion verdict: improves vs base AND regresses against none. */
  accepted: boolean;
}

/** The crown gate over a gauntlet's pairings. An opponent may be met in several
 *  pairings (one per table format); the candidate improves on its base only if
 *  every pairing against the base is `better`, and regresses against any opponent
 *  it is `worse` against in any of them. */
export function crownGate(
  pairings: readonly { opponent: string; verdict: PairVerdict }[],
  base: string,
): CrownGate {
  const vsBase = pairings.filter((p) => p.opponent === base);
  const improvesVsBase = vsBase.length > 0 && vsBase.every((p) => p.verdict === "better");
  const regressions = [
    ...new Set(pairings.filter((p) => p.verdict === "worse").map((p) => p.opponent)),
  ];
  return { improvesVsBase, regressions, accepted: improvesVsBase && regressions.length === 0 };
}
