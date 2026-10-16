import process from "node:process";
import { RISK_BOTS } from "../bots";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import { checkBots, commonDefaults, commonFlag, formats, list, number, riskRunLog, type CommonArgs } from "./cli-args";
import { formatRiskGauntlet, formatTable, runRiskGauntlet, type RiskGauntletProgress } from "./gauntlet";
import { FORMATS, riskPool, type Format } from "./parallel";

/** `npm run risk:gauntlet` — a candidate against the field at each table size in
 *  both mixtures, each pairing an SPRT on win share against par, then a
 *  finishing-order Elo and the crown gate (see the project's CLAUDE.md, "Measuring
 *  bots"). Deterministic by seed: the same arguments give the same table on any
 *  number of workers.
 *
 *  Usage:
 *    npm run risk:gauntlet -- greedy --field random          # the floor check
 *    npm run risk:gauntlet -- cand-v2 --base cand-v1         # vs the field (every bot but random)
 *    npm run risk:gauntlet -- cand-v2 --players 6 --formats one-in
 *    npm run risk:gauntlet -- cand-v2 --prefix holdout       # confirm on unseen seeds
 *    npm run risk:gauntlet -- cand-v2 --margin 30 --alpha 0.05 --beta 0.05 --max 20000
 *
 *  The field defaults to every registered bot except the candidate and `random`,
 *  the sanity floor, which is never in a field (it plays only when named); the
 *  base defaults to the field's last member. */

interface Args extends CommonArgs {
  candidate: string;
  base?: string;
  field?: string[];
  formats: Format[];
  margin: number;
  alpha: number;
  beta: number;
  maxDecisive: number;
  fieldGroups: number;
  batch?: number;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const a: Args = {
    ...commonDefaults("train"),
    candidate: "",
    formats: [...FORMATS],
    margin: 30,
    alpha: 0.05,
    beta: 0.05,
    maxDecisive: 20_000,
    fieldGroups: 50,
  };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    const arg = argv[i];
    if (arg === "--base") a.base = argv[++i];
    else if (arg === "--field") a.field = list(argv[++i], "--field");
    else if (arg === "--formats") a.formats = formats(argv[++i]);
    else if (arg === "--margin") a.margin = number(argv[++i], arg);
    else if (arg === "--alpha") a.alpha = number(argv[++i], arg);
    else if (arg === "--beta") a.beta = number(argv[++i], arg);
    else if (arg === "--max") a.maxDecisive = number(argv[++i], arg);
    else if (arg === "--field-groups") a.fieldGroups = number(argv[++i], arg);
    else if (arg === "--batch") a.batch = number(argv[++i], arg);
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error(`need exactly one candidate bot. Example: npm run risk:gauntlet -- greedy --field random`);
  a.candidate = positional[0];
  return a;
}

/** One progress line per pairing on stderr, rewritten in place on a terminal. */
function progressLine(): (p: RiskGauntletProgress) => void {
  const tty = process.stderr.isTTY === true;
  return (p) => {
    if (!p.done && !tty) return;
    const decisive = p.wins + p.losses;
    const line =
      `  ${p.index}/${p.total} ${formatTable(p.table)}  ${decisive}/${p.maxDecisive} decisive, ${p.draws} drawn` +
      `  LLR impr ${p.llrImprove.toFixed(1)} regr ${p.llrRegress.toFixed(1)}`;
    process.stderr.write(tty ? `\r${line.padEnd(110)}${p.done ? "\n" : ""}` : `${line}\n`);
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const field =
    args.field ?? Object.keys(RISK_BOTS).filter((l) => l !== "random" && l !== args.candidate);
  checkBots([args.candidate, ...field]);
  if (field.length === 0) throw new Error("empty field: name the opponents with --field");
  const base = args.base ?? field[field.length - 1];

  console.log(
    `\nRisk — gauntlet\n` +
      `Candidate: ${args.candidate}   Base: ${base}   Field: [${field.join(", ")}]\n` +
      `Tables: ${args.players.join(", ")} players × ${args.formats.join(", ")}\n` +
      `SPRT: ±${args.margin} Elo per seat (Luce par), α=${args.alpha}, β=${args.beta}, max ${args.maxDecisive} decisive/pairing\n` +
      `Seeds: "${args.prefix}:*"   Workers: ${args.workers}   Max turns: ${args.maxTurns}\n`,
  );

  const log = riskRunLog({
    tool: "risk:gauntlet",
    bots: [args.candidate, ...field],
    tables: args.players.flatMap((n) => args.formats.map((f) => `${n.toString()}p ${f}`)),
    seeds: args.prefix,
    workers: args.workers,
  });
  const pool = log.watch(riskPool(args.workers), (r) => r.decisions);
  try {
    const report = await runRiskGauntlet({
      candidate: args.candidate,
      base,
      field,
      players: args.players,
      formats: args.formats,
      prefix: args.prefix,
      margin: args.margin,
      alpha: args.alpha,
      beta: args.beta,
      maxDecisive: args.maxDecisive,
      fieldGroups: args.fieldGroups,
      maxTurns: args.maxTurns,
      batchGames: args.batch,
      pool,
      onProgress: progressLine(),
    });
    console.log(formatRiskGauntlet(report));
    console.log(`\n${formatRunRecord(log.finish())}\n`);
    if (report.errors > 0) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
