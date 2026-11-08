import { isDeepStrictEqual } from "node:util";
import process from "node:process";
import { riskBot } from "../../bots";
import { playGame, playGameAsync, type AsyncBot } from "../runner";
import { nativeBot } from "./bot";

/** `npx tsx src/projects/risk/eval/native/seat-check-cli.ts` — checks the mixed-table seam (`ideas/native-port.md`, "How a Rust
 *  bot is measured"): a native seat among TypeScript bots, its decisions asked of the crate's
 *  `bots-serve` over a pipe. greedy and GD's personas are exact on both sides, so a game with one
 *  of them native must be the all-TypeScript game move for move. Run it after changing the pipe
 *  (`eval/native/`, the crate's `bots-serve`) or the contract's shapes. It needs the crate's
 *  release build, and fails loudly naming the build command when that is missing or stale.
 *  Exits non-zero on any game that differs. */

const LABELS = ["greedy", "gd-aggressive"];

async function check(label: string): Promise<string | null> {
  const seed = `native-seat-${label}`;
  const typescript = playGame({ seed, bots: [riskBot("greedy"), riskBot(label), riskBot("gd-stacker")], maxTurns: 600 });
  const native = nativeBot(label);
  let asked = 0;
  const counted: AsyncBot = (input) => {
    asked++;
    return native(input);
  };
  const mixed = await playGameAsync({ seed, bots: [riskBot("greedy"), counted, riskBot("gd-stacker")], maxTurns: 600 });
  if (asked <= 50) return `${label}: the native seat was asked only ${asked.toString()} decisions`;
  if (!isDeepStrictEqual(mixed, typescript)) return `${label}: the game with a native seat differs from the all-TypeScript game`;
  console.log(`  ✓ ${label}: ${asked.toString()} native decisions, the same game`);
  return null;
}

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const label of LABELS) {
    const failure = await check(label);
    if (failure !== null) failures.push(failure);
  }
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
