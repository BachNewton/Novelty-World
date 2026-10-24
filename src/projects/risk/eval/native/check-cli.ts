import process from "node:process";
import { checkRecord, Divergence } from "./check";
import { readRecords } from "./record";

/** `npm run risk:native-check` — replay game records on the TypeScript reference engine, every
 *  options hash, move and state hash and the result, and with `--bots` ask each seat's TypeScript
 *  bot every decision and hold its move to the recorded one (`ideas/native-port.md`). Stops at
 *  the first divergence and exits 1.
 *
 *  Usage:
 *    npm run risk:native-check -- src/projects/risk/native/fixtures/records/greedy-4p.jsonl.gz
 *    npm run risk:native-check -- games-from-rust.jsonl.gz --bots */

function parseArgs(argv: readonly string[]): { files: string[]; bots: boolean } {
  const files: string[] = [];
  let bots = false;
  for (const arg of argv) {
    if (arg === "--bots") bots = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else files.push(arg);
  }
  if (files.length === 0) throw new Error("name one or more record files. Example: npm run risk:native-check -- greedy-4p.jsonl.gz --bots");
  return { files, bots };
}

async function main(): Promise<void> {
  const { files, bots } = parseArgs(process.argv.slice(2));
  let games = 0;
  let moves = 0;
  let compared = 0;
  for (const file of files) {
    let index = 0;
    for await (const record of readRecords(file)) {
      try {
        const tally = checkRecord(record, { bots });
        moves += tally.moves;
        compared += tally.compared;
      } catch (e) {
        if (!(e instanceof Divergence)) throw e;
        const at = e.decision >= 0 ? `decision ${e.decision.toString()}` : "the game as a whole";
        console.error(`✗ ${file}, game ${index.toString()} (seed "${record.seed}", [${record.bots.join(",")}]), ${at}:\n  ${e.message}`);
        console.error(`\n${games.toString()} games and ${moves.toString()} moves checked before it, ${compared.toString()} decisions compared, 1 mismatch`);
        process.exit(1);
      }
      games++;
      index++;
    }
  }
  console.log(`✓ ${games.toString()} games, ${moves.toString()} moves checked, ${compared.toString()} decisions compared${bots ? "" : " (no --bots)"}, 0 mismatches`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
