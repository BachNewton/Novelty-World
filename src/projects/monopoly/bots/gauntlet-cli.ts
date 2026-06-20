import process from "node:process";
import { formatGauntlet, type GauntletProgress, runGauntlet } from "./gauntlet";
import { defaultWorkerCount, WorkerPool } from "./parallel";
import { VERSIONS } from "./versions";

/** A live progress line for a gauntlet run (so a long run isn't a black box). On a
 *  TTY it rewrites one line in place (`\r`); when captured to a file/pipe it prints
 *  a throttled newline every few seconds so the log shows forward motion. Written to
 *  STDERR so it never pollutes the stdout report. The per-pairing games/cap bar is
 *  the key signal: an SPRT that fills toward the cap is drifting to inconclusive. */
function makeProgressReporter(): (p: GauntletProgress) => void {
  const isTty = process.stderr.isTTY === true;
  let lastPrint = 0;
  let lastLen = 0;
  const bar = (frac: number, width = 16): string => {
    const filled = Math.max(0, Math.min(width, Math.round(frac * width)));
    return "#".repeat(filled) + "-".repeat(width - filled);
  };
  return (p) => {
    const now = Date.now();
    const minGap = isTty ? 150 : 3000;
    if (!p.done && now - lastPrint < minGap) return;
    lastPrint = now;

    const phase = p.kind === "candidate" ? "pairing" : "field  ";
    const winPct = p.decisive > 0 ? `${((100 * p.wins) / p.decisive).toFixed(1)}%` : "—";
    const frac = p.maxDecisive > 0 ? p.decisive / p.maxDecisive : 0;
    let line =
      `  ${phase} ${p.pairIndex}/${p.pairTotal} vs ${p.opponent.padEnd(11)} ` +
      `[${bar(frac)}] ${String(p.decisive).padStart(4)}/${p.maxDecisive}  win ${winPct.padStart(6)}`;
    if (p.kind === "candidate") {
      // LLR toward each SPRT boundary (~±2.94); whichever reaches it first decides.
      line += `  LLR impr ${p.llrImprove.toFixed(1)} regr ${p.llrRegress.toFixed(1)}`;
    }
    if (p.verdict !== undefined) line += `  -> ${p.verdict.toUpperCase()}`;

    if (isTty) {
      process.stderr.write(`\r${line.padEnd(lastLen)}`);
      lastLen = line.length;
      if (p.done) {
        process.stderr.write("\n");
        lastLen = 0;
      }
    } else {
      process.stderr.write(`${line}\n`);
    }
  };
}

/** `npm run sim:gauntlet` — play a candidate against the whole FIELD on the
 *  parallel worker pool, decide each pairing by SPRT, fit Elo across the field,
 *  and print the promotion verdict (see EVOLUTION.md "Measurement"). Deterministic
 *  by seed: same args reproduce the same table.
 *
 *  Usage:
 *    npm run sim:gauntlet -- v3                       # candidate v3 vs the field
 *    npm run sim:gauntlet -- v3 --base v2             # must beat v2 specifically
 *    npm run sim:gauntlet -- v3 --field v1,v2         # explicit field
 *    npm run sim:gauntlet -- v8 --with-v1             # add the v1 floor audit back
 *    npm run sim:gauntlet -- v3 --prefix holdout      # held-out seed stream
 *    npm run sim:gauntlet -- v3 --margin 20 --alpha 0.05 --beta 0.05
 *    npm run sim:gauntlet -- v3 --max 4000 --workers 14
 *
 *  The field defaults to every known version except `dumb` (a null stub — never
 *  gauntleted), `v1` (the floor — dominated and slow; opt back in with `--with-v1`,
 *  see EVOLUTION.md Decision 8), and the candidate; base defaults to the latest. */

interface Args {
  candidate: string;
  base?: string;
  field?: string[];
  prefix: string;
  margin: number;
  alpha: number;
  beta: number;
  maxDecisive: number;
  fieldGames: number;
  maxTurns: number;
  workers: number;
  batch?: number;
  withV1: boolean;
}

function num(argv: readonly string[], i: number, fallback: number): number {
  const n = Number(argv[i]);
  return Number.isNaN(n) ? fallback : n;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const a: Args = {
    candidate: "",
    prefix: "train",
    margin: 20,
    alpha: 0.05,
    beta: 0.05,
    maxDecisive: 4000,
    fieldGames: 200,
    maxTurns: 2000,
    workers: defaultWorkerCount(),
    withV1: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") a.base = argv[++i];
    else if (arg === "--field") a.field = argv[++i].split(",").map((s) => s.trim());
    else if (arg === "--prefix") a.prefix = argv[++i];
    else if (arg === "--margin") a.margin = num(argv, ++i, a.margin);
    else if (arg === "--alpha") a.alpha = num(argv, ++i, a.alpha);
    else if (arg === "--beta") a.beta = num(argv, ++i, a.beta);
    else if (arg === "--max") a.maxDecisive = num(argv, ++i, a.maxDecisive);
    else if (arg === "--field-games") a.fieldGames = num(argv, ++i, a.fieldGames);
    else if (arg === "--turns") a.maxTurns = num(argv, ++i, a.maxTurns);
    else if (arg === "--workers") a.workers = num(argv, ++i, a.workers);
    else if (arg === "--batch") a.batch = num(argv, ++i, 0);
    else if (arg === "--with-v1") a.withV1 = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error(
      `need exactly one candidate version (got ${positional.length}). ` +
        `Example: npm run sim:gauntlet -- v3`,
    );
  }
  a.candidate = positional[0];
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const known = Object.keys(VERSIONS);
  if (!known.includes(args.candidate)) {
    throw new Error(`unknown candidate "${args.candidate}" (known: ${known.join(", ")})`);
  }
  // `dumb` is a null stub and is NEVER gauntleted. v1 is the published FLOOR but is
  // dropped from the DEFAULT field (Decision 8, now taken): every vN≥2 dominates it
  // by ~160 Elo, while v1's trade-veto deadlock caps ~a quarter of its games to the
  // full turn limit — the slowest, least-informative pairing there is. Re-include it
  // for an occasional archived floor audit with `--with-v1` (or an explicit --field).
  const field =
    args.field ??
    known.filter(
      (v) => v !== "dumb" && v !== args.candidate && (args.withV1 || v !== "v1"),
    );
  if (field.length === 0) throw new Error("empty field — nothing to test the candidate against");
  for (const v of field) {
    if (!known.includes(v)) throw new Error(`unknown field version "${v}"`);
    if (v === "dumb") throw new Error("`dumb` is a null bot and must not be gauntleted");
  }
  const base = args.base ?? field[field.length - 1];
  if (!field.includes(base)) throw new Error(`base "${base}" must be one of the field [${field.join(", ")}]`);

  console.log(
    `\nMonopoly — gauntlet\n` +
      `Candidate: ${args.candidate}   Base: ${base}   Field: [${field.join(", ")}]\n` +
      `SPRT: H0=${-args.margin} Elo, H1=+${args.margin} Elo, α=${args.alpha}, β=${args.beta}, ` +
      `max ${args.maxDecisive} decisive/pairing\n` +
      `Seeds: "${args.prefix}:*"   Workers: ${args.workers}   Max turns: ${args.maxTurns}\n`,
  );

  const pool = new WorkerPool(args.workers);
  const start = process.hrtime.bigint();
  try {
    const report = await runGauntlet({
      candidate: args.candidate,
      base,
      field,
      prefix: args.prefix,
      margin: args.margin,
      alpha: args.alpha,
      beta: args.beta,
      maxDecisive: args.maxDecisive,
      fieldGames: args.fieldGames,
      maxTurns: args.maxTurns,
      batchGames: args.batch,
      pool,
      onProgress: makeProgressReporter(),
    });
    const secs = Number(process.hrtime.bigint() - start) / 1e9;
    console.log(formatGauntlet(report));
    console.log(`\n  (${secs.toFixed(1)}s on ${pool.size} workers)\n`);
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
