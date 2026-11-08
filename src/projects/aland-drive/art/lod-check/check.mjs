// Every kit's models, near and far, drawn as the game draws them on WebGPU in headless full Chromium, and compared at
// the swap (`page.ts`): a far version that changes shape or colour from its near version is noticed when it swaps.
//
//   npm run slot -- e2e -- node src/projects/aland-drive/art/lod-check/check.mjs [--out=<folder>] [--write] [--pictures-only] [--only=<kit: model> ...] [--picture=<kit: model>@<azimuth>,<elevation>[,<swap m>] ...] [--score=<kit: model>@<swap m|built>,... ...]
//
// It finds the kits by their catalogues, needs no dev server and no tiles, and never touches a browser of the owner's.
// A change is noticed where its outline moves, or its look changes by FLIP on the whole or at its worst spot, more
// than `NOTICED` allows. Each model is given the nearest swap at which its change isn't noticed, which --write puts in
// swaps.json for the game to swap it at, and the run fails while swaps.json disagrees with what's measured. A model no
// swap up to most of its reach hides has a far version that has to be remade: the run fails on one unless it's in
// known-lod.json, which may only get better. It prints what each moved swap costs, and ranks every swap by its cost.
// Every model's scores go to results.json in --out, and --picture saves that model's two versions from that view side
// by side. --score prints a model's scores at the swaps given (`built` for its own), which is how `NOTICED` is
// calibrated. --only measures just the models named, to see one remade, and --write with it rewrites only their rows.

/* eslint-disable security/detect-non-literal-fs-filename -- a developer tool, reading the kits beside it and writing to the folder named on its own command line */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { requireSlot } from "../../../../../scripts/machine-budget.mjs";

// Four pages on the GPU at once, as many as an e2e run's slot holds.
requireSlot("The LOD check");

const here = dirname(fileURLToPath(import.meta.url));
const art = resolve(here, "..");
const flags = process.argv.slice(2);
const OUT = resolve(flags.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "lod-check");
const pictures = flags.filter((arg) => arg.startsWith("--picture=")).map((arg) => arg.slice(10));
const only = flags.filter((arg) => arg.startsWith("--only=")).map((arg) => arg.slice(7));
const scores = flags.filter((arg) => arg.startsWith("--score=")).flatMap((arg) => {
  const [name, swaps] = arg.slice(8).split("@");
  return swaps.split(",").map((swap) => ({ name, swap: swap === "built" ? undefined : Number(swap) }));
});
mkdirSync(OUT, { recursive: true });

const kits = readdirSync(art, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(art, entry.name, "catalogue.ts")))
  .map((entry) => entry.name);
const entry = join(OUT, ".entry.ts");
writeFileSync(
  entry,
  [
    `import { checkAll, pictureOf, scoreOf } from ${JSON.stringify(join(here, "page.ts").replaceAll("\\", "/"))};`,
    ...kits.map((kit, index) => `import * as kit${index} from ${JSON.stringify(join(art, kit, "catalogue.ts").replaceAll("\\", "/"))};`),
    `const catalogues = { ${kits.map((kit, index) => `${JSON.stringify(kit)}: kit${index}`).join(", ")} };`,
    `Object.assign(window, { __lod: { ready: true, checkAll: (part, parts, written, only) => checkAll(catalogues, part, parts, written, only), pictureOf: (name, azimuth, elevation, swap) => pictureOf(catalogues, name, azimuth, elevation, swap), scoreOf: (name, swap) => scoreOf(catalogues, name, swap) } });`,
  ].join("\n"),
);
await build({ entryPoints: [entry], bundle: true, format: "esm", target: "esnext", outfile: join(OUT, ".page.js"), tsconfig: join(art, "../../../../tsconfig.json"), logLevel: "error" });
const sheets = [join(art, "../../../app/globals.css"), ...kits.map((kit) => join(art, kit, "tokens.css")).filter((sheet) => existsSync(sheet))];
const tokens = sheets.flatMap((sheet) => [...readFileSync(sheet, "utf8").matchAll(/--[\w-]+:\s*[^;]+;/g)].map((match) => match[0])).join("\n");
const pagePath = join(OUT, ".page.html");
writeFileSync(pagePath, `<!doctype html><style>:root{${tokens}}</style><script type="module" src="./.page.js"></script>`);

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--allow-file-access-from-files"] });
const problems = [];
// FLIP and the outlines are measured on the page's own thread, so the models are shared among pages, each in a context
// of its own and so a process of its own.
const PAGES = 4;
const pages = await Promise.all(
  Array.from({ length: PAGES }, async () => {
    const opened = await (await browser.newContext()).newPage();
    opened.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    opened.on("pageerror", (error) => problems.push(error.stack ?? error.message));
    await opened.goto(pathToFileURL(pagePath).href);
    await opened.waitForFunction(() => window.__lod?.ready === true, null, { timeout: 180000 });
    return opened;
  }),
).catch(async (error) => {
  console.log(`no page: ${error.message}\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
  await browser.close();
  process.exit(1);
});
const [page] = pages;

// Each run draws the same pixels on one GPU, but a little slack keeps another GPU's from failing what was written down.
const SLACK = { deviation: 0.5, look: 0.01, spot: 0.01 };
/** How far a written swap may stand from the one measured, as a ratio: another GPU may land a step either side. */
const SWAP_SLACK = 1.16;
const knownPath = join(here, "known-lod.json");
const swapsPath = join(here, "swaps.json");
const known = JSON.parse(readFileSync(knownPath, "utf8"));
const written = JSON.parse(readFileSync(swapsPath, "utf8"));
const checking = !flags.includes("--pictures-only");
const results = checking ? (await Promise.all(pages.map((each, part) => each.evaluate(({ part, parts, written, only }) => window.__lod.checkAll(part, parts, written, only), { part, parts: PAGES, written, only })))).flat() : [];
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
const unhidden = results.filter(({ hidden }) => !hidden);
const failures = [];
for (const result of unhidden) {
  const { name, deviation, look, spot, deviationView, lookView, spotView, swapM } = result;
  const was = known[name];
  const where = `even at a swap of ${swapM} m the outline moves ${deviation} px (most from ${deviationView}) and FLIP reads ${look} (most from ${lookView}), ${spot} at its worst spot (from ${spotView}): its far version has to match`;
  if (was === undefined) failures.push(`${name}: its far version changes at any swap: ${where}`);
  else if (deviation > was.deviation + SLACK.deviation || look > was.look + SLACK.look || spot > was.spot + SLACK.spot) failures.push(`${name}: changes more than it did: ${where}`);
}
for (const name of Object.keys(known).filter((listed) => (only.length === 0 || only.includes(listed)) && !unhidden.some((result) => result.name === listed))) failures.push(`${name}: a swap now hides its change, so it comes off known-lod.json (--write)`);
for (const { name, fingerprint, swapM } of results) {
  const entry = written[fingerprint];
  if (entry === undefined) failures.push(`${name}: its art isn't in swaps.json, so the game swaps it where its kit says rather than at ${swapM} m (--write)`);
  else if (Math.max(entry.swapM / swapM, swapM / entry.swapM) > SWAP_SLACK) failures.push(`${name}: swaps.json has ${entry.swapM} m, measured ${swapM} m (--write)`);
}
const checked = new Set(results.map(({ fingerprint }) => fingerprint));
const stale = Object.entries(written).filter(([fingerprint]) => !checked.has(fingerprint));
if (checking && only.length === 0 && stale.length > 0) failures.push(`swaps.json holds ${stale.length} art no kit draws any more (${stale.map(([, { name }]) => name).join(", ")}) (--write)`);
if (flags.includes("--write")) {
  // With --only, the models named are written over what the table held for them, and the rest stands as it was.
  const kept = (name) => only.length > 0 && !only.includes(name);
  const knownNow = { ...Object.fromEntries(Object.entries(known).filter(([name]) => kept(name))), ...Object.fromEntries(unhidden.map(({ name, deviation, look, spot, swapM }) => [name, { deviation, look, spot, swapM }])) };
  writeFileSync(knownPath, `${JSON.stringify(Object.fromEntries(Object.entries(knownNow).sort(([a], [b]) => (only.length > 0 ? a.localeCompare(b) : 0))), null, 2)}
`);
  const rows = [...Object.entries(written).filter(([, { name }]) => kept(name)), ...results.map(({ name, fingerprint, swapM }) => [fingerprint, { name, swapM }])];
  const sorted = rows.sort(([, a], [, b]) => a.name.localeCompare(b.name));
  writeFileSync(swapsPath, `${JSON.stringify(Object.fromEntries(sorted), null, 2)}
`);
  console.log(`swaps.json: ${sorted.length} models; known-lod.json: ${Object.keys(knownNow).length} whose far version has to match`);
}
// What a moved swap costs: the near version's extra triangles over each place, over the ground its swap now covers.
const moved = results
  .filter(({ swapM, builtM }) => swapM !== builtM)
  .map((result) => ({ ...result, cost: (result.nearTriangles - result.farTriangles) * (result.swapM ** 2 - result.builtM ** 2) }))
  .sort((a, b) => b.cost - a.cost);
for (const { name, builtM, swapM, nearTriangles, farTriangles } of moved) console.log(`${name}: swap ${builtM} m -> ${swapM} m, near ${nearTriangles} / far ${farTriangles} triangles, near copies x${((swapM / builtM) ** 2).toFixed(2)}`);
console.log(`${results.length} models with a far version: ${moved.length} swap elsewhere than built, ${unhidden.length} change at any swap`);
// What each swap costs as it stands: the near version's extra triangles over the ground its swap covers. The top of
// this list is where a far version that matches better would pay most.
const COSTLIEST = 15;
const costliest = results.map((result) => ({ ...result, cost: (result.nearTriangles - result.farTriangles) * result.swapM ** 2 })).sort((a, b) => b.cost - a.cost);
if (costliest.length > 0) console.log(`The costliest swaps, (near - far triangles) x swap²:\n${costliest.slice(0, COSTLIEST).map(({ name, swapM, nearTriangles, farTriangles, cost }, rank) => `${rank + 1}. ${name}: ${(cost / 1e6).toFixed(1)}M, swap ${swapM} m, near ${nearTriangles} / far ${farTriangles} triangles`).join("\n")}`);
// A page draws one picture at a time, so each page scores its share in turn.
const scored = await Promise.all(pages.map((each, part) => each.evaluate(async (wanted) => {
  const out = [];
  for (const { name, swap } of wanted) out.push(await window.__lod.scoreOf(name, swap));
  return out;
}, scores.filter((_, index) => index % PAGES === part))));
for (const score of scored.flat()) console.log(JSON.stringify(score));
for (const wanted of pictures) {
  const [name, view] = wanted.split("@");
  const [azimuth, elevation, swap] = view.split(",").map(Number);
  const data = await page.evaluate(({ name, azimuth, elevation, swap }) => window.__lod.pictureOf(name, azimuth, elevation, swap), { name, azimuth, elevation, swap });
  const file = join(OUT, `${name.replace(/[^\w]+/g, "-")}-${azimuth}-${elevation}${swap === undefined ? "" : `-at-${swap}`}.png`);
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.log(file);
}
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
if (checking && !flags.includes("--write") && failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
