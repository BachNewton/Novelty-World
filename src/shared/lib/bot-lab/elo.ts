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

/** Only the winner's comparisons: the winning seat beat every seat with another
 *  label, and nothing else is compared ("top-1 breaking"). Fed to the
 *  Bradley–Terry fit, this recovers the Luce model's strengths, the one the SPRT
 *  tests: P(a seat wins) = γ / Σγ over the table, copies counted. A game with no
 *  winner compares nothing. */
export function pairsFromWinner(finishes: readonly Finish[]): PairResult[] {
  const winners = finishes.filter((f) => f.place === 1);
  if (winners.length !== 1) return [];
  return pairsFromFinishes(finishes.map((f) => ({ label: f.label, place: f.place === 1 ? 1 : 2 })));
}

/** The highest-Elo label: the field's champion. */
export function topRated(elo: Readonly<Record<string, number>>, labels: readonly string[]): string {
  return labels.reduce((best, l) => (elo[l] > elo[best] ? l : best), labels[0]);
}

/** A fit's comparisons from one source of games, with how each game made them: a game
 *  that side `a` won added `aPerWin` comparisons won by `a`, and one that `b` won added
 *  `bPerWin` won by `b` (a lone seat's win among n − 1 copies breaks into n − 1). */
export interface ComparisonSource extends PairResult {
  aPerWin: number;
  bPerWin: number;
}

const ELO_PER_NATURAL_UNIT = 400 / Math.LN10;

/** How precisely `fitElo` has placed each pair of labels: the variance, in Elo², of the
 *  fitted gap between any two, given the `elo` it fitted from `sources`.
 *
 *  The fit counts a game's comparisons as if each were a game of its own, so its own
 *  Fisher information would overstate the evidence up to n − 1 times. The variance is
 *  instead the sandwich (Huber–White) estimate of the fit as computed: the
 *  Bradley–Terry Hessian H, and the spread of each GAME's score, so a game's comparisons
 *  count as the one outcome they are. With the score of a comparison won by `a` being
 *  1 − p and of one won by `b` −p (p the fit's P(a beats b)), a source's games contribute
 *  aWins·aPerWin·(1 − p)² + bWins·bPerWin·p² to the score's variance M, and the gap's
 *  variance is H⁻¹MH⁻¹. It reads the observed games, so a field that fits the model badly
 *  (strength isn't one number) shows as the larger spread it causes, not hidden by it.
 *  Labels the sources don't connect have an infinite variance. */
export function eloGapVariance(
  labels: readonly string[],
  elo: Readonly<Record<string, number>>,
  sources: readonly ComparisonSource[],
): (a: string, b: string) => number {
  // Every label but the first, whose θ is held at 0: gaps are what the data identify.
  const k = labels.length - 1;
  if (k < 1) return () => 0;
  const at = new Map(labels.slice(1).map((l, i) => [l, i]));
  const h = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const add = (matrix: number[][], a: string, b: string, w: number) => {
    const i = at.get(a);
    const j = at.get(b);
    if (i !== undefined) matrix[i][i] += w;
    if (j !== undefined) matrix[j][j] += w;
    if (i !== undefined && j !== undefined) {
      matrix[i][j] -= w;
      matrix[j][i] -= w;
    }
  };
  for (const s of sources) {
    if (!(s.a in elo) || !(s.b in elo) || s.a === s.b) continue;
    const p = 1 / (1 + Math.exp(-(elo[s.a] - elo[s.b]) / ELO_PER_NATURAL_UNIT));
    add(h, s.a, s.b, (s.aWins + s.bWins) * p * (1 - p));
    add(m, s.a, s.b, s.aWins * s.aPerWin * (1 - p) ** 2 + s.bWins * s.bPerWin * p ** 2);
  }
  const inverse = invert(h);
  if (inverse === null) return (a, b) => (a === b ? 0 : Infinity);
  const cov = multiply(multiply(inverse, m), inverse);
  const scale = ELO_PER_NATURAL_UNIT ** 2;
  return (a, b) => {
    const i = at.get(a);
    const j = at.get(b);
    const cii = i === undefined ? 0 : cov[i][i];
    const cjj = j === undefined ? 0 : cov[j][j];
    const cij = i === undefined || j === undefined ? 0 : cov[i][j];
    return scale * (cii + cjj - 2 * cij);
  };
}

/** The inverse of a symmetric matrix by Gauss–Jordan elimination, or null when it is
 *  singular (the comparisons leave some label unconnected). */
function invert(matrix: readonly (readonly number[])[]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (!(Math.abs(a[pivot][col]) > 0)) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const lead = a[col][col];
    for (let c = 0; c < 2 * n; c++) a[col][c] /= lead;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f !== 0) for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row) => row.slice(n));
}

function multiply(x: readonly (readonly number[])[], y: readonly (readonly number[])[]): number[][] {
  return x.map((row) => y[0].map((_, j) => row.reduce((s, v, k) => s + v * y[k][j], 0)));
}
