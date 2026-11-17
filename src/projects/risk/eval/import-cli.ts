import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { importGauntlets, readGauntlets } from "./gauntlet-log";
import { keepProvisional, type RatingsFile } from "./provisional";
import { mergeLadderCache } from "./ratings-cache";

/** `npm run risk:import` — brings a remote run's results (the `risk-results` artifact
 *  of the GitHub Actions workflow, downloaded) into this checkout: its run-log record
 *  onto `runs.jsonl`, a gauntlet's result onto `gauntlets.jsonl`, the ladder matchups it
 *  played into `ratings-cache.json`, and, for a `--seatable` ratings run, `bots/ratings.json`,
 *  where a bot seated provisionally since the run began keeps its entry, read on the new
 *  ladder's scale. Prints the run's report.
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
  const gauntlets = existsSync(from("gauntlets.jsonl")) ? importGauntlets(from("gauntlets.jsonl")) : 0;
  const seatable = existsSync(from("ratings.json"));
  if (seatable) {
    const ratings = path.join(EVAL, "../bots/ratings.json");
    const was = JSON.parse(readFileSync(ratings, "utf8")) as RatingsFile;
    const now = JSON.parse(readFileSync(from("ratings.json"), "utf8")) as RatingsFile;
    writeFileSync(ratings, `${JSON.stringify(keepProvisional(was, now, readGauntlets()), null, 2)}\n`);
  }
  /* eslint-enable security/detect-non-literal-fs-filename -- the files above are all */
  console.log(summary);
  console.log(
    `  Imported the run-log record, ${merged.toString()} ladder matchups and ${gauntlets.toString()} gauntlet results${seatable ? ", and the seatable bots' Elo" : ""}.`,
  );
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
