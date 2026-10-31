// The identity kit on the game's own renderer, in headless full Chromium on WebGPU (the default headless shell falls
// back to WebGL2 here), and the stamps and album pages, drawn on a canvas in the same browser. It needs no dev server
// and no tiles, and never touches a browser of the owner's.
//
//   node src/projects/aland-drive/art/identity/gallery.mjs --out=<folder> [--stamps] [names of shots...]
//
// --stamps renders only the stamps, the album pages and their sheets.

/* eslint-disable security/detect-non-literal-fs-filename -- a developer tool, writing to the folder named on its own command line */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const names = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const OUT = resolve(flags.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "identity-gallery");
const stampsOnly = flags.includes("--stamps");
const entry = stampsOnly ? "stamps-page.ts" : "gallery-page.ts";
const [WIDTH, HEIGHT] = [1600, 900];
const SHEET_COLUMNS = 4;
const SHEET_CELL_WIDTH = 560;

mkdirSync(OUT, { recursive: true });
const css = readFileSync(join(here, "../../../../app/globals.css"), "utf8");
const tokens = [...css.matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map((match) => match[0]).join("\n");
await build({
  entryPoints: [join(here, entry)],
  bundle: true,
  format: "esm",
  target: "esnext",
  outfile: join(OUT, ".page.js"),
  tsconfig: join(here, "../../../../../tsconfig.json"),
  logLevel: "error",
});
const pagePath = join(OUT, ".page.html");
writeFileSync(pagePath, `<!doctype html><style>:root{${tokens}} html,body{margin:0}canvas{display:block}</style><link rel="stylesheet" href="./.page.css"><script type="module" src="./.page.js"></script>`);

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

const stop = async (error) => {
  console.log(`no gallery: ${error.message}\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
  await browser.close();
  process.exit(1);
};

if (stampsOnly) {
  await page.waitForFunction(() => window.__identityStamps?.ready === true, null, { timeout: 60000 }).catch(stop);
  for (const name of await page.evaluate(() => window.__identityStamps.sheets)) {
    const data = await page.evaluate((sheet) => window.__identityStamps.png(sheet), name);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data.split(",")[1], "base64"));
    console.log(name);
  }
} else {
  await page.waitForFunction(() => window.__identityGallery?.ready === true, null, { timeout: 180000 }).catch(stop);
  for (const { name, near, far, swapM, reachM } of await page.evaluate(() => window.__identityGallery.counts)) console.log(`${name}: ${near} / ${far} tris, swap ${swapM} m, reach ${reachM} m`);
  const shots = (await page.evaluate(() => window.__identityGallery.shots)).filter(({ name }) => names.length === 0 || names.includes(name));
  const taken = [];
  for (const { name, label } of shots) {
    const counts = await page.evaluate((shot) => window.__identityGallery.frame(shot), name);
    const file = join(OUT, `${name}.png`);
    await page.locator("canvas").screenshot({ path: file });
    taken.push({ name, label, file, counts });
  }
  if (names.length === 0) {
    const sheet = await browser.newPage({ viewport: { width: SHEET_COLUMNS * SHEET_CELL_WIDTH, height: 900 }, deviceScaleFactor: 1 });
    const cells = taken.map(({ file, label, counts }) => `<figure><img src="data:image/png;base64,${readFileSync(file).toString("base64")}"><figcaption>${label} · ${counts.triangles.toLocaleString("en")} tris</figcaption></figure>`);
    await sheet.setContent(`<!doctype html><style>body{margin:0;background:black;font:15px sans-serif;color:white;display:grid;grid-template-columns:repeat(${SHEET_COLUMNS},1fr);gap:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:3px 6px}</style>${cells.join("")}`);
    await sheet.screenshot({ path: join(OUT, "contact-sheet.png"), fullPage: true });
  }
}
console.log([...new Set(problems)].slice(0, 20).join("\n"));
await browser.close();
