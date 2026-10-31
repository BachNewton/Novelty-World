// A look at every landmark from road level, on the game's own renderer and building material: bundles `gallery-page.ts`,
// serves it on localhost, opens it in headless Chromium on WebGPU (the full Chromium, by name: the default headless shell
// falls back to WebGL2 here), saves a screenshot per view and a contact sheet, and prints each model's triangles.
//
// Usage: node src/projects/aland-drive/art/landmarks/gallery.mjs <out folder> [landmark id ...] [--size=WxH]

import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { VIEWS } from "./gallery-views.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [out, ...only] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!out) throw new Error("gallery: name an output folder");
const [WIDTH, HEIGHT] = (flags.find((arg) => arg.startsWith("--size="))?.slice(7) ?? "1600x900").split("x").map(Number);
const FRAMES_TO_SETTLE = 4;
const SHEET_COLUMNS = 4;
const SHEET_CELL_WIDTH = 800;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..", "..");

const bundled = await build({
  entryPoints: [join(here, "gallery-page.ts")],
  bundle: true,
  format: "esm",
  write: false,
  tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
});
const script = bundled.outputFiles[0].text;
const tokens = [...readFileSync(join(root, "src", "app", "globals.css"), "utf8").matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map(([token]) => token).join("\n");
const page = `<!doctype html><html><head><meta charset="utf-8"><style>:root{${tokens}}html,body{margin:0;height:100%}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas></canvas><script type="module" src="/page.js"></script></body></html>`;

const server = createServer((request, response) => {
  if (request.url === "/page.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(script);
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(page);
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const { port } = server.address();

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
tab.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
tab.on("pageerror", (error) => problems.push(error.stack ?? error.message));

await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await tab.waitForFunction(() => window.__landmarkGallery !== undefined || window.__landmarkGalleryError !== undefined);
const failed = await tab.evaluate(() => window.__landmarkGalleryError);
if (failed) throw new Error(failed);

for (const line of await tab.evaluate(() => window.__landmarkGallery.counts())) {
  console.log(`${line.id}: near ${line.near}, far ${line.far} triangles, at ${line.east}, ${line.north}, base ${line.baseM} m`);
}

const views = VIEWS.filter((view) => only.length === 0 || only.includes(view.id));
const shots = [];
for (const view of views) {
  await tab.evaluate(async ({ view, settle }) => {
    window.__landmarkGallery.show(view);
    const target = window.__landmarkGallery.frames() + settle;
    while (window.__landmarkGallery.frames() < target) await new Promise(requestAnimationFrame);
  }, { view, settle: FRAMES_TO_SETTLE });
  const path = join(out, `${view.id}-${view.name}.png`);
  await tab.screenshot({ path });
  shots.push({ path, label: `${view.id} ${view.name}` });
}

await browser.close();
server.close();
if (problems.length > 0) console.log(`problems:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);

const cellHeight = Math.round((SHEET_CELL_WIDTH * HEIGHT) / WIDTH);
const rows = Math.ceil(shots.length / SHEET_COLUMNS);
const cells = await Promise.all(
  shots.map(async ({ path, label }, at) => {
    const caption = Buffer.from(`<svg width="${SHEET_CELL_WIDTH}" height="30"><rect width="100%" height="100%" fill="black" fill-opacity="0.55"/><text x="8" y="21" font-family="sans-serif" font-size="18" fill="white">${label}</text></svg>`);
    const input = await sharp(path).resize(SHEET_CELL_WIDTH, cellHeight).composite([{ input: caption, gravity: "north" }]).toBuffer();
    return { input, left: (at % SHEET_COLUMNS) * SHEET_CELL_WIDTH, top: Math.floor(at / SHEET_COLUMNS) * cellHeight };
  }),
);
const sheet = join(out, "contact-sheet.png");
await sharp({ create: { width: SHEET_COLUMNS * SHEET_CELL_WIDTH, height: rows * cellHeight, channels: 3, background: "black" } }).composite(cells).png().toFile(sheet);
console.log(sheet);
