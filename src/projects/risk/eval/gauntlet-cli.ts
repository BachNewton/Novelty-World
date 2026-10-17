import process from "node:process";
import { RISK_BOTS } from "../bots";
import RATINGS from "../bots/ratings.json";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import { dualVerdict, sprtBounds } from "@/shared/lib/bot-lab/sprt";
import { checkBots, commonDefaults, commonFlag, formats, list, number, riskRun, type CommonArgs } from "./cli-args";
import { formatRiskGauntlet, formatTable, gauntletTables, runRiskGauntlet, type RiskGauntletProgress } from "./gauntlet";
import { candidateSeats, FORMATS, riskPool, type Format } from "./parallel";

/** `npm run risk:gauntlet` — a candidate against the field at each table size in
 *  both mixtures, each pairing an SPRT on win share against par, then a
 *  finishing-order Elo and the gate's verdict, an instrument, not a promotion (see the project's CLAUDE.md, "Measuring
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
 *  base defaults to the field's strongest member by the seatable bots' Elo
 *  (`bots/ratings.json`): a candidate is measured against the strongest bot, whatever it
 *  descends from. */

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

/** A progress line on stderr for each pairing as it is decided; on a terminal, the
 *  latest round of whichever pairing last played one is rewritten in place. */
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

/** The field's strongest member by measured Elo, or its last when none is rated. */
function strongest(field: readonly string[]): string {
  const elo: Readonly<Record<string, number>> = RATINGS.elo;
  const rated = field.filter((l) => Object.hasOwn(elo, l));
  if (rated.length === 0) return field[field.length - 1];
  return rated.reduce((best, l) => (elo[l] > elo[best] ? l : best));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const field =
    args.field ?? Object.keys(RISK_BOTS).filter((l) => l !== "random" && l !== args.candidate);
  checkBots([args.candidate, ...field]);
  if (field.length === 0) throw new Error("empty field: name the opponents with --field");
  const base = args.base ?? strongest(field);

  console.log(
    `
Risk — gauntlet
` +
      `Candidate: ${args.candidate}   Base: ${base}   Field: [${field.join(", ")}]
` +
      `Tables: ${args.players.join(", ")} players × ${args.formats.join(", ")}
` +
      `SPRT: ±${args.margin} Elo per seat (Luce par), α=${args.alpha}, β=${args.beta}, max ${args.maxDecisive} decisive/pairing
` +
      `Seeds: "${args.prefix}:*"   Workers: ${args.workers}   Max turns: ${args.maxTurns}
`,
  );

  const live = riskRun({
    tool: "risk:gauntlet",
    bots: [args.candidate, ...field],
    tables: args.players.flatMap((n) => args.formats.map((f) => `${n.toString()}p ${f}`)),
    seeds: args.prefix,
    workers: args.workers,
  });
  // The pairings each count as one step of the run, however long their SPRT plays,
  // and the field's own games, whose number is fixed, as one more.
  const pairings = gauntletTables(field, args.players, args.formats).length;
  const playerGames = args.players.reduce((s, n) => s + n, 0);
  const fieldGames = field.length * (field.length - 1) * args.fieldGroups * playerGames;
  const steps = pairings + (fieldGames > 0 ? 1 : 0);
  const bounds = sprtBounds(args.alpha, args.beta);
  let decided = 0;
  let fieldFrom: number | null = null;
  live.setProgress(() => {
    const fieldDone = fieldFrom === null || fieldGames === 0 ? 0 : (live.counts().games - fieldFrom) / fieldGames;
    return (decided + Math.min(1, fieldDone)) / steps;
  });
  const line = progressLine();
  const onProgress = (p: RiskGauntletProgress): void => {
    line(p);
    const seats = candidateSeats(p.table.format, p.table.players);
    live.step(p.index - 1, {
      table: `${p.table.players.toString()}p`,
      pairing: { bot: args.candidate, against: p.table.opponent, seats, players: p.table.players },
      games: p.wins + p.losses + p.draws,
      record: { wins: p.wins, losses: p.losses, draws: p.draws, par: seats / p.table.players },
      sprt: { llrImprove: p.llrImprove, llrRegress: p.llrRegress, ...bounds },
      ...(p.done ? { verdict: dualVerdict(p.llrImprove, p.llrRegress, bounds) ?? "inconclusive" } : {}),
      done: p.done,
    });
    if (!p.done) return;
    decided++;
    if (decided === p.total) fieldFrom = live.counts().games;
  };

  const pool = live.watch(riskPool(args.workers), (r) => r.decisions);
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
      onProgress,
    });
    console.log(formatRiskGauntlet(report));
    const record = await live.finish({
      elo: { anchor: base, ratings: report.elo },
      crown: {
        candidate: report.candidate,
        base: report.base,
        improvesVsBase: report.improvesVsBase,
        regressions: [...report.regressions],
        accepted: report.accepted,
        champion: report.champion,
      },
      errors: report.errors,
    });
    console.log(`
${formatRunRecord(record)}
`);
    if (report.errors > 0) process.exitCode = 1;
  } catch (e) {
    await live.fail(e);
    throw e;
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
