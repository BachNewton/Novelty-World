import process from "node:process";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import { checkBots, commonDefaults, commonFlag, number, riskRun } from "./cli-args";
import { checkNative, nativeName } from "./native/bot";
import { checkParity, nativeRunner } from "./native/runner";
import { riskPool, tableSpecs } from "./parallel";
import { runSpec, runSpecAsync, type RiskGameResult, type RiskGameSpec } from "./runner";

/** `npm run risk:verify` — prove the worker pool gives BIT-IDENTICAL games to the
 *  single-threaded runner on the same specs, and measure the engine's throughput
 *  in the harness while at it: games per second on one core and on the pool, and
 *  the mean length of a game.
 *
 *  With `--native`, the games are played wholly in the crate instead of on the pool, and held
 *  to the TypeScript runner's (every seat its TypeScript bot): the whole-game exactness of bots
 *  ported exactly, and the native engine's throughput beside the TypeScript's on one core.
 *
 *  Usage:
 *    npm run risk:verify -- greedy random                  # one-in both ways, 3/4/6 players
 *    npm run risk:verify -- greedy                         # every seat the same bot
 *    npm run risk:verify -- greedy random --players 6 --groups 40 --workers 14
 *    npm run risk:verify -- gd-stacker@native greedy       # a native seat at TypeScript tables
 *    npm run risk:verify -- greedy gd-stacker --native     # the crate's games == TypeScript's */

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
  if (a.common.parity !== 0) throw new Error("--parity has no place here: risk:verify -- --native checks every game");
  if (a.common.native) {
    checkNative(a.labels);
    checkParity(a.labels);
  }
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
  const live = riskRun({
    tool: "risk:verify",
    bots: args.labels,
    tables: args.common.players.map((n) => `${n.toString()}p`),
    seeds: args.common.prefix,
    workers: args.common.workers,
  });
  const { native } = args.common;
  // The reference: TypeScript on this thread. With --native every seat is its TypeScript bot,
  // named as the crate names it; otherwise native seats are asked of the crate as on the pool.
  const inline = live.watch(
    native
      ? inlineRunner((spec: RiskGameSpec) => ({ ...runSpec({ ...spec, labels: spec.labels.map(nativeName) }), labels: spec.labels }))
      : inlineRunner(runSpecAsync),
    (r) => r.decisions,
  );
  const pool = live.watch(native ? nativeRunner(args.common.workers) : riskPool(args.common.workers), (r) => r.decisions);
  const paths = native ? { title: "native exactness and throughput", other: "native", same: "native == TypeScript" } : { title: "parallel determinism and throughput", other: "pool", same: "parallel == single-threaded" };
  // Every table's games play twice, once on each path, after a warm-up of each.
  const warmUp = [specsFor({ ...args, groups: 1 }, 4), specsFor({ ...args, groups: pool.size }, 4)];
  const totalGames =
    warmUp[0].length + warmUp[1].length + args.common.players.reduce((s, n) => s + 2 * specsFor(args, n).length, 0);
  live.setProgress(() => live.counts().games / totalGames);
  let mismatches = 0;
  let errors = 0;
  console.log(
    `
Risk — ${paths.title}
` +
      `Bots: ${args.labels.join(" vs ")}   ${args.groups} seed groups per table   Workers: ${pool.size}   Max turns: ${args.common.maxTurns}
`,
  );
  try {
    // Warm both paths up (the first games pay for loading and compiling the engine)
    // so the timings below measure play, not start-up.
    await inline.run(warmUp[0]);
    await pool.run(warmUp[1]);

    for (const [step, players] of args.common.players.entries()) {
      const specs = specsFor(args, players);
      const table = { table: `${players.toString()}p`, games: specs.length };
      live.step(step, { ...table, done: false });
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
      live.step(step, { ...table, check: diverged.length === 0 && played.length === single.length, done: true });

      console.log(
        `  ${players}p  ${specs.length} games  ${diverged.length === 0 ? "bit-identical ✓" : `${diverged.length} diverged ✗`}` +
          `   turns/game ${mean(played.map((r) => r.turns)).toFixed(1)}   moves/game ${(decisions / Math.max(1, played.length)).toFixed(0)}` +
          `   capped ${caps}
` +
          `       one core: ${(specs.length / singleSecs).toFixed(1)} games/s (${((decisions / singleSecs) / 1000).toFixed(1)}k moves/s)` +
          `   ${paths.other}: ${(specs.length / poolSecs).toFixed(1)} games/s (${(specs.length / poolSecs / pool.size).toFixed(1)} per worker)`,
      );
    }
  } catch (e) {
    await live.fail(e);
    throw e;
  } finally {
    await pool.close();
  }
  console.log(`
${formatRunRecord(await live.finish({ errors }))}`);
  if (mismatches > 0 || errors > 0) {
    console.log(`
  ❌ ${mismatches} games diverged, ${errors} games threw
`);
    process.exit(1);
  }
  console.log(`
  ✅ every game bit-identical (${paths.same})
`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
