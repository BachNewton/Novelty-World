import process from "node:process";
import { checkRecord, readRecords } from "./gpu-record";

/** `npm run risk:gpu-check` — replays game-record files (`ideas/gpu-engine.md`) on the reference
 *  engine: every move legal, every options and state hash equal, every result the same. Exits
 *  non-zero on any failure, naming each failing game's first failing decision.
 *
 *  Usage:
 *    npm run risk:gpu-check -- src/projects/risk/gpu/fixtures/*.jsonl.gz */

function main(): void {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("name the game-record files to check");
  let games = 0;
  let moves = 0;
  const failures: string[] = [];
  for (const file of files) {
    for (const record of readRecords(file)) {
      const result = checkRecord(record);
      games++;
      moves += result.decisions;
      if (result.failure) failures.push(`${file}: ${record.seed} decision ${result.failure.decision.toString()}: ${result.failure.message}`);
    }
  }
  console.log(`${files.length.toString()} files, ${games.toString()} games, ${moves.toString()} moves checked, ${failures.length.toString()} failing`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}

main();
