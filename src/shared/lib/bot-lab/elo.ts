// ---------------------------------------------------------------------------
// Elo rating from a field of pairwise results. Strategy strength is
// NON-TRANSITIVE — A can beat B, B beat C, yet A lose to C — so "beat the last
// guy" is not a robust definition of champion. Instead every bot earns an Elo
// against the whole field, and the champion is the HIGHEST Elo. Ratings are
// anchored so one chosen label (the field's floor, or a fixed reference) sits at
// 0: an Elo of +N means "N Elo above the anchor".
//
// The fit is the standard Bradley–Terry maximum-likelihood model, solved by the
// Zermelo / minorization–maximization iteration (parameter-free, monotonically
// convergent — no learning rate to tune). Each bot i gets a strength γ_i > 0
// with P(i beats j) = γ_i / (γ_i + γ_j); the MM update is
//     γ_i ← W_i / Σ_j n_ij /(γ_i + γ_j)
// where W_i is i's total wins and n_ij the games between i and j. Elo = 400·log10 γ.
// ---------------------------------------------------------------------------

/** One pairing's decisive tally: `a` beat `b` `aWins` times, `b` beat `a`
 *  `bWins` times (draws already discarded). Order of a/b is irrelevant. */
export interface PairResult {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
}

export interface EloFitOptions {
  /** The label pinned to 0 Elo. */
  anchor: string;
  /** MM iterations; the model converges well within this for a small field. */
  iterations?: number;
}

/** Fit Elo ratings for `labels` from the pairwise `results`, anchored so
 *  `anchor` = 0. Assumes the comparison graph is connected and every label both
 *  wins and loses at least once across the field — a label that never wins
 *  would diverge to −∞, so a tiny floor guards against a NaN/∞ leaking out. */
export function fitElo(
  labels: readonly string[],
  results: readonly PairResult[],
  opts: EloFitOptions,
): Record<string, number> {
  const iterations = opts.iterations ?? 10_000;

  const wins: Record<string, number> = {};
  const games: Record<string, Record<string, number>> = {};
  for (const l of labels) {
    wins[l] = 0;
    games[l] = {};
    for (const m of labels) games[l][m] = 0;
  }
  for (const r of results) {
    if (!(r.a in wins) || !(r.b in wins)) continue;
    wins[r.a] += r.aWins;
    wins[r.b] += r.bWins;
    const n = r.aWins + r.bWins;
    games[r.a][r.b] += n;
    games[r.b][r.a] += n;
  }

  const gamma: Record<string, number> = {};
  for (const l of labels) gamma[l] = 1;

  for (let iter = 0; iter < iterations; iter++) {
    const next: Record<string, number> = {};
    for (const i of labels) {
      let denom = 0;
      for (const j of labels) {
        if (i === j) continue;
        const n = games[i][j];
        if (n > 0) denom += n / (gamma[i] + gamma[j]);
      }
      // A label with no games, or one that never won, keeps a floored strength
      // rather than collapsing to 0 (which would make its Elo −∞).
      next[i] = denom > 0 ? Math.max(wins[i] / denom, 1e-9) : gamma[i];
    }
    // Normalize the geometric mean to 1 each step so the strengths can't drift
    // off together (the model is only identified up to a global scale).
    let logSum = 0;
    for (const l of labels) logSum += Math.log(next[l]);
    const norm = Math.exp(logSum / labels.length);
    for (const l of labels) gamma[l] = next[l] / norm;
  }

  const elo: Record<string, number> = {};
  for (const l of labels) elo[l] = 400 * Math.log10(gamma[l]);
  const offset = elo[opts.anchor] ?? 0;
  for (const l of labels) elo[l] -= offset;
  return elo;
}

/** One seat's finish in a multiplayer game: its bot's label and its place, 1 for
 *  the winner. Seats the game didn't separate share a place (the survivors of a
 *  capped game). */
export interface Finish {
  label: string;
  place: number;
}

/** A multiplayer game's finishing order broken into pairwise results for the
 *  Bradley–Terry fit: every pair of seats with different labels and different
 *  places is one decisive comparison, won by the seat that finished higher
 *  ("full rank-breaking"). Copies of one bot compare nothing about it, and a tie
 *  in place is no result. Full breaking keeps the Plackett–Luce strengths
 *  consistent, so the fitted Elo reads as P(i finishes above j); the pairs from one
 *  game are not independent, so the fit's point estimate is sound but the number
 *  of comparisons overstates the evidence — decisions come from the SPRT, not
 *  from this. */
export function pairsFromFinishes(finishes: readonly Finish[]): PairResult[] {
  const pairs: PairResult[] = [];
  for (let i = 0; i < finishes.length; i++) {
    for (let j = i + 1; j < finishes.length; j++) {
      const a = finishes[i];
      const b = finishes[j];
      if (a.label === b.label || a.place === b.place) continue;
      const aAhead = a.place < b.place;
      pairs.push({ a: a.label, b: b.label, aWins: aAhead ? 1 : 0, bWins: aAhead ? 0 : 1 });
    }
  }
  return pairs;
}

/** The highest-Elo label: the field's champion. */
export function topRated(elo: Readonly<Record<string, number>>, labels: readonly string[]): string {
  return labels.reduce((best, l) => (elo[l] > elo[best] ? l : best), labels[0]);
}
