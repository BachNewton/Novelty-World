import process from "node:process";
import { fitElo, pairsFromFinishes, pairsFromWinner, type PairResult } from "@/shared/lib/bot-lab/elo";
import { wilsonInterval } from "@/shared/lib/bot-lab/stats";
import { RISK_BOTS } from "../bots";
import { checkBots, commonDefaults, commonFlag, number, type CommonArgs } from "./cli-args";
import { eloLine } from "./gauntlet";
import { finishesOf, outcomeFor, riskPool, tableSpecs } from "./parallel";

/** `npm run risk:ratings` — a ladder of Risk bots: every pair plays a fixed number
 *  of seed groups at each table size, each bot alone among copies of the other,
 *  and one Bradley–Terry fit over the winners gives the win Elo (the ladder), with
 *  the finishing-order Elo beside it. It measures; the gauntlet decides (see the
 *  project's CLAUDE.md, "Measuring bots").
 *
 *  Usage:
 *    npm run risk:ratings -- greedy random                 # name the bots (random only when named)
 *    npm run risk:ratings -- greedy random --players 6 --groups 100 --anchor random */

interface Args extends CommonArgs {
  labels: string[];
  groups: number;
  anchor?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { ...commonDefaults("ratings"), labels: [], groups: 50 };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    if (argv[i] === "--groups") a.groups = number(argv[++i], "--groups");
    else if (argv[i] === "--anchor") a.anchor = argv[++i];
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag "${argv[i]}"`);
    else a.labels.push(argv[i]);
  }
  if (a.labels.length === 0) a.labels = Object.keys(RISK_BOTS).filter((l) => l !== "random");
  if (a.labels.length < 2) throw new Error("a ladder needs at least two bots. Example: npm run risk:ratings -- greedy random");
  checkBots(a.labels);
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const anchor = args.anchor ?? args.labels[0];
  console.log(
    `\nRisk — ratings\n` +
      `Bots: [${args.labels.join(", ")}]   Tables: ${args.players.join(", ")} players, each bot alone among the other\n` +
      `${args.groups} seed groups per table   Seeds: "${args.prefix}:*"   Workers: ${args.workers}   Max turns: ${args.maxTurns}\n`,
  );
  const pool = riskPool(args.workers);
  const start = process.hrtime.bigint();
  const winPairs: PairResult[] = [];
  const finishPairs: PairResult[] = [];
  let errors = 0;
  try {
    for (let i = 0; i < args.labels.length; i++) {
      for (let j = i + 1; j < args.labels.length; j++) {
        for (const n of args.players) {
          for (const [lone, rest] of [[args.labels[i], args.labels[j]], [args.labels[j], args.labels[i]]]) {
            const prefix = `${args.prefix}:${lone}-in-${rest}:${n}p`;
            const results = await pool.run(tableSpecs(lone, rest, "one-in", n, prefix, 0, args.groups * n, args.maxTurns));
            let wins = 0;
            let losses = 0;
            let draws = 0;
            for (const r of results) {
              const o = outcomeFor(r, lone);
              if (o === "error") {
                errors++;
                continue;
              }
              if (o === "win") wins++;
              else if (o === "loss") losses++;
              else draws++;
              winPairs.push(...pairsFromWinner(finishesOf(r)));
              finishPairs.push(...pairsFromFinishes(finishesOf(r)));
            }
            const ci = wilsonInterval(wins, wins + losses);
            const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
            console.log(
              `  ${n}p  ${lone} alone among ${rest}: wins ${pct(ci.share)} [${pct(ci.low)}–${pct(ci.high)}] vs par ${pct(1 / n)}` +
                `   (${wins}–${losses}, ${draws} capped)`,
            );
          }
        }
      }
    }
  } finally {
    await pool.close();
  }
  const secs = Number(process.hrtime.bigint() - start) / 1e9;
  console.log(`\n  Win Elo (${anchor} = 0):              ${eloLine(fitElo(args.labels, winPairs, { anchor }))}`);
  console.log(`  Finishing-order Elo (${anchor} = 0):  ${eloLine(fitElo(args.labels, finishPairs, { anchor }))}`);
  if (errors > 0) {
    console.log(`  ⚠ ${errors} games threw and were excluded: a bot or engine bug`);
    process.exitCode = 1;
  }
  console.log(`\n  (${secs.toFixed(1)}s on ${pool.size} workers)\n`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
