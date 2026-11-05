// Every kit's models, near and far, drawn as the game draws them on WebGPU in headless full Chromium, and compared at
// the swap (`page.ts`): a far version that changes shape or colour from its near version is noticed when it swaps.
//
//   node src/projects/aland-drive/art/lod-check/check.mjs [--out=<folder>] [--write] [--pictures-only] [--picture=<kit: model>@<azimuth>,<elevation>[,<swap m>] ...]
//
// It finds the kits by their catalogues, needs no dev server and no tiles, and never touches a browser of the owner's.
// A model whose outline moves, or whose look changes by FLIP, more than `NOTICED` allows is noticed, and the run fails
// on one unless it's in known-lod.json, the art from before the check, which may only get better; --write brings that
// list to what's found. Each noticed model is told its cure: the swap that hides its change, or a far version
// that matches where no swap up to twice its own does. Every model's scores go to results.json in --out, and --picture
// saves that model's two versions from that view side by side.

/* eslint-disable security/detect-non-literal-fs-filename -- a developer tool, reading the kits beside it and writing to the folder named on its own command line */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const art = resolve(here, "..");
const flags = process.argv.slice(2);
const OUT = resolve(flags.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "lod-check");
const pictures = flags.filter((arg) => arg.startsWith("--picture=")).map((arg) => arg.slice(10));
mkdirSync(OUT, { recursive: true });

const kits = readdirSync(art, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(art, entry.name, "catalogue.ts")))
  .map((entry) => entry.name);
const entry = join(OUT, ".entry.ts");
writeFileSync(
  entry,
  [
    `import { checkAll, pictureOf } from ${JSON.stringify(join(here, "page.ts").replaceAll("\\", "/"))};`,
    ...kits.map((kit, index) => `import * as kit${index} from ${JSON.stringify(join(art, kit, "catalogue.ts").replaceAll("\\", "/"))};`),
    `const catalogues = { ${kits.map((kit, index) => `${JSON.stringify(kit)}: kit${index}`).join(", ")} };`,
    `Object.assign(window, { __lod: { ready: true, checkAll: (part, parts) => checkAll(catalogues, part, parts), pictureOf: (name, azimuth, elevation, swap) => pictureOf(catalogues, name, azimuth, elevation, swap) } });`,
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
const SLACK = { deviation: 0.5, look: 0.01 };
const knownPath = join(here, "known-lod.json");
const known = JSON.parse(readFileSync(knownPath, "utf8"));
const checking = !flags.includes("--pictures-only");
const results = checking ? (await Promise.all(pages.map((each, part) => each.evaluate(({ part, parts }) => window.__lod.checkAll(part, parts), { part, parts: PAGES })))).flat() : [];
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
const noticed = results.filter(({ hiddenAtM }) => hiddenAtM !== undefined);
const cure = ({ swapM, hiddenAtM }) => (hiddenAtM === null ? "its far version has to match: no swap up to twice its own hides it" : `a swap at ${hiddenAtM} m rather than ${swapM} m hides it, or a far version that matches`);
const failures = [];
for (const result of noticed) {
  const { name, deviation, look, deviationView, lookView } = result;
  const was = known[name];
  const where = `the outline moves ${deviation} px (most from ${deviationView}) and FLIP reads ${look} (most from ${lookView}); ${cure(result)}`;
  if (was === undefined) failures.push(`${name}: its far version changes at the swap: ${where}`);
  else if (deviation > was.deviation + SLACK.deviation || look > was.look + SLACK.look) failures.push(`${name}: changes more at the swap than it did: ${where}`);
}
for (const name of Object.keys(known).filter((listed) => !noticed.some((result) => result.name === listed))) failures.push(`${name}: no longer changes at the swap, so it comes off known-lod.json (--write)`);
if (flags.includes("--write")) {
  const cureOf = ({ hiddenAtM }) => (hiddenAtM === null ? "far version" : `swap at ${hiddenAtM} m`);
  writeFileSync(knownPath, `${JSON.stringify(Object.fromEntries(noticed.map((result) => [result.name, { deviation: result.deviation, look: result.look, swapM: result.swapM, cure: cureOf(result) }])), null, 2)}\n`);
  console.log(`known-lod.json: ${noticed.length} models`);
}
console.log(`${results.length} models with a far version, ${noticed.length} change at the swap`);
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
