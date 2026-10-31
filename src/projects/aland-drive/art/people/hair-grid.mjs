// Every hair style on every head, by view and distance, as sheets of cells, in headless full Chromium on WebGPU. It needs
// no dev server and no tiles, and never touches a browser of the owner's.
//
//   node src/projects/aland-drive/art/people/hair-grid.mjs --out=<folder> [names of sheets...]

/* eslint-disable security/detect-non-literal-fs-filename -- a developer tool, writing to the folder named on its own command line */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const names = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const OUT = resolve(flags.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "hair-grid");

mkdirSync(OUT, { recursive: true });
const css = readFileSync(join(here, "../../../../app/globals.css"), "utf8");
const tokens = [...css.matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map((match) => match[0]).join("\n");
await build({
  entryPoints: [join(here, "hair-grid-page.ts")],
  bundle: true,
  format: "esm",
  target: "esnext",
  outfile: join(OUT, ".grid.js"),
  tsconfig: join(here, "../../../../../tsconfig.json"),
  logLevel: "error",
});
const pagePath = join(OUT, ".grid.html");
writeFileSync(pagePath, `<!doctype html><style>:root{${tokens}} html,body{margin:0}canvas{display:block}</style><link rel="stylesheet" href="./.grid.css"><script type="module" src="./.grid.js"></script>`);

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));
await page.goto(pathToFileURL(pagePath).href);
await page.waitForFunction(() => window.__hairGrid?.ready === true, null, { timeout: 45000 }).catch(async (error) => {
  console.log(`no grid: ${error.message}\n${problems.slice(0, 10).join("\n")}`);
  await browser.close();
  process.exit(1);
});

const sheets = (await page.evaluate(() => window.__hairGrid.sheets)).filter((sheet) => names.length === 0 || names.includes(sheet));
const columns = await page.evaluate(() => window.__hairGrid.columns);
console.log(columns.join(" | "));
const taken = [];
for (const sheet of sheets) {
  const url = await page.evaluate((name) => window.__hairGrid.render(name), sheet);
  const file = join(OUT, `${sheet}.png`);
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  taken.push({ sheet, url });
  console.log(file);
}

if (names.length === 0) {
  const all = await browser.newPage({ viewport: { width: 2640, height: 900 }, deviceScaleFactor: 1 });
  const cells = taken.map(({ sheet, url }) => `<h2>${sheet}</h2><img src="${url}">`).join("");
  await all.setContent(`<!doctype html><style>body{margin:0;background:#111;color:#fff;font:18px sans-serif}h2{margin:6px 8px;font-size:18px}img{display:block}</style><p style="margin:6px 8px">${columns.join(" · ")}</p>${cells}`);
  await all.waitForFunction(() => [...document.images].every((image) => image.complete));
  await all.screenshot({ path: join(OUT, "hair-sheet.png"), fullPage: true });
}
for (const file of [".grid.js", ".grid.css", ".grid.html"]) rmSync(join(OUT, file), { force: true });
console.log(problems.slice(0, 10).join("\n"));
await browser.close();
