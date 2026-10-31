// The sky from road level, on the game's renderer and haze: bundles `gallery-page.ts`, serves it on localhost, opens it in
// headless Chromium on WebGPU (the full Chromium, by name: the default headless shell falls back to WebGL2 here), saves a
// screenshot per view and a contact sheet, and with --cost prints the sky's GPU time at the game's size, as pairs of runs
// with and without it. Timing is context, never proof.
//
// Usage: node src/projects/aland-drive/art/sky/gallery.mjs <out folder> [view name ...] [--size=WxH] [--cost]

import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [out, ...only] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!out) throw new Error("gallery: name an output folder");
const [WIDTH, HEIGHT] = (flags.find((arg) => arg.startsWith("--size="))?.slice(7) ?? "1600x670").split("x").map(Number);
const COST = flags.includes("--cost");
const FRAMES_TO_SETTLE = 4;
const SHEET_COLUMNS = 3;
const SHEET_CELL_WIDTH = 800;
const COST_SIZE = { width: 2408, height: 1007 };
const COST_PAIRS = 6;
const COST_FRAMES = 40;
const SUN_YAW = 215;
const GOLD_YAW = 300;
const DRIFT_S = 45;

const VIEWS = [
  { name: "road-north", look: "summer", yawDeg: 0, pitchDeg: 5, seconds: 0 },
  { name: "drift-later", look: "summer", yawDeg: 0, pitchDeg: 5, seconds: DRIFT_S },
  { name: "towards-sun", look: "summer", yawDeg: SUN_YAW, pitchDeg: 12, seconds: 0 },
  { name: "away-from-sun", look: "summer", yawDeg: SUN_YAW - 180, pitchDeg: 8, seconds: 200 },
  { name: "sea-horizon", look: "summer", yawDeg: 120, pitchDeg: 2, seconds: 400, atSea: true },
  { name: "up-wide", look: "summer", yawDeg: 40, pitchDeg: 50, seconds: 600, fieldOfView: 90, bare: true },
  { name: "tiling-wide", look: "summer", yawDeg: 300, pitchDeg: 14, seconds: 800, fieldOfView: 100, atSea: true },
  { name: "cover-light", look: "summer", cover: 0.18, yawDeg: 340, pitchDeg: 6, seconds: 1000 },
  { name: "cover-heavy", look: "summer", cover: 0.72, yawDeg: 340, pitchDeg: 6, seconds: 1000 },
  { name: "golden-sun", look: "goldenHour", yawDeg: GOLD_YAW, pitchDeg: 7, seconds: 0 },
  { name: "golden-away", look: "goldenHour", yawDeg: GOLD_YAW - 180, pitchDeg: 7, seconds: 300 },
  { name: "golden-sea", look: "goldenHour", yawDeg: GOLD_YAW - 25, pitchDeg: 3, seconds: 500, atSea: true },
];

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
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>:root{${tokens}}html,body{margin:0;height:100%}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas></canvas><script type="module" src="/page.js"></script></body></html>`;

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
const problems = [];
async function open(viewport) {
  const tab = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  tab.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  tab.on("pageerror", (error) => problems.push(error.stack ?? error.message));
  await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await tab.waitForFunction(() => window.__skyGallery !== undefined || window.__skyGalleryError !== undefined);
  const failed = await tab.evaluate(() => window.__skyGalleryError);
  if (failed) throw new Error(failed);
  return tab;
}
const show = (tab, view) =>
  tab.evaluate(
    async ({ view, settle }) => {
      window.__skyGallery.show(view);
      const target = window.__skyGallery.frames() + settle;
      while (window.__skyGallery.frames() < target) await new Promise(requestAnimationFrame);
    },
    { view, settle: FRAMES_TO_SETTLE },
  );

const tab = await open({ width: WIDTH, height: HEIGHT });
console.log(`noise texture: ${(await tab.evaluate(() => window.__skyGallery.noiseMs)).toFixed(0)} ms on the main thread`);
const views = VIEWS.filter((view) => only.length === 0 || only.includes(view.name));
const shots = [];
for (const view of views) {
  await show(tab, view);
  const path = join(out, `${view.name}.png`);
  await tab.screenshot({ path });
  shots.push({ path, label: view.name });
}
await tab.close();

if (COST) {
  const costTab = await open(COST_SIZE);
  const adapter = await costTab.evaluate(async () => {
    const found = await navigator.gpu.requestAdapter();
    return found ? `${found.info.vendor} ${found.info.architecture} ${found.info.description}` : "none";
  });
  console.log(`adapter: ${adapter}`);
  for (const [name, view] of [
    ["sky fills the screen", { look: "summer", yawDeg: 40, pitchDeg: 35, seconds: 0, bare: true }],
    ["road view", { look: "summer", yawDeg: 0, pitchDeg: 5, seconds: 0 }],
  ]) {
    await show(costTab, view);
    const differences = [];
    const totals = [];
    for (let pair = 0; pair < COST_PAIRS; pair++) {
      const [withSky, without] = await costTab.evaluate(
        async ({ frames, first }) => {
          const a = await window.__skyGallery.timeFrames(frames, first);
          const b = await window.__skyGallery.timeFrames(frames, !first);
          return first ? [a, b] : [b, a];
        },
        { frames: COST_FRAMES, first: pair % 2 === 0 },
      );
      differences.push(withSky - without);
      totals.push(withSky);
    }
    differences.sort((a, b) => a - b);
    totals.sort((a, b) => a - b);
    console.log(`${name}: sky adds ${differences[COST_PAIRS >> 1].toFixed(3)} ms (from ${differences[0].toFixed(3)} to ${differences.at(-1).toFixed(3)}), frame ${totals[COST_PAIRS >> 1].toFixed(3)} ms`);
  }
  await costTab.close();
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
