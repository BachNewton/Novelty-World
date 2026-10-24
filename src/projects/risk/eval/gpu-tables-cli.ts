import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { number } from "./cli-args";
import { blitzFiles, blitzSamples, blitzTables, boardJson, oddsSamples } from "./gpu-tables";

/** `npm run risk:gpu-tables` — exports what the GPU engine reads (`ideas/gpu-engine.md`):
 *  `board.json`, and the blitz tables for every fight up to the bound as `blitz-<bound>.bin` with
 *  its meta `blitz-<bound>.json`, and `blitz-<bound>-samples.json`, reference blitzes to check a
 *  reading of the tables against. With `--odds-samples` it writes only `odds-samples.json`, the
 *  goldens for the Python port of the odds (`oddsSamples`).
 *
 *  Usage:
 *    npm run risk:gpu-tables -- --bound 32
 *    npm run risk:gpu-tables -- --bound 256 --out some/dir
 *    npm run risk:gpu-tables -- --odds-samples
 *
 *  Defaults: bound 32, written to `gpu/data/`. Only the bound of 32 is committed. */

const DATA_DIR = fileURLToPath(new URL("../gpu/data/", import.meta.url));
const SAMPLES = 2000;

function parseArgs(argv: readonly string[]): { bound: number; out: string; oddsSamples: boolean } {
  const a = { bound: 32, out: DATA_DIR, oddsSamples: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--odds-samples":
        a.oddsSamples = true;
        break;
      case "--bound":
        a.bound = number(argv[++i], "--bound");
        break;
      case "--out":
        a.out = argv[++i];
        break;
      default:
        throw new Error(`unknown flag "${argv[i]}". Example: npm run risk:gpu-tables -- --bound 32`);
    }
  }
  return a;
}

function main(): void {
  const { bound, out, oddsSamples: odds } = parseArgs(process.argv.slice(2));
  /* eslint-disable security/detect-non-literal-fs-filename -- the directory the run is told to write to */
  mkdirSync(out, { recursive: true });
  if (odds) {
    writeFileSync(path.join(out, "odds-samples.json"), `${JSON.stringify(oddsSamples())}\n`);
    console.log(`odds-samples.json in ${out}`);
    return;
  }
  writeFileSync(path.join(out, "board.json"), boardJson());
  const started = performance.now();
  const tables = blitzTables(bound);
  const built = performance.now();
  const { bin, meta } = blitzFiles(tables);
  const name = `blitz-${bound.toString()}`;
  writeFileSync(path.join(out, `${name}.bin`), bin);
  const sha256 = createHash("sha256").update(bin).digest("hex");
  writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify({ ...(meta as object), bytes: bin.length, sha256 }, null, 1)}\n`);
  writeFileSync(path.join(out, `${name}-samples.json`), `${JSON.stringify(blitzSamples(bound, SAMPLES))}\n`);
  /* eslint-enable security/detect-non-literal-fs-filename -- the writes are all above */
  const done = performance.now();
  console.log(
    `board.json and ${name}.bin (${bin.length.toString()} bytes) in ${out}: tables built in ${((built - started) / 1000).toFixed(1)}s, ${((done - started) / 1000).toFixed(1)}s in all`,
  );
}

main();
