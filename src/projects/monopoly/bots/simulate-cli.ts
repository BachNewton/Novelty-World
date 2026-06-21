import process from "node:process";
import type { BotStrategy } from "../types";
import { formatResult, simulateGame, type SimOptions } from "./simulate";
import { DEFAULT_BOT_VERSION } from "./roles";
import { VERSIONS } from "./versions";
import { renderHighlight } from "./render-log";

/** `npm run sim` — an on-demand script that plays a full, headless Monopoly game
 *  between bots and prints the outcome. No UI, pure CPU, deterministic by seed.
 *  Its job is to let you WATCH how the bots actually behave over a real game (and
 *  surface where the policy can improve), not to assert anything — so it lives
 *  here as a script, not in the test suite.
 *
 *  Usage:
 *    npm run sim                                  # 4 overall-best bots, default seed
 *    npm run sim -- claude-v35 jane-v2 dumb dumb  # custom roster (2, 4, or 8 seats)
 *    npm run sim -- --seed my-seed                # pick the RNG seed
 *    npm run sim -- --turns 4000                  # raise the safety cap
 *    npm run sim -- --log                         # stream the per-decision play-by-play
 *
 *  A seat is `dumb` (the reactive baseline) or any version label in the archive
 *  (`bots/versions/index.ts`, e.g. `claude-v35`, `jane-v2`).
 */

interface Args {
  seed: string;
  strategies: BotStrategy[];
  maxTurns: number;
  log: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const strategies: BotStrategy[] = [];
  let seed = "table-1";
  let maxTurns = 2000;
  let log = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed") {
      if (i + 1 < argv.length) {
        seed = argv[i + 1];
        i += 1;
      }
    } else if (arg === "--turns") {
      if (i + 1 < argv.length) {
        const n = Number(argv[i + 1]);
        if (!Number.isNaN(n)) maxTurns = n;
        i += 1;
      }
    } else if (arg === "--log") {
      log = true;
    } else if (arg === "dumb" || arg in VERSIONS) {
      strategies.push(arg);
    } else {
      throw new Error(
        `unknown argument "${arg}" (expected dumb, a version label like ` +
          `claude-v35, or --seed | --turns | --log)`,
      );
    }
  }

  return {
    seed,
    strategies:
      strategies.length > 0
        ? strategies
        : [
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
          ],
    maxTurns,
    log,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const count = args.strategies.length;
  if (count !== 2 && count !== 4 && count !== 8) {
    console.error(
      `Need 2, 4, or 8 seats (got ${count}). ` +
        `Example: npm run sim -- claude claude claude claude`,
    );
    process.exit(1);
  }

  console.log("\nMonopoly — headless bot self-play");
  console.log(
    `Seats: ${args.strategies.join(", ")}   ` +
      `Seed: "${args.seed}"   Max turns: ${args.maxTurns}\n`,
  );

  const opts: SimOptions = {
    seed: args.seed,
    strategies: args.strategies,
    maxTurns: args.maxTurns,
    includeLog: args.log,
  };
  const result = simulateGame(opts);

  if (args.log) {
    const names = new Map(result.standings.map((s) => [s.id, s.name]));
    const nameOf = (id: string | null): string =>
      id === null ? "the bank" : (names.get(id) ?? id);
    for (const h of result.highlights) console.log(renderHighlight(h, nameOf));
    console.log("");
  }

  console.log(formatResult(result));
  console.log("");
}

main();
