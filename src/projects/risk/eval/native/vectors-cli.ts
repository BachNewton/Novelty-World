import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { blitzVectors, cardsVectors, jsmathVectors, mapVectors, oddsVectors, rngVectors } from "./vectors";

/** `npm run risk:native-vectors` — writes what the TypeScript computes for the RNG, JavaScript's
 *  math, the map, the cards, the blitz and the rule bots' odds to the Rust crate's
 *  `native/fixtures/vectors/`, where its tests compare its own results bit for bit
 *  (`ideas/native-port.md`, "Proving it").
 *
 *  It runs only on Risk's own Node pin (`eval/node-version`): V8's `Math.pow` changed between
 *  Node 22 and 24, so vectors from another version describe another game. Where the shell's Node
 *  is another, run it as `mise exec node@<pin> -- npm run risk:native-vectors`. */

const OUT = fileURLToPath(new URL("../../native/fixtures/vectors/", import.meta.url));

const NODE_PIN = fileURLToPath(new URL("../node-version", import.meta.url));

const FILES: [name: string, build: () => unknown][] = [
  ["rng.json", rngVectors],
  ["jsmath.json", jsmathVectors],
  ["map.json", mapVectors],
  ["cards.json", cardsVectors],
  ["blitz.json", blitzVectors],
  ["odds.json", oddsVectors],
];

function main(): void {
  /* eslint-disable security/detect-non-literal-fs-filename -- fixed paths in this repo: Risk's Node pin and the crate's fixtures */
  const pin = readFileSync(NODE_PIN, "utf8").trim();
  if (process.versions.node !== pin) {
    throw new Error(
      `this is Node ${process.versions.node}, and Risk's games are played on Node ${pin} (eval/node-version): run \`mise exec node@${pin} -- npm run risk:native-vectors\``,
    );
  }
  mkdirSync(OUT, { recursive: true });
  for (const [name, build] of FILES) {
    const started = performance.now();
    const json = `${JSON.stringify(build())}\n`;
    writeFileSync(path.join(OUT, name), json);
    console.log(`${name}: ${(json.length / 1024).toFixed(0)} KB in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  }
  /* eslint-enable security/detect-non-literal-fs-filename -- the reads and writes are all above */
}

main();
