import process from "node:process";
import { checkRecord, readRecords } from "./gpu-record";

/** `npm run risk:gpu-check` (and `risk:native-check`, the same tool) — replays game-record files
 *  (`ideas/gpu-engine.md`) on the reference engine: every move legal, every options and state hash
 *  equal, every result the same. With `--bots`, the TypeScript bot each record's `bots` names for
 *  a seat is also asked at every decision, on the exact input the runner builds, and its move must
 *  be the recorded one: the check of a game another engine's bots played (`ideas/native-port.md`).
 *  Exits non-zero on any failure, naming each failing game's first failing decision.
 *
 *  Usage:
 *    npm run risk:gpu-check -- src/projects/risk/gpu/fixtures/*.jsonl.gz
 *    npm run risk:native-check -- games-from-rust.jsonl.gz --bots */

function parseArgs(argv: readonly string[]): { files: string[]; bots: boolean } {
  const files: string[] = [];
  let bots = false;
  for (const arg of argv) {
    if (arg === "--bots") bots = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}". Example: npm run risk:gpu-check -- greedy-4p.jsonl.gz --bots`);
    else files.push(arg);
  }
  if (files.length === 0) throw new Error("name the game-record files to check. Example: npm run risk:gpu-check -- greedy-4p.jsonl.gz --bots");
  return { files, bots };
}

function main(): void {
  const { files, bots } = parseArgs(process.argv.slice(2));
  let games = 0;
  let moves = 0;
  const failures: string[] = [];
  for (const file of files) {
    readRecords(file).forEach((record, index) => {
      const result = checkRecord(record, { bots });
      games++;
      moves += result.decisions;
      if (result.failure) {
        const at = result.failure.decision >= 0 ? `decision ${result.failure.decision.toString()}` : "the game as a whole";
        failures.push(`${file}, game ${index.toString()} (seed "${record.seed}", [${(record.bots ?? []).join(",")}]), ${at}: ${result.failure.message}`);
      }
    });
  }
  console.log(
    `${files.length.toString()} files, ${games.toString()} games, ${moves.toString()} moves checked${bots ? ", every bot's move compared" : ""}, ${failures.length.toString()} failing`,
  );
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}

main();
