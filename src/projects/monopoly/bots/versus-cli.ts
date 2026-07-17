import process from "node:process";
import type { Contender } from "./simulate";
import { formatHeadToHead, runHeadToHead, type GameOutcome } from "./tournament";
import { versionBot } from "./versions";

/** `npm run sim:versus` — play two bot VERSIONS head-to-head across many seeds
 *  and print the win share, the measurement half of the evolution loop (see
 *  EVOLUTION.md). Deterministic by seed: same args reproduce the same table.
 *
 *  Usage:
 *    npm run sim:versus -- claude-v2 claude-v1            # candidate vs baseline
 *    npm run sim:versus -- claude-v2 claude-v1 --seeds 100   # 100 games (default 50)
 *    npm run sim:versus -- claude-v2 claude-v1 --prefix holdout  # seeds "holdout-1"...
 *    npm run sim:versus -- claude-v2 claude-v1 --turns 1500  # lower per-game turn cap
 *    npm run sim:versus -- claude-v2 claude-v1 --log         # per-game table too
 *
 *  Known versions live in `versions/index.ts`. The two positional args are the
 *  candidate (A) and the baseline (B). **`dumb` is NEVER a valid opponent here**
 *  (rejected below, exactly as the gauntlet rejects it): it is a null/reactive
 *  stub, not a strategy — it initiates nothing, so "beating dumb" measures
 *  nothing about strength. The floor of the real field is `claude-v2` (`claude-v1` is
 *  archived but excluded by default — its bad logic stalls games). `sim:gauntlet`
 *  and `sim:ratings` both hard-reject it for the same reason. */

interface Args {
  aLabel: string;
  bLabel: string;
  seeds: number;
  prefix: string;
  maxTurns: number;
  log: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let seeds = 50;
  let prefix = "vs";
  let maxTurns = 2000;
  let log = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seeds") {
      const n = Number(argv[i + 1]);
      if (!Number.isNaN(n)) seeds = n;
      i += 1;
    } else if (arg === "--prefix") {
      if (i + 1 < argv.length) prefix = argv[i + 1];
      i += 1;
    } else if (arg === "--turns") {
      const n = Number(argv[i + 1]);
      if (!Number.isNaN(n)) maxTurns = n;
      i += 1;
    } else if (arg === "--log") {
      log = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag "${arg}"`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 2) {
    throw new Error(
      `need exactly two versions to pit (got ${positional.length}). ` +
        `Example: npm run sim:versus -- v2 v1`,
    );
  }
  // `dumb` is a null stub, not a strategy — never an evaluation opponent (the
  // gauntlet hard-rejects it too). Measuring against it tells you nothing; the
  // real field's floor is claude-v2.
  for (const label of positional) {
    if (label === "dumb") {
      throw new Error(
        "`dumb` is a null stub and must not be used to evaluate bots — pit two " +
          "real versions (the field floor is v2). See EVOLUTION.md.",
      );
    }
  }
  return { aLabel: positional[0], bLabel: positional[1], seeds, prefix, maxTurns, log };
}

function renderOutcome(o: GameOutcome): string {
  const seed = o.seed.padEnd(12);
  if (o.error !== undefined) return `  ${seed} [${o.seating.join(",")}] → ⚠ ERROR: ${o.error}`;
  const result = o.winnerLabel === null ? "CAP (draw)" : `${o.winnerLabel} wins`;
  return (
    `  ${seed} [${o.seating.join(",")}] → ${result.padEnd(11)} ` +
    `turns=${o.turns} trades=${o.trades} busts=${o.bankruptcies}`
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  // Resolve labels to policies; a typo fails loud here with the known set listed.
  // Self-play (same version both sides) is a valid sanity check — the harness
  // needs distinct labels to tally wins, so suffix them while fielding one bot.
  const selfPlay = args.aLabel === args.bLabel;
  const a: Contender = {
    label: selfPlay ? `${args.aLabel}#1` : args.aLabel,
    bot: versionBot(args.aLabel),
  };
  const b: Contender = {
    label: selfPlay ? `${args.bLabel}#2` : args.bLabel,
    bot: versionBot(args.bLabel),
  };
  const seeds = Array.from({ length: args.seeds }, (_, i) => `${args.prefix}-${i + 1}`);

  console.log(
    `\nMonopoly — head-to-head A/B\n` +
      `Candidate: ${args.aLabel}   Baseline: ${args.bLabel}   ` +
      `Seeds: "${args.prefix}-1".."${args.prefix}-${args.seeds}"   Max turns: ${args.maxTurns}\n`,
  );

  const result = runHeadToHead({ a, b, seeds, maxTurns: args.maxTurns });

  if (args.log) {
    for (const o of result.outcomes) console.log(renderOutcome(o));
    console.log("");
  }
  console.log(formatHeadToHead(result));
  console.log("");
}

main();
