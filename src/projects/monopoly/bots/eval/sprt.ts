// ---------------------------------------------------------------------------
// SPRT — the Sequential Probability Ratio Test, in Elo terms (see EVOLUTION.md
// "Measurement"). Borrowed wholesale from computer-chess engine testing
// (Stockfish's fishtest). Instead of fixing a game count up front, we keep
// playing and stop the INSTANT the evidence crosses an accept/reject boundary at
// controlled error rates — so a strong change resolves in dozens of games while a
// marginal one plays long or gets rejected, and we never burn CPU on games the
// verdict doesn't need.
//
// The model: among 4 seats (2 candidate "A", 2 baseline "B"), each DECISIVE game
// is one Bernoulli trial — A wins or B wins. DRAWS (capped, no-result games) are
// DISCARDED: they carry no information about which side is stronger, and with the
// v3-era ~0% cap among real bots there are vanishingly few of them (documented
// choice in EVOLUTION.md). The hypotheses are expressed as Elo gaps and converted
// to win probabilities via the standard logistic; H0 = `elo0`, H1 = `elo1`.
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

/** The logistic Elo curve: expected win probability for an Elo advantage. */
export function eloToWinProb(elo: number): number {
  return 1 / (1 + Math.pow(10, -elo / 400));
}

/** Wald's SPRT for a Bernoulli stream. The LLR after `wins`/`losses` decisive
 *  games is `wins·ln(p1/p0) + losses·ln((1−p1)/(1−p0))`, with the classic
 *  acceptance bounds `ln(β/(1−α))` and `ln((1−β)/α)`. */
export function sprt(wins: number, losses: number, cfg: SprtConfig): SprtState {
  const p0 = eloToWinProb(cfg.elo0);
  const p1 = eloToWinProb(cfg.elo1);
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
// pass/fail — and crucially it must NOT promote a win-neutral change (the whole
// point of rejecting v3). A single symmetric SPRT[−E,+E] is the WRONG tool here:
// its boundary sits at ±E/2 net wins, so a true coin flip crosses one side or the
// other essentially by luck — it would "accept" a tie ~half the time.
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
  for (let i = 0; i < aWon.length; i++) {
    if (aWon[i]) wins++;
    else losses++;
    const si = sprt(wins, losses, improve);
    const sr = sprt(wins, losses, regress);
    if (si.verdict === "accept-h1") return at("better", si, sr);
    if (sr.verdict === "accept-h1") return at("worse", si, sr);
    // Both tests confidently reject their +E/−E alternative → a true tie.
    if (si.verdict === "accept-h0" && sr.verdict === "accept-h0") return at("even", si, sr);
    if (wins + losses >= maxDecisive) return at("inconclusive", si, sr);
  }
  return at("need-more", sprt(wins, losses, improve), sprt(wins, losses, regress));
}
