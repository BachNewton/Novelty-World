// ---------------------------------------------------------------------------
// Elo rating from a field of pairwise results (see METHOD.md "Measurement").
// Strategy strength is NON-TRANSITIVE — A can beat B, B beat C, yet A lose to C
// — so "beat the last guy" is not a robust definition of champion. Instead
// every version earns an Elo against the whole field, and the champion is the
// HIGHEST Elo. Ratings are anchored so the floor (`claude-v1`) sits at 0, i.e. an
// Elo of +N means "N Elo above the claude-v1 baseline".
//
// The fit is the standard Bradley–Terry maximum-likelihood model, solved by the
// Zermelo / minorization–maximization iteration (parameter-free, monotonically
// convergent — no learning rate to tune). Each version i gets a strength γ_i > 0
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
  /** The label pinned to 0 Elo (the field floor — `claude-v1`). */
  anchor: string;
  /** MM iterations; the model converges well within this for a small field. */
  iterations?: number;
}

/** Fit Elo ratings for `labels` from the pairwise `results`, anchored so
 *  `anchor` = 0. Assumes the comparison graph is connected and every label both
 *  wins and loses at least once across the field (true for our versions, which
 *  all beat v1 and all lose to a stronger sibling) — a label that never wins
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
