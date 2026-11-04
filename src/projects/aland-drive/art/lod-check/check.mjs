// Every kit's models, near and far, drawn as the game draws them on WebGPU in headless full Chromium, and compared at
// the swap (`page.ts`): a far version that changes shape or colour from its near version is noticed when it swaps.
//
//   node src/projects/aland-drive/art/lod-check/check.mjs [--out=<folder>] [--write] [--picture=<kit: model>@<azimuth>,<elevation> ...]
//
// It finds the kits by their catalogues, needs no dev server and no tiles, and never touches a browser of the owner's.
// A model whose outline changes by more than a quarter, or its colour by more than a ΔE of 15, is noticed at its swap,
// and the run fails on one unless it's in known-lod.json, the art from before the check, which may only get better;
// --write brings that list to what's found. Every model's scores go to results.json in --out, and --picture saves that
// model's two versions from that view side by side.

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
    `Object.assign(window, { __lod: { ready: true, checkAll: () => checkAll(catalogues), pictureOf: (name, azimuth, elevation) => pictureOf(catalogues, name, azimuth, elevation) } });`,
  ].join("\n"),
);
await build({ entryPoints: [entry], bundle: true, format: "esm", target: "esnext", outfile: join(OUT, ".page.js"), tsconfig: join(art, "../../../../tsconfig.json"), logLevel: "error" });
const sheets = [join(art, "../../../app/globals.css"), ...kits.map((kit) => join(art, kit, "tokens.css")).filter((sheet) => existsSync(sheet))];
const tokens = sheets.flatMap((sheet) => [...readFileSync(sheet, "utf8").matchAll(/--[\w-]+:\s*[^;]+;/g)].map((match) => match[0])).join("\n");
const pagePath = join(OUT, ".page.html");
writeFileSync(pagePath, `<!doctype html><style>:root{${tokens}}</style><script type="module" src="./.page.js"></script>`);

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--allow-file-access-from-files"] });
const page = await browser.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(error.stack ?? error.message));
await page.goto(pathToFileURL(pagePath).href);
await page.waitForFunction(() => window.__lod?.ready === true, null, { timeout: 180000 }).catch(async (error) => {
  console.log(`no page: ${error.message}\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
  await browser.close();
  process.exit(1);
});

const SHAPE_MOST = 0.25;
const COLOUR_MOST = 15;
// Each run draws the same pixels on one GPU, but a little slack keeps another GPU's from failing what was written down.
const SLACK = { shape: 0.03, colour: 2 };
const knownPath = join(here, "known-lod.json");
const known = JSON.parse(readFileSync(knownPath, "utf8"));
const results = await page.evaluate(() => window.__lod.checkAll());
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
const noticed = results.filter(({ shape, colour }) => shape > SHAPE_MOST || colour > COLOUR_MOST);
const failures = [];
for (const { name, shape, colour, shapeView, colourView } of noticed) {
  const was = known[name];
  const where = `outline ${(shape * 100).toFixed(0)}% (most from ${shapeView}), colour ΔE ${colour.toFixed(1)} (most from ${colourView})`;
  if (was === undefined) failures.push(`${name}: its far version changes at the swap: ${where}`);
  else if (shape > was.shape + SLACK.shape || colour > was.colour + SLACK.colour) failures.push(`${name}: changes more at the swap than it did: ${where}`);
}
for (const name of Object.keys(known).filter((listed) => !noticed.some((result) => result.name === listed))) failures.push(`${name}: no longer changes at the swap, so it comes off known-lod.json (--write)`);
if (flags.includes("--write")) {
  const round = (value, places) => Number(value.toFixed(places));
  writeFileSync(knownPath, `${JSON.stringify(Object.fromEntries(noticed.map(({ name, shape, colour }) => [name, { shape: round(shape, 3), colour: round(colour, 1) }])), null, 2)}\n`);
  console.log(`known-lod.json: ${noticed.length} models`);
}
console.log(`${results.length} models with a far version, ${noticed.length} change at the swap`);
for (const wanted of pictures) {
  const [name, view] = wanted.split("@");
  const [azimuth, elevation] = view.split(",").map(Number);
  const data = await page.evaluate(({ name, azimuth, elevation }) => window.__lod.pictureOf(name, azimuth, elevation), { name, azimuth, elevation });
  const file = join(OUT, `${name.replace(/[^\w]+/g, "-")}-${azimuth}-${elevation}.png`);
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.log(file);
}
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
if (!flags.includes("--write") && failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
