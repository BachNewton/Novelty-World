// ---------------------------------------------------------------------------
// SNES — Separable Natural Evolution Strategy (Schaul et al. 2011), a compact,
// robust black-box optimizer for the bot's parameter vector. It maintains a
// per-dimension Gaussian (mean μ, std σ) in NORMALIZED [0,1] space (so every
// parameter shares one scale regardless of its real-world units), samples a
// population each generation, ranks them by fitness, and follows the
// fitness-shaped NATURAL GRADIENT on (μ, σ). Separable = one independent Gaussian
// per dimension (no full covariance), which is simple and parallelizes trivially.
//
// This is OFFLINE optimization tooling. Its sampling uses a fixed numeric seed we
// control, so a run is reproducible; the produced constants are what matter, and
// the frozen bot stays pure (no ES code ships in the bot).
// ---------------------------------------------------------------------------

/** A tiny deterministic PRNG (mulberry32) so the ES's own sampling is reproducible
 *  from a numeric seed — independent of the game RNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller, drawn from a uniform PRNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SnesConfig {
  /** Dimensionality of the parameter vector. */
  dim: number;
  /** Population size λ. SNES default ≈ 4 + ⌊3 ln d⌋; we let the caller pick. */
  popSize: number;
  /** Learning rate for the mean (default 1). */
  etaMu?: number;
  /** Learning rate for the std (SNES default ≈ (3+ln d)/(5·√d)). */
  etaSigma?: number;
  /** Initial std per dimension in normalized space (default 0.2 — a moderate,
   *  not-too-greedy spread around the seed). */
  initSigma?: number;
  /** Numeric seed for the ES's own sampling (reproducibility). */
  seed: number;
}

/** One sampled candidate: its normalized vector and the raw standard-normal draws
 *  `z` that produced it (the NES update is expressed in `z`-space). */
export interface SnesSample {
  /** Normalized [0,1]-ish coordinates (may slightly exceed before clamping). */
  x: number[];
  z: number[];
}

/** The Separable NES optimizer over normalized coordinates. The caller maps
 *  normalized x → real params (and clamps), evaluates fitness, and feeds the
 *  scores back in the SAME order as `ask()` returned them. */
export class Snes {
  readonly dim: number;
  readonly popSize: number;
  private readonly etaMu: number;
  private readonly etaSigma: number;
  private readonly rng: () => number;
  /** Per-dimension mean and std in normalized space. */
  mu: number[];
  sigma: number[];
  /** Fitness-shaping utilities (rank weights), precomputed for `popSize`. */
  private readonly utilities: number[];

  constructor(cfg: SnesConfig, initMu: readonly number[]) {
    this.dim = cfg.dim;
    this.popSize = cfg.popSize;
    this.etaMu = cfg.etaMu ?? 1;
    this.etaSigma = cfg.etaSigma ?? (3 + Math.log(cfg.dim)) / (5 * Math.sqrt(cfg.dim));
    this.rng = mulberry32(cfg.seed);
    this.mu = [...initMu];
    this.sigma = new Array<number>(cfg.dim).fill(cfg.initSigma ?? 0.2);
    this.utilities = computeUtilities(cfg.popSize);
  }

  /** Sample a fresh population of `popSize` candidates. */
  ask(): SnesSample[] {
    const samples: SnesSample[] = [];
    for (let i = 0; i < this.popSize; i++) {
      const z = new Array<number>(this.dim);
      const x = new Array<number>(this.dim);
      for (let d = 0; d < this.dim; d++) {
        z[d] = gaussian(this.rng);
        x[d] = this.mu[d] + this.sigma[d] * z[d];
      }
      samples.push({ x, z });
    }
    return samples;
  }

  /** Apply the NES natural-gradient update from the population's fitnesses
   *  (higher = better). `samples` and `fitness` are index-aligned. */
  tell(samples: readonly SnesSample[], fitness: readonly number[]): void {
    // Rank candidates best→worst; assign the precomputed utility by rank.
    const order = fitness.map((f, i) => i).sort((a, b) => fitness[b] - fitness[a]);
    const u = new Array<number>(this.popSize);
    order.forEach((sampleIdx, rank) => {
      u[sampleIdx] = this.utilities[rank];
    });

    // Natural-gradient updates (separable): per dimension,
    //   ∇μ_d = Σ_i u_i · z_{i,d}
    //   ∇σ_d = Σ_i u_i · (z_{i,d}² − 1)
    //   μ_d  += ημ · σ_d · ∇μ_d
    //   σ_d  *= exp( (ησ/2) · ∇σ_d )
    for (let d = 0; d < this.dim; d++) {
      let gradMu = 0;
      let gradSigma = 0;
      for (let i = 0; i < this.popSize; i++) {
        const z = samples[i].z[d];
        gradMu += u[i] * z;
        gradSigma += u[i] * (z * z - 1);
      }
      this.mu[d] += this.etaMu * this.sigma[d] * gradMu;
      this.sigma[d] *= Math.exp((this.etaSigma / 2) * gradSigma);
    }
  }
}

/** SNES fitness-shaping utilities: u_k = max(0, ln(λ/2 + 1) − ln k) normalized to
 *  sum 1, then shifted by −1/λ so they sum to zero (a baseline-subtracted natural
 *  gradient — the standard NES weighting). Index 0 = best rank. */
function computeUtilities(lambda: number): number[] {
  const raw = new Array<number>(lambda);
  let sum = 0;
  for (let k = 0; k < lambda; k++) {
    const v = Math.max(0, Math.log(lambda / 2 + 1) - Math.log(k + 1));
    raw[k] = v;
    sum += v;
  }
  return raw.map((v) => (sum > 0 ? v / sum : 0) - 1 / lambda);
}
