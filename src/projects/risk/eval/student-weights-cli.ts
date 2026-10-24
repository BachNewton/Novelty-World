import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATE_WIDTH } from "../bots/student-v1/candidates";
import { GOLDEN_TOLERANCE, scorer, type StudentWeights } from "../bots/student-v1/network";

/** `npm run risk:student-weights` — turns a student the trainer exported
 *  (`bots/rule-v8/train/distill.py --export <file>`) into a committed weight set of student-v1
 *  (`ideas/student-v1.md`), as rule-v8's trainer writes v8's weights: a TypeScript module
 *  (`bots/student-v1/weights/<name>.ts`), never edited by hand, and the export's golden decisions
 *  (each one's raw candidate rows and the trained network's scores) as the forward pass's test
 *  fixture (`bots/student-v1/__fixtures__/golden-<name>.json`). It rewrites the weight sets'
 *  index (`weights/index.ts`) from the folder, so a set is seated as
 *  `student-v1~{"weights":"<name>"}`, and checks the bot's own forward pass against the golden
 *  scores before it writes anything.
 *
 *  Usage:
 *    npm run risk:student-weights -- src/projects/risk/eval/positions/students/pilot.json --name pilot
 *
 *  The name defaults to the file's, lower-cased: letters, digits and dashes. */

const STUDENT = fileURLToPath(new URL("../bots/student-v1/", import.meta.url));
const WEIGHTS = path.join(STUDENT, "weights");
const FIXTURES = path.join(STUDENT, "__fixtures__");

/** The trainer's export (`export` in `distill.py`). */
interface Exported {
  version: number;
  features: StudentWeights["features"];
  inputs: StudentWeights["inputs"];
  perBoard: number;
  mu: number[];
  sd: number[];
  layers: { w: number[][]; b: number[] }[];
  golden: { rows: number[][]; scores: number[] }[];
}

/** A golden decision as the fixture keeps it: its rows as little-endian float32 in base64 (the
 *  trainer's rows are float32, so nothing is lost), and the trained network's scores. */
interface GoldenDecision {
  rows: string;
  scores: number[];
}

const base64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

function weightsOf(e: Exported): StudentWeights {
  if (e.version !== 1) throw new Error(`an export of version ${String(e.version)}, not 1`);
  if (!["all", "breakdown"].includes(e.features)) throw new Error(`unknown features "${e.features}"`);
  if (!["absolute", "relative", "both"].includes(e.inputs)) throw new Error(`unknown inputs "${e.inputs}"`);
  const dims = [e.layers[0].w[0].length, ...e.layers.map((l) => l.w.length)];
  return {
    features: e.features,
    inputs: e.inputs,
    perBoard: e.perBoard,
    mu: e.mu,
    sd: e.sd,
    dims,
    layers: e.layers.map((l, i) => {
      if (l.w.some((row) => row.length !== dims[i]) || l.b.length !== dims[i + 1]) throw new Error(`layer ${i.toString()} isn't rectangular`);
      return { weights: base64(Float32Array.from(l.w.flat())), biases: base64(Float32Array.from(l.b)) };
    }),
  };
}

const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function parseArgs(argv: readonly string[]): { file: string; name: string } {
  let file: string | undefined;
  let name: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name") name = argv[++i];
    else if (file === undefined) file = argv[i];
    else throw new Error(`unknown argument "${argv[i]}". Example: npm run risk:student-weights -- students/pilot.json --name pilot`);
  }
  if (file === undefined) throw new Error("name the trainer's export. Example: npm run risk:student-weights -- students/pilot.json --name pilot");
  name ??= path.basename(file, ".json").toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(name) || name === "index") throw new Error(`a weight set's name is letters, digits and dashes, not "${name}"`);
  return { file, name };
}

function main(): void {
  const { file, name } = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the export the run is given
  const exported = JSON.parse(fs.readFileSync(file, "utf8")) as Exported;
  const weights = weightsOf(exported);
  const score = scorer(weights);

  const golden: GoldenDecision[] = exported.golden.map((g) => {
    if (g.rows.some((r) => r.length !== CANDIDATE_WIDTH)) throw new Error(`a golden row isn't ${CANDIDATE_WIDTH.toString()} wide`);
    return { rows: base64(Float32Array.from(g.rows.flat())), scores: g.scores };
  });
  if (golden.length === 0) throw new Error("the export has no golden decisions to test the forward pass on");
  let worst = 0;
  for (const g of exported.golden) {
    score(Float32Array.from(g.rows.flat())).forEach((s, i) => (worst = Math.max(worst, Math.abs(s - g.scores[i]))));
  }
  if (!(worst <= GOLDEN_TOLERANCE)) throw new Error(`the bot's forward pass is ${worst.toString()} from the trainer's scores, past ${GOLDEN_TOLERANCE.toString()}`);

  const source = [
    "// A student-v1 weight set, written by `npm run risk:student-weights` from the trainer's export",
    `// (\`bots/rule-v8/train/distill.py --export\`, here ${path.basename(file)}); never edited by hand.`,
    "",
    'import type { StudentWeights } from "../network";',
    "",
    "export const WEIGHTS: StudentWeights = {",
    `  features: ${JSON.stringify(weights.features)},`,
    `  inputs: ${JSON.stringify(weights.inputs)},`,
    `  perBoard: ${weights.perBoard.toString()},`,
    `  mu: ${JSON.stringify(weights.mu)},`,
    `  sd: ${JSON.stringify(weights.sd)},`,
    `  dims: ${JSON.stringify(weights.dims)},`,
    "  layers: [",
    ...weights.layers.map((l) => `    { weights: "${l.weights}", biases: "${l.biases}" },`),
    "  ],",
    "};",
    "",
  ].join("\n");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the weight sets' own folder
  fs.mkdirSync(WEIGHTS, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the named set's module in the weight sets' folder
  fs.writeFileSync(path.join(WEIGHTS, `${name}.ts`), source);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the student's fixtures folder
  fs.mkdirSync(FIXTURES, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the named set's fixture in the student's fixtures folder
  fs.writeFileSync(path.join(FIXTURES, `golden-${name}.json`), `${JSON.stringify(golden, null, 2)}\n`);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the weight sets' own folder
  const sets = fs.readdirSync(WEIGHTS).filter((f) => f.endsWith(".ts") && f !== "index.ts").map((f) => f.slice(0, -3)).sort();
  const index = [
    "// Every student-v1 weight set, by name: rewritten by `npm run risk:student-weights`; never edited by hand.",
    "",
    'import type { StudentWeights } from "../network";',
    ...sets.map((s) => `import { WEIGHTS as ${camel(s)} } from "./${s}";`),
    "",
    "export const WEIGHT_SETS: Readonly<Record<string, StudentWeights>> = {",
    ...sets.map((s) => `  ${JSON.stringify(s)}: ${camel(s)},`),
    "};",
    "",
  ].join("\n");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the weight sets' index in their own folder
  fs.writeFileSync(path.join(WEIGHTS, "index.ts"), index);
  console.log(`weight set "${name}": ${weights.dims.join(" → ")}, ${weights.features} features, ${weights.inputs} inputs; ${golden.length.toString()} golden decisions within ${worst.toExponential(2)}`);
}

main();
