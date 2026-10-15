// ---------------------------------------------------------------------------
// SPRT — the Sequential Probability Ratio Test, in Elo terms. Borrowed wholesale
// from computer-chess engine testing (Stockfish's fishtest). Instead of fixing a
// game count up front, we keep playing and stop the INSTANT the evidence crosses
// an accept/reject boundary at controlled error rates — so a strong change
// resolves in dozens of games while a marginal one plays long or gets rejected,
// and we never burn CPU on games the verdict doesn't need.
//
// The model: each DECISIVE game is one Bernoulli trial — the candidate's side won
// or it didn't. DRAWS (capped, no-result games) are DISCARDED: they carry no
// information about which side is stronger, and are reported by the caller as a
// health metric instead. The hypotheses are expressed as Elo gaps and converted
// to the candidate side's win probability by a `WinProb` mapping, which depends on
// the table: the plain logistic when the two sides hold equal shares of the seats
// (Monopoly's 2 + 2), the Luce choice model when they don't (`luceWinProb`).
// ---------------------------------------------------------------------------

export interface SprtConfig {
  /** Null-hypothesis Elo gap (candidate − baseline). */
  elo0: number;
  /** Alternative-hypothesis Elo gap. */
  elo1: number;
  /** Type-I error: accept H1 when H0 is true. */
  alpha: number;
  /** Type-II error: accept H0 when H1 is true. */
  beta: number;
}

/** The candidate side's chance of winning a decisive game, given its Elo edge per
 *  seat over the other side. */
export type WinProb = (elo: number) => number;

/** "accept-h1" / "accept-h0" once a boundary is crossed; "continue" while the
 *  log-likelihood ratio is still between the bounds (need more games). */
export type SprtVerdict = "accept-h1" | "accept-h0" | "continue";

export interface SprtState {
  wins: number;
  losses: number;
  /** Cumulative log-likelihood ratio of H1 vs H0 over the decisive games. */
  llr: number;
  lower: number;
  upper: number;
  verdict: SprtVerdict;
}

/** The logistic Elo curve: expected win probability for an Elo advantage. It is
 *  also the win probability of a side holding exactly half the seats. */
export function eloToWinProb(elo: number): number {
  return 1 / (1 + Math.pow(10, -elo / 400));
}

/** The Luce choice model, Bradley–Terry's extension to one winner among many: each
 *  seat has a strength γ, a seat wins with probability γ / Σγ, and an Elo edge `d`
 *  makes a candidate seat 10^(d/400) times as strong as a base seat. So a side of
 *  `seats` candidates at a table of `players` wins with probability
 *  k·r / (k·r + n − k). At equal strength that is k/n, the side's par; with two
 *  players it is the logistic. One Elo margin thus means the same edge in every
 *  table format, which is what lets one indifference margin serve them all. */
export function luceWinProb(seats: number, players: number): WinProb {
  if (!(Number.isInteger(seats) && Number.isInteger(players) && seats >= 1 && seats < players)) {
    throw new Error(`a side needs between 1 and ${players - 1} of the ${players} seats, not ${seats}`);
  }
  return (elo) => {
    const r = Math.pow(10, elo / 400);
    return (seats * r) / (seats * r + players - seats);
  };
}

/** Wald's SPRT for a Bernoulli stream. The LLR after `wins`/`losses` decisive
 *  games is `wins·ln(p1/p0) + losses·ln((1−p1)/(1−p0))`, with the classic
 *  acceptance bounds `ln(β/(1−α))` and `ln((1−β)/α)`. */
export function sprt(
  wins: number,
  losses: number,
  cfg: SprtConfig,
  winProb: WinProb = eloToWinProb,
): SprtState {
  const p0 = winProb(cfg.elo0);
  const p1 = winProb(cfg.elo1);
  const llr =
    wins * Math.log(p1 / p0) + losses * Math.log((1 - p1) / (1 - p0));
  const lower = Math.log(cfg.beta / (1 - cfg.alpha));
  const upper = Math.log((1 - cfg.beta) / cfg.alpha);
  const verdict: SprtVerdict =
    llr >= upper ? "accept-h1" : llr <= lower ? "accept-h0" : "continue";
  return { wins, losses, llr, lower, upper, verdict };
}

// ---------------------------------------------------------------------------
// The gauntlet needs a three-way {better, worse, even} call, not a one-sided
// pass/fail — and crucially it must NOT promote a win-neutral change. A single
// symmetric SPRT[−E,+E] is the WRONG tool here: its boundary sits at ±E/2 net
// wins, so a true coin flip crosses one side or the other essentially by luck —
// it would "accept" a tie ~half the time.
//
// Instead we run the canonical fishtest pair of ONE-SIDED tests over the same
// stream, both with H0 = "no difference" (Elo 0):
//   - improvement test  H0: Δ=0  vs  H1: Δ=+E   → accept-H1 means "better"
//   - regression  test  H0: Δ=0  vs  H1: Δ=−E   → accept-H1 means "worse"
// A genuine tie pushes BOTH toward their H0 (accept-H0) — a confident "even"
// verdict — while a real edge trips exactly one H1. This gives the conservative
// behavior we want: a change is promoted only on a CONFIDENT improvement, and a
// win-neutral one is rejected with probability ≥ 1−α (it is not in either H1).
// ---------------------------------------------------------------------------

/** A pairing's three-way reading. `need-more` means the supplied stream ran out
 *  before any boundary — the caller must generate more games. `even` = both
 *  one-sided tests confidently accepted H0 (a true tie). `inconclusive` = the
 *  decisive cap was hit before any test resolved. */
export type GauntletVerdict =
  | "better"
  | "worse"
  | "even"
  | "inconclusive"
  | "need-more";

export interface GauntletSprtConfig {
  /** Indifference margin E (Elo): improvement test is [0,+E], regression [0,−E]. */
  margin: number;
  alpha: number;
  beta: number;
  /** How an Elo gap becomes the candidate side's win probability; the logistic
   *  (equal seat shares) when omitted. */
  winProb?: WinProb;
}

export interface GauntletWalk {
  verdict: GauntletVerdict;
  /** Candidate wins / losses AT the stop point — the sample the verdict and any
   *  downstream Elo estimate use, ignoring games generated past it. */
  wins: number;
  losses: number;
  decisive: number;
  /** Log-likelihood ratios of the improvement and regression tests at the stop. */
  llrImprove: number;
  llrRegress: number;
}

/** Walk a stream of decisive outcomes (`true` = candidate A won) IN ORDER,
 *  applying the dual one-sided SPRT after each game, and stop at the first of: a
 *  decisive verdict (better / worse / even), `maxDecisive` games, or the end of
 *  the supplied stream.
 *
 *  The stop point depends ONLY on the (deterministic) game stream — never on how
 *  the games were batched across workers — so the verdict is reproducible
 *  regardless of pool size. The caller feeds an ever-growing prefix of the same
 *  stream until the verdict is no longer `need-more`. */
export function walkGauntletSprt(
  aWon: readonly boolean[],
  cfg: GauntletSprtConfig,
  maxDecisive: number,
): GauntletWalk {
  return walkGroupedSprt(
    aWon.map((won) => [won]),
    cfg,
    maxDecisive,
  );
}

/** `walkGauntletSprt` over a stream of GROUPS — games that belong together, such
 *  as one seed played in every seat rotation — checking the boundaries only after
 *  a whole group, so a verdict never rests on a group that is half played (and its
 *  seats half balanced). Each group lists its decisive outcomes in order; groups of
 *  one are the plain per-game walk. */
export function walkGroupedSprt(
  groups: readonly (readonly boolean[])[],
  cfg: GauntletSprtConfig,
  maxDecisive: number,
): GauntletWalk {
  const winProb = cfg.winProb ?? eloToWinProb;
  const improve: SprtConfig = { elo0: 0, elo1: cfg.margin, alpha: cfg.alpha, beta: cfg.beta };
  const regress: SprtConfig = { elo0: 0, elo1: -cfg.margin, alpha: cfg.alpha, beta: cfg.beta };
  let wins = 0;
  let losses = 0;
  const at = (verdict: GauntletVerdict, si: SprtState, sr: SprtState): GauntletWalk => ({
    verdict,
    wins,
    losses,
    decisive: wins + losses,
    llrImprove: si.llr,
    llrRegress: sr.llr,
  });
  for (const group of groups) {
    for (const won of group) {
      if (won) wins++;
      else losses++;
    }
    const si = sprt(wins, losses, improve, winProb);
    const sr = sprt(wins, losses, regress, winProb);
    if (si.verdict === "accept-h1") return at("better", si, sr);
    if (sr.verdict === "accept-h1") return at("worse", si, sr);
    // Both tests confidently reject their +E/−E alternative → a true tie.
    if (si.verdict === "accept-h0" && sr.verdict === "accept-h0") return at("even", si, sr);
    if (wins + losses >= maxDecisive) return at("inconclusive", si, sr);
  }
  return at(
    "need-more",
    sprt(wins, losses, improve, winProb),
    sprt(wins, losses, regress, winProb),
  );
}
