import { writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { RATING_PANEL } from "./versions";
import {
  buildEvalSpecs,
  buildPerMemberEvalSpecs,
  FitnessPool,
  type MaximinOutcome,
} from "./optimize/fitness";
import { Snes } from "./optimize/snes";
import {
  clampParams,
  DEFAULT_PARAMS,
  PARAM_BOUNDS,
  PARAM_KEYS,
  unpackParams,
  type ParamVector,
} from "./optimize/params";

// ---------------------------------------------------------------------------
// `npm run sim:optimize` — globally optimize the claude-v38 parameter vector with
// an Evolutionary Strategy (SNES), against the ANCHOR PANEL, on the worker pool.
// This is the BREAKOUT idea: the archive was hand-tuned ONE constant at a time
// (SPRT-gated); an ES tunes the FULL vector JOINTLY and can find combinations
// hand-tuning never reached.
//
// Pipeline: SNES samples candidates in normalized [0,1] space → mapped to real
// params via PARAM_BOUNDS → win-share vs the panel over a fixed TRAIN seed set
// (common random numbers) → natural-gradient update. The best vector is printed
// (and written to optimize/best-vector.json) for freezing into versions/opt-v1.
//
// Fitness modes (`--fitness`):
//   aggregate (default)  win-share over a MIXED two-member field (the original
//                        objective). Maximises overall strength — but can be won
//                        by crushing weak panel members while only tying the
//                        strong ones, which is the misalignment opt-v1 hit.
//   maximin              the MINIMUM, over the 6 panel members, of the candidate's
//                        win-share vs THAT single member, in the crown gauntlet's
//                        2-candidate-vs-2-member pairing shape. CROWN-ALIGNED: the
//                        crown requires beating the base with no per-member
//                        regression, so the ES must lift its WORST matchup.
//                        `--games` is split evenly across the 6 members.
//
// Run modes:
//   --spike            time ONE fitness eval and exit (feasibility check first).
//   (default)          run the ES for `--gens` generations.
// Flags: --pop, --gens, --games, --turns, --seed, --workers, --prefix, --fitness.
// ---------------------------------------------------------------------------

type FitnessMode = "aggregate" | "maximin";

interface Args {
  spike: boolean;
  pop: number;
  gens: number;
  games: number;
  maxTurns: number;
  seed: number;
  workers?: number;
  prefix: string;
  fitness: FitnessMode;
}

function num(argv: readonly string[], i: number, fallback: number): number {
  const n = Number(argv[i]);
  return Number.isNaN(n) ? fallback : n;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    spike: false,
    pop: 16,
    gens: 20,
    games: 360,
    maxTurns: 2000,
    seed: 1,
    prefix: "opt-train",
    fitness: "aggregate",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--spike") a.spike = true;
    else if (arg === "--pop") a.pop = num(argv, ++i, a.pop);
    else if (arg === "--gens") a.gens = num(argv, ++i, a.gens);
    else if (arg === "--games") a.games = num(argv, ++i, a.games);
    else if (arg === "--turns") a.maxTurns = num(argv, ++i, a.maxTurns);
    else if (arg === "--seed") a.seed = num(argv, ++i, a.seed);
    else if (arg === "--workers") a.workers = num(argv, ++i, a.workers ?? 0);
    else if (arg === "--prefix") a.prefix = argv[++i];
    else if (arg === "--fitness") a.fitness = parseFitness(argv[++i]);
    else throw new Error(`unknown flag "${arg}"`);
  }
  return a;
}

function parseFitness(v: string | undefined): FitnessMode {
  if (v === "aggregate" || v === "maximin") return v;
  throw new Error(`--fitness must be "aggregate" or "maximin" (got "${v ?? ""}")`);
}

// --- normalized [0,1] ↔ real-param mapping via PARAM_BOUNDS ---
function realToNorm(p: ParamVector): number[] {
  return PARAM_KEYS.map((k) => {
    const [lo, hi] = PARAM_BOUNDS[k];
    return (p[k] - lo) / (hi - lo);
  });
}

function normToReal(x: readonly number[]): ParamVector {
  const raw = PARAM_KEYS.map((k, i) => {
    const [lo, hi] = PARAM_BOUNDS[k];
    const clamped = Math.min(1, Math.max(0, x[i]));
    return lo + clamped * (hi - lo);
  });
  return clampParams(unpackParams(raw));
}

function fmtVector(p: ParamVector): string {
  return PARAM_KEYS.map((k) => `${k}=${round(p[k])}`).join("  ");
}

function round(n: number): number {
  return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 1000) / 1000;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const panel = RATING_PANEL;
  const pool = new FitnessPool(args.workers && args.workers > 0 ? args.workers : undefined);

  // Both modes share one ES loop; they differ only in `evalFitness` (the scalar the
  // ES ranks on). Aggregate scores a mixed two-member field; maximin scores the
  // worst single-member matchup, splitting `--games` across the 6 members.
  const aggSpecs = buildEvalSpecs(panel, args.prefix, args.games, args.maxTurns);
  const gamesPerMember = Math.max(1, Math.floor(args.games / panel.length));
  const perMemberSpecs = buildPerMemberEvalSpecs(
    panel,
    args.prefix,
    gamesPerMember,
    args.maxTurns,
  );
  const evalFitness = async (params: typeof DEFAULT_PARAMS): Promise<number> =>
    args.fitness === "maximin"
      ? (await pool.evaluateMaximin(params, perMemberSpecs)).fitness
      : (await pool.evaluate(params, aggSpecs)).winShare;

  const gamesNote =
    args.fitness === "maximin"
      ? `${gamesPerMember} × ${panel.length} members = ${gamesPerMember * panel.length}`
      : `${args.games}`;
  console.log(
    `\nMonopoly — ES parameter optimization (SNES)\n` +
      `Fitness: ${args.fitness}` +
      (args.fitness === "maximin" ? " (MIN per-member win-share — crown-aligned)" : "") +
      `\n` +
      `Panel field: [${panel.join(", ")}]\n` +
      `Params (${PARAM_KEYS.length}): [${PARAM_KEYS.join(", ")}]\n` +
      `Games/eval: ${gamesNote}   Turn cap: ${args.maxTurns}   Workers: ${pool.size}\n`,
  );

  try {
    // Always baseline the default vector (claude-v38) on the same stream first —
    // the bar the ES must clear, measured under identical CRN. In maximin mode we
    // print the per-member breakdown so the binding (worst) matchup is visible.
    const baseStart = process.hrtime.bigint();
    let baseFitness: number;
    if (args.fitness === "maximin") {
      const mm = await pool.evaluateMaximin(DEFAULT_PARAMS, perMemberSpecs);
      baseFitness = mm.fitness;
      console.log(
        `Baseline claude-v38 (default vector): maximin win-share ${(100 * mm.fitness).toFixed(2)}% ` +
          `(worst vs ${mm.worstMember})`,
      );
      console.log(`  ${formatMembers(mm)}`);
    } else {
      const baseline = await pool.evaluate(DEFAULT_PARAMS, aggSpecs);
      baseFitness = baseline.winShare;
      const se = standardError(baseline.winShare, baseline.decisive);
      console.log(
        `Baseline claude-v38 (default vector): win-share ${(100 * baseline.winShare).toFixed(2)}% ` +
          `(${baseline.wins}/${baseline.decisive} decisive, ${baseline.draws} draws, ` +
          `binomial SE ±${(100 * se).toFixed(2)}%)`,
      );
    }
    const baseSecs = Number(process.hrtime.bigint() - baseStart) / 1e9;
    console.log(`One fitness eval: ${baseSecs.toFixed(1)}s on ${pool.size} workers.\n`);

    if (args.spike) {
      const popEvalSecs = baseSecs * args.pop;
      console.log(
        `FEASIBILITY: pop=${args.pop} → ~${popEvalSecs.toFixed(0)}s/generation, ` +
          `${args.gens} gens → ~${((popEvalSecs * args.gens) / 60).toFixed(1)} min total ` +
          `(plus the per-gen best re-eval).`,
      );
      return;
    }

    const dim = PARAM_KEYS.length;
    const popSize = args.pop;
    const snes = new Snes(
      { dim, popSize, initSigma: 0.18, seed: args.seed },
      realToNorm(DEFAULT_PARAMS),
    );

    let bestParams = DEFAULT_PARAMS;
    let bestFitness = baseFitness;
    const trajectory: { gen: number; best: number; mean: number; genBest: number }[] = [];

    const outPath = fileURLToPath(new URL("./optimize/best-vector.json", import.meta.url));
    // CHECKPOINT the best-so-far vector after EVERY generation, not only at the
    // end — a long ES run can be interrupted (resource pressure, a stop), and the
    // all-time-best is monotone, so a partial run still yields the strongest vector
    // it found. The final write below is then just the last checkpoint.
    const checkpoint = (): void => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- `outPath` is this script's own directory joined with a hardcoded filename; no external input.
      writeFileSync(
        outPath,
        JSON.stringify(
          { fitness: args.fitness, baseline: baseFitness, bestFitness, bestParams, trajectory },
          null,
          2,
        ) + "\n",
      );
    };

    for (let gen = 0; gen < args.gens; gen++) {
      const samples = snes.ask();
      const fitness = new Array<number>(popSize);
      let genBest = -1;
      let genBestIdx = -1;
      let sum = 0;
      for (let i = 0; i < popSize; i++) {
        const params = normToReal(samples[i].x);
        const f = await evalFitness(params);
        fitness[i] = f;
        sum += f;
        if (f > genBest) {
          genBest = f;
          genBestIdx = i;
        }
      }
      snes.tell(samples, fitness);

      // Track the all-time best CANDIDATE (re-eval the gen's incumbent mean too,
      // so the reported best is a real evaluated vector, not an untested μ).
      const genBestParams = normToReal(samples[genBestIdx].x);
      if (genBest > bestFitness) {
        bestFitness = genBest;
        bestParams = genBestParams;
      }
      const meanFit = sum / popSize;
      trajectory.push({ gen: gen + 1, best: bestFitness, mean: meanFit, genBest });
      console.log(
        `gen ${(gen + 1).toString().padStart(2)}/${args.gens}  ` +
          `genBest ${(100 * genBest).toFixed(2)}%  mean ${(100 * meanFit).toFixed(2)}%  ` +
          `allTimeBest ${(100 * bestFitness).toFixed(2)}%  ` +
          `σ̄ ${(snes.sigma.reduce((x, y) => x + y, 0) / dim).toFixed(3)}`,
      );
      checkpoint();
    }

    // Re-evaluate the final μ (the ES's converged center) — often the steadiest
    // estimate of the optimum and a candidate for the frozen vector.
    const finalMu = normToReal(snes.mu);
    const muFit = await evalFitness(finalMu);
    const fitLabel = args.fitness === "maximin" ? "maximin win-share" : "win-share";
    console.log(`\nFinal μ (ES center): ${fitLabel} ${(100 * muFit).toFixed(2)}%`);
    if (muFit > bestFitness) {
      bestFitness = muFit;
      bestParams = finalMu;
    }

    // Final per-member breakdown of the chosen best vector (maximin only) — shows
    // whether the floor actually lifted and which matchup now binds.
    if (args.fitness === "maximin") {
      const mm = await pool.evaluateMaximin(bestParams, perMemberSpecs);
      console.log(`Best vector per-member: ${formatMembers(mm)}`);
    }

    console.log(`\n=== RESULT ===`);
    console.log(`Baseline (claude-v38): ${(100 * baseFitness).toFixed(2)}%`);
    console.log(
      `Best vector:           ${(100 * bestFitness).toFixed(2)}% ` +
        `(train ${fitLabel} vs panel)`,
    );
    console.log(`\nBest param vector:\n  ${fmtVector(bestParams)}`);
    console.log(`\nDelta from claude-v38 defaults:`);
    for (const k of PARAM_KEYS) {
      const d = bestParams[k] - DEFAULT_PARAMS[k];
      if (Math.abs(d) > 1e-9) {
        console.log(
          `  ${k.padEnd(20)} ${round(DEFAULT_PARAMS[k])} → ${round(bestParams[k])}  ` +
            `(${d > 0 ? "+" : ""}${round(d)})`,
        );
      }
    }

    checkpoint();
    console.log(`\nWrote ${outPath}`);
  } finally {
    await pool.close();
  }
}

/** Binomial standard error of a win-share over `decisive` Bernoulli trials. */
function standardError(share: number, decisive: number): number {
  if (decisive === 0) return 0;
  return Math.sqrt((share * (1 - share)) / decisive);
}

/** One-line per-member win-share breakdown for a maximin outcome. */
function formatMembers(mm: MaximinOutcome): string {
  return mm.members
    .map((o) => `${o.member} ${(100 * o.winShare).toFixed(1)}% (${o.wins}/${o.decisive})`)
    .join("  ");
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
