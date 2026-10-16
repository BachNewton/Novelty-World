import { writeFileSync } from "node:fs";
import process from "node:process";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import { Snes } from "@/shared/lib/bot-lab/snes";
import { tunedLabel, TUNABLE_BOTS } from "../bots";
import { checkBots, commonDefaults, commonFlag, list, number, riskRunLog, type CommonArgs } from "./cli-args";
import { riskPool } from "./parallel";
import { candidateSpecs, cellScores, cellsFor, fitness, fromUnit, PREF_KEYS, toUnit, type PrefKey } from "./tune";

/** `npm run risk:tune` — tune a rule bot's preferences with SNES (`bot-lab/snes.ts`)
 *  against a fixed opponent, at every table size in both mixtures, on seeds each
 *  generation's candidates share. It proposes; the gauntlet decides: the vector it
 *  finds becomes a candidate version only through `risk:gauntlet` on train, then holdout.
 *
 *  Usage:
 *    npm run risk:tune -- --opponent rule-v1 --gens 20 --pop 10 --groups 8 --out tune.json
 *    npm run risk:tune -- --keys borderWeight,idleWeight      # move only these
 *
 *  Each generation also plays the current mean, so its line shows how far the search
 *  has moved from where it started. */

interface Args extends CommonArgs {
  tunable: string;
  opponent: string;
  gens: number;
  pop: number;
  groups: number;
  sigma: number;
  seed: number;
  keys: PrefKey[];
  out?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    ...commonDefaults("tune"),
    tunable: "rule-v1",
    opponent: "rule-v1",
    gens: 20,
    pop: 10,
    groups: 8,
    sigma: 0.15,
    seed: 1,
    keys: [...PREF_KEYS],
  };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    const arg = argv[i];
    if (arg === "--tunable") a.tunable = argv[++i];
    else if (arg === "--opponent") a.opponent = argv[++i];
    else if (arg === "--gens") a.gens = number(argv[++i], arg);
    else if (arg === "--pop") a.pop = number(argv[++i], arg);
    else if (arg === "--groups") a.groups = number(argv[++i], arg);
    else if (arg === "--sigma") a.sigma = number(argv[++i], arg);
    else if (arg === "--seed") a.seed = number(argv[++i], arg);
    else if (arg === "--out") a.out = argv[++i];
    else if (arg === "--keys") {
      const keys = list(argv[++i], arg);
      for (const k of keys) if (!(PREF_KEYS as string[]).includes(k)) throw new Error(`unknown preference "${k}" (known: ${PREF_KEYS.join(", ")})`);
      a.keys = keys as PrefKey[];
    } else throw new Error(`unknown argument "${arg}"`);
  }
  if (!Object.hasOwn(TUNABLE_BOTS, a.tunable)) throw new Error(`"${a.tunable}" is not tunable (tunable: ${Object.keys(TUNABLE_BOTS).join(", ")})`);
  checkBots([a.opponent]);
  return a;
}

const fmt = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(0)}`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cells = cellsFor(args.players);
  const base = TUNABLE_BOTS[args.tunable].prefs;
  const snes = new Snes({ dim: args.keys.length, popSize: args.pop, initSigma: args.sigma, seed: args.seed }, toUnit(base, args.keys));
  const gamesPerCandidate = cells.reduce((s, c) => s + args.groups * c.players, 0);
  console.log(
    `\nRisk — tune ${args.tunable} against ${args.opponent}\n` +
      `Moving: ${args.keys.join(", ")}\n` +
      `Tables: ${args.players.join(", ")} players × one-in, one-out   ${args.groups.toString()} groups a cell (${gamesPerCandidate.toString()} games a candidate)\n` +
      `SNES: pop ${args.pop.toString()}, σ ${args.sigma.toString()}, seed ${args.seed.toString()}   Seeds: "${args.prefix}:g*"   Workers: ${args.workers.toString()}\n`,
  );
  const log = riskRunLog({ tool: "risk:tune", bots: [args.tunable, args.opponent], tables: cells.map((c) => `${c.players.toString()}p ${c.format}`), seeds: args.prefix, workers: args.workers });
  const pool = log.watch(riskPool(args.workers), (r) => r.decisions);
  const history: unknown[] = [];
  try {
    for (let gen = 1; gen <= args.gens; gen++) {
      const samples = snes.ask();
      const labels = [...samples.map((s) => s.x), snes.mu].map((x) => tunedLabel(args.tunable, fromUnit(x, args.keys)));
      const prefix = `${args.prefix}:g${gen.toString()}`;
      const specs = labels.flatMap((label) => candidateSpecs(label, args.opponent, cells, args.groups, prefix, args.maxTurns));
      const results = await pool.run(specs.map((spec, index) => ({ ...spec, index })));
      const scored = labels.map((label) => {
        const scores = cellScores(label, cells, results.filter((r) => r.labels.includes(label)));
        return { label, scores, fitness: fitness(scores) };
      });
      snes.tell(samples, scored.slice(0, samples.length).map((s) => s.fitness));
      const mean = scored[scored.length - 1];
      const best = scored.slice(0, samples.length).reduce((p, q) => (q.fitness > p.fitness ? q : p));
      const meanPrefs = fromUnit(snes.mu, args.keys);
      console.log(
        `gen ${gen.toString().padStart(2)}  mean ${fmt(mean.fitness)} [${mean.scores.map((c) => fmt(c.elo)).join(" ")}]  best ${fmt(best.fitness)}  ` +
          `σ̄ ${(snes.sigma.reduce((s, x) => s + x, 0) / snes.sigma.length).toFixed(3)}\n` +
          `        ${args.keys.map((k) => `${k} ${String(meanPrefs[k])}`).join("  ")}`,
      );
      history.push({ gen, meanFitness: mean.fitness, meanCells: mean.scores, bestFitness: best.fitness, best: best.label, mean: meanPrefs, sigma: [...snes.sigma] });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the output file named on the command line by whoever runs the tuner
      if (args.out) writeFileSync(args.out, JSON.stringify({ args, history, mean: meanPrefs }, null, 2));
    }
  } finally {
    await pool.close();
  }
  console.log(`\nFinal mean: ${JSON.stringify(fromUnit(snes.mu, args.keys))}\n`);
  console.log(`${formatRunRecord(log.finish())}\n`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
