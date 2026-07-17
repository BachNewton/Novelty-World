import process from "node:process";
import { pairingSpecs, WorkerPool } from "./parallel";
import { runHeadToHead } from "./tournament";
import { versionBot } from "./versions";

/** `npm run sim:verify` — prove the parallel worker pool produces BIT-IDENTICAL
 *  results to the single-threaded head-to-head on the same seeds. Games are pure,
 *  deterministic functions of (seed, seating), so worker assignment must never
 *  change an outcome — this is the guard that keeps the fast path trustworthy.
 *
 *  It replays the exact seed+seating scheme of `runHeadToHead` (prefix "vs", the
 *  six 2+2 seatings) through both paths and compares every field of every game.
 *
 *  Usage:
 *    npm run sim:verify -- claude-v2 claude-v1            # 60 games each way (default)
 *    npm run sim:verify -- fable-v2 claude-v2 --seeds 120
 *    npm run sim:verify -- fable-v2 claude-v1 --turns 2000 --workers 14 */

interface Args {
  a: string;
  b: string;
  seeds: number;
  maxTurns: number;
  workers: number;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let seeds = 60;
  let maxTurns = 2000;
  let workers = 0; // 0 → pool default
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seeds") seeds = Number(argv[++i]) || seeds;
    else if (arg === "--turns") maxTurns = Number(argv[++i]) || maxTurns;
    else if (arg === "--workers") workers = Number(argv[++i]) || workers;
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else positional.push(arg);
  }
  if (positional.length !== 2) {
    throw new Error(`need two distinct versions. Example: npm run sim:verify -- v2 v1`);
  }
  return { a: positional[0], b: positional[1], seeds, maxTurns, workers };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.a === args.b) throw new Error("the two versions must be distinct");

  const seeds = Array.from({ length: args.seeds }, (_, i) => `vs-${i + 1}`);
  console.log(
    `\nMonopoly — parallel determinism check\n` +
      `${args.a} vs ${args.b}   ${args.seeds} games   max turns ${args.maxTurns}\n`,
  );

  // Single-threaded reference.
  const single = runHeadToHead({
    a: { label: args.a, bot: versionBot(args.a) },
    b: { label: args.b, bot: versionBot(args.b) },
    seeds,
    maxTurns: args.maxTurns,
  });

  // Parallel — same seed+seating scheme (prefix "vs", index 0..N-1).
  const pool = new WorkerPool(args.workers || undefined);
  let mismatches = 0;
  try {
    const specs = pairingSpecs(args.a, args.b, "vs", 0, args.seeds, args.maxTurns);
    const parallel = await pool.run(specs);
    for (let i = 0; i < args.seeds; i++) {
      const s = single.outcomes[i];
      const p = parallel[i];
      const diffs: string[] = [];
      if (s.winnerLabel !== p.winnerLabel) diffs.push(`winner ${s.winnerLabel}≠${p.winnerLabel}`);
      if (s.terminated !== p.terminated) diffs.push(`terminated ${s.terminated}≠${p.terminated}`);
      if (s.turns !== p.turns) diffs.push(`turns ${s.turns}≠${p.turns}`);
      if (s.trades !== p.trades) diffs.push(`trades ${s.trades}≠${p.trades}`);
      if (s.declines !== p.declines) diffs.push(`declines ${s.declines}≠${p.declines}`);
      if (s.bankruptcies !== p.bankruptcies) diffs.push(`busts ${s.bankruptcies}≠${p.bankruptcies}`);
      if (diffs.length > 0) {
        mismatches++;
        console.log(`  ✗ ${p.seed}: ${diffs.join(", ")}`);
      }
    }
  } finally {
    await pool.close();
  }

  if (mismatches === 0) {
    console.log(`  ✅ all ${args.seeds} games bit-identical (parallel == single-threaded)\n`);
  } else {
    console.log(`\n  ❌ ${mismatches}/${args.seeds} games diverged — parallelism is NOT deterministic\n`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
