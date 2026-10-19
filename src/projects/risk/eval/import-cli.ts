import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { mergeLadderCache } from "./ratings-cache";

/** `npm run risk:import` — brings a remote run's results (the `risk-results` artifact
 *  of the GitHub Actions workflow, downloaded) into this checkout: its run-log record
 *  onto `runs.jsonl`, the ladder matchups it played into `ratings-cache.json`, and, for a
 *  `--seatable` ratings run, `bots/ratings.json`. Prints the run's report.
 *
 *  Usage:
 *    gh run download <run id> --name risk-results --dir results
 *    npm run risk:import -- results */

const EVAL = fileURLToPath(new URL("./", import.meta.url));

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("Example: npm run risk:import -- results");
  const dir = args[0];
  const from = (file: string) => path.join(dir, file);
  /* eslint-disable security/detect-non-literal-fs-filename -- the artifact directory the owner names, and this project's own files */
  const summary = readFileSync(from("summary.txt"), "utf8");
  appendFileSync(path.join(EVAL, "runs.jsonl"), readFileSync(from("runs.jsonl"), "utf8"));
  const merged = existsSync(from("ratings-cache.json")) ? mergeLadderCache(from("ratings-cache.json")) : 0;
  const seatable = existsSync(from("ratings.json"));
  if (seatable) copyFileSync(from("ratings.json"), path.join(EVAL, "../bots/ratings.json"));
  /* eslint-enable security/detect-non-literal-fs-filename -- the files above are all */
  console.log(summary);
  console.log(`  Imported the run-log record and ${merged.toString()} ladder matchups${seatable ? ", and the seatable bots' Elo" : ""}.`);
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
