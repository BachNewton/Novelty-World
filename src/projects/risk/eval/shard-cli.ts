import os from "node:os";
import process from "node:process";
import { RowBeat } from "@/shared/lib/bot-lab/live";
import { readPlan, stripe, writeJson } from "@/shared/lib/bot-lab/remote";
import { formatRunRecord, RunLog } from "@/shared/lib/bot-lab/run-log";
import { checkBots, number, riskLiveSink } from "./cli-args";
import { riskPool } from "./parallel";
import { playShard } from "./remote";
import type { RiskGameSpec } from "./runner";

/** `npm run risk:shard` — plays one machine's share of a remote round (`remote.ts`): the
 *  plan a gauntlet or ratings run wrote with `--plan`, every `shards`-th of its games
 *  from this shard's own. It keeps the run's live row alive while it plays, and writes
 *  its games and its run-log record into one file for the next round to read.
 *
 *  Usage:
 *    npm run risk:shard -- plan.json --shard 3 --out games/r2-s3.json
 *    npm run risk:shard -- plan.json --shard 0 --out games/r1-s0.json --workers 4
 *
 *  Workers default to every core: the main thread only hands out games. */

interface Args {
  plan: string;
  shard: number;
  out: string;
  workers: number;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let shard: number | undefined;
  let out: string | undefined;
  let workers = os.cpus().length;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--shard") shard = number(argv[++i], arg);
    else if (arg === "--out") out = argv[++i];
    else if (arg === "--workers") workers = number(argv[++i], arg);
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || shard === undefined || out === undefined) {
    throw new Error("Example: npm run risk:shard -- plan.json --shard 0 --out games/r1-s0.json");
  }
  return { plan: positional[0], shard, out, workers };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = readPlan<RiskGameSpec>(args.plan);
  checkBots([...new Set(plan.specs.flatMap((s) => s.labels))]);
  const games = stripe(plan.specs, plan.shards, args.shard).length;
  console.log(`\nRisk — round ${plan.round.toString()}, shard ${args.shard.toString()} of ${plan.shards.toString()}: ${games.toString()} games on ${args.workers.toString()} workers\n`);

  const log = new RunLog(null, { tool: "risk:shard", args: process.argv.slice(2), bots: [], tables: [], seeds: "", workers: args.workers });
  const sink = plan.live === null ? null : riskLiveSink();
  const beat = sink === null || plan.live === null ? null : new RowBeat(sink, plan.live);
  const pool = log.watch(riskPool(args.workers), (r) => r.decisions);
  try {
    const shard = await playShard(plan, args.shard, pool, () => log.finish());
    writeJson(args.out, shard);
    const errors = shard.games.filter((g) => g.result.error !== undefined).length;
    console.log(formatRunRecord(shard.record));
    if (errors > 0) console.log(`  ⚠ ${errors.toString()} games threw: a bot or engine bug, which the run's report counts`);
  } finally {
    await pool.close();
    await beat?.stop();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
