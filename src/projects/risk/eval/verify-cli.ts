import process from "node:process";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { checkBots, commonDefaults, commonFlag, number } from "./cli-args";
import { riskPool, tableSpecs } from "./parallel";
import { runSpec, type RiskGameResult, type RiskGameSpec } from "./runner";

/** `npm run risk:verify` — prove the worker pool gives BIT-IDENTICAL games to the
 *  single-threaded runner on the same specs, and measure the engine's throughput
 *  in the harness while at it: games per second on one core and on the pool, and
 *  the mean length of a game.
 *
 *  Usage:
 *    npm run risk:verify -- greedy random                  # one-in both ways, 3/4/6 players
 *    npm run risk:verify -- greedy                         # every seat the same bot
 *    npm run risk:verify -- greedy random --players 6 --groups 40 --workers 14 */

interface Args {
  labels: string[];
  groups: number;
  common: ReturnType<typeof commonDefaults>;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { labels: [], groups: 10, common: commonDefaults("verify") };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a.common, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    if (argv[i] === "--groups") a.groups = number(argv[++i], "--groups");
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag "${argv[i]}"`);
    else a.labels.push(argv[i]);
  }
  if (a.labels.length < 1 || a.labels.length > 2) {
    throw new Error("name one bot (every seat) or two (one-in both ways). Example: npm run risk:verify -- greedy random");
  }
  checkBots(a.labels);
  return a;
}

function specsFor(args: Args, players: number): RiskGameSpec[] {
  const count = args.groups * players;
  const { prefix, maxTurns } = args.common;
  if (args.labels.length === 1) {
    const label = args.labels[0];
    return Array.from({ length: count }, (_, index) => ({
      index,
      seed: `${prefix}-${players}p-${Math.floor(index / players) + 1}`,
      labels: Array.from({ length: players }, () => label),
      maxTurns,
    }));
  }
  const [a, b] = args.labels;
  return [
    ...tableSpecs(a, b, "one-in", players, `${prefix}-${players}p-${a}`, 0, count, maxTurns),
    ...tableSpecs(b, a, "one-in", players, `${prefix}-${players}p-${b}`, count, count, maxTurns),
  ];
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inline = inlineRunner(runSpec);
  const pool = riskPool(args.common.workers);
  let mismatches = 0;
  let errors = 0;
  console.log(
    `\nRisk — parallel determinism and throughput\n` +
      `Bots: ${args.labels.join(" vs ")}   ${args.groups} seed groups per table   Workers: ${pool.size}   Max turns: ${args.common.maxTurns}\n`,
  );
  try {
    // Warm both paths up (the first games pay for loading and compiling the engine)
    // so the timings below measure play, not start-up.
    await inline.run(specsFor({ ...args, groups: 1 }, 4));
    await pool.run(specsFor({ ...args, groups: pool.size }, 4));

    for (const players of args.common.players) {
      const specs = specsFor(args, players);
      let t = performance.now();
      const single = await inline.run(specs);
      const singleSecs = (performance.now() - t) / 1000;
      t = performance.now();
      const parallel = await pool.run(specs);
      const poolSecs = (performance.now() - t) / 1000;

      const same = (s: RiskGameResult, p: RiskGameResult) => JSON.stringify(s) === JSON.stringify(p);
      const diverged = single.filter((s, i) => !same(s, parallel[i]));
      mismatches += diverged.length;
      for (const s of diverged.slice(0, 5)) console.log(`  ✗ ${s.seed} [${s.labels.join(",")}] diverged`);
      const played = single.filter((r) => r.error === undefined);
      errors += single.length - played.length;
      for (const r of single.filter((g) => g.error !== undefined).slice(0, 5)) console.log(`  ⚠ ${r.seed}: ${r.error}`);
      const caps = played.filter((r) => r.winner === null).length;
      const decisions = played.reduce((s, r) => s + r.decisions, 0);

      console.log(
        `  ${players}p  ${specs.length} games  ${diverged.length === 0 ? "bit-identical ✓" : `${diverged.length} diverged ✗`}` +
          `   turns/game ${mean(played.map((r) => r.turns)).toFixed(1)}   moves/game ${(decisions / Math.max(1, played.length)).toFixed(0)}` +
          `   capped ${caps}\n` +
          `       one core: ${(specs.length / singleSecs).toFixed(1)} games/s (${((decisions / singleSecs) / 1000).toFixed(1)}k moves/s)` +
          `   pool: ${(specs.length / poolSecs).toFixed(1)} games/s (${(specs.length / poolSecs / pool.size).toFixed(1)} per worker)`,
      );
    }
  } finally {
    await pool.close();
  }
  if (mismatches > 0 || errors > 0) {
    console.log(`\n  ❌ ${mismatches} games diverged, ${errors} games threw\n`);
    process.exit(1);
  }
  console.log(`\n  ✅ every game bit-identical (parallel == single-threaded)\n`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
