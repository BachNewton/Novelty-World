// The rural kit on the game's own renderer, at road level, in headless full Chromium on WebGPU. Bundles `gallery-page.ts`,
// takes a shot of each station and lays them out as one contact sheet. It needs no dev server and no tiles.
//
//   node src/projects/aland-drive/art/rural/gallery.mjs --out=<folder> [names of shots...]

/* eslint-disable security/detect-non-literal-fs-filename -- a developer tool, writing to the folder named on its own command line */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const names = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const OUT = resolve(flags.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "rural-gallery");
const [WIDTH, HEIGHT] = [2408, 1007];
const SHEET_COLUMNS = 4;
const SHEET_CELL_WIDTH = 640;

mkdirSync(OUT, { recursive: true });
const css = readFileSync(join(here, "../../../../app/globals.css"), "utf8");
const tokens = [...css.matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map((match) => match[0]).join("\n");
await build({
  entryPoints: [join(here, "gallery-page.ts")],
  bundle: true,
  format: "esm",
  target: "esnext",
  outfile: join(OUT, ".page.js"),
  tsconfig: join(here, "../../../../../tsconfig.json"),
  logLevel: "error",
});
const pagePath = join(OUT, ".page.html");
writeFileSync(pagePath, `<!doctype html><style>:root{${tokens}} html,body{margin:0}canvas{display:block}</style><script type="module" src="./.page.js"></script>`);

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));
await page.goto(pathToFileURL(pagePath).href);
await page.waitForFunction(() => window.__ruralGallery?.ready === true, null, { timeout: 180000 }).catch(async (error) => {
  console.log(`no gallery: ${error.message}\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
  await browser.close();
  process.exit(1);
});

console.log(JSON.stringify(await page.evaluate(() => window.__ruralGallery.counts), null, 0).replaceAll("},", "},\n"));
const shots = (await page.evaluate(() => window.__ruralGallery.shots)).filter(({ name }) => names.length === 0 || names.includes(name));
const taken = [];
for (const { name, label } of shots) {
  const counts = await page.evaluate((shot) => window.__ruralGallery.frame(shot), name);
  const file = join(OUT, `${name}.png`);
  await page.locator("canvas").screenshot({ path: file });
  taken.push({ name, label, file, counts });
  console.log(name, JSON.stringify(counts));
}

if (names.length === 0 || flags.includes("--budget")) console.log(JSON.stringify(await page.evaluate(() => window.__ruralGallery.budget())));

if (names.length === 0) {
  const sheet = await browser.newPage({ viewport: { width: SHEET_COLUMNS * SHEET_CELL_WIDTH, height: 900 }, deviceScaleFactor: 1 });
  const cells = taken.map(({ file, label, counts }) => {
    const image = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
    return `<figure><img src="${image}"><figcaption>${label} · ${counts.triangles.toLocaleString("en")} tris</figcaption></figure>`;
  });
  await sheet.setContent(`<!doctype html><style>body{margin:0;background:black;font:15px sans-serif;color:white;display:grid;grid-template-columns:repeat(${SHEET_COLUMNS},1fr);gap:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:3px 6px}</style>${cells.join("")}`);
  await sheet.screenshot({ path: join(OUT, "contact-sheet.png"), fullPage: true });
}
console.log(JSON.stringify(await page.evaluate(async () => { const { vendor, architecture, description } = (await navigator.gpu.requestAdapter()).info; return { vendor, architecture, description }; })));
console.log([...new Set(problems)].slice(0, 20).join("\n"));
await browser.close();
