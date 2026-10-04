// Screenshots of one room on the Betrayal art bench, for judging the art without a browser open.
//
// Drives the bench's control surface (window.__betrayalBench, see ../art/bench.ts) over Playwright and
// waits on its events (room built, textures decoded, camera settled, frames rendered), never a sleep.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/shots.mjs <room-id> [label]
// Writes to src/projects/betrayal/.shots/<label>/<room-id>/ (gitignored): view-0..3.png (desktop
// dollhouse views), phone.png (360×780 portrait), close-up.png, and contact-sheet.png combining them.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOM = process.argv[2];
const LABEL = process.argv[3] ?? "latest";
if (!ROOM) {
  console.error("usage: node src/projects/betrayal/tools/shots.mjs <room-id> [label]");
  process.exit(1);
}
const OUTDIR = join(HERE, "..", ".shots", LABEL, ROOM);
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 360, height: 780 };

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

// Real GPU through ANGLE/D3D11, as Shipwright's shots tool; SHOTS_CPU=1 falls back to SwiftShader.
const USE_GPU = process.env.SHOTS_CPU !== "1";
const browser = await chromium.launch({
  headless: true,
  args: USE_GPU
    ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function openBench(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${BASE}?bench=${encodeURIComponent(ROOM)}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 30000 });
  const known = await page.evaluate(() => window.__betrayalBench.rooms());
  if (!known.includes(ROOM)) throw new Error(`The bench has no room "${ROOM}"; it has: ${known.join(", ")}`);
  return page;
}

async function capture(page, name, { view = 0, zoom = 1, chrome = true } = {}) {
  await page.evaluate(
    ({ view, zoom, chrome }) => {
      const bench = window.__betrayalBench;
      bench.setView(view);
      bench.setZoom(zoom);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = chrome ? "" : "hidden";
      });
    },
    { view, zoom, chrome },
  );
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 30000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 10000 });
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log("wrote", path);
  return path;
}

const desktop = await openBench(DESKTOP);
const shots = [];
for (const view of [0, 1, 2, 3]) {
  shots.push({ name: `view ${view}`, path: await capture(desktop, `view-${view}`, { view, chrome: false }) });
}
shots.push({ name: "close-up", path: await capture(desktop, "close-up", { view: 0, zoom: 2.4, chrome: false }) });
await desktop.close();

const phone = await openBench(PHONE);
const phoneShot = { name: "phone", path: await capture(phone, "phone", { view: 0 }) };
await phone.close();

const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const cell = (shot, style = "") =>
  `<figure style="margin:0;${style}"><img src="${dataUrl(shot.path)}" style="width:100%;display:block;image-rendering:pixelated"><figcaption>${shot.name}</figcaption></figure>`;
const sheet = await browser.newPage({ viewport: { width: 2000, height: 200 } });
await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:14px sans-serif">
<h1 style="margin:0 0 12px;font-size:18px">${ROOM} · ${LABEL}</h1>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 230px;gap:12px;align-items:start">
${cell(shots[0])}${cell(shots[1])}${cell(shots[4])}
${cell(phoneShot, "grid-row:span 2")}
${cell(shots[2])}${cell(shots[3])}
</div></body></html>`);
await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
const sheetPath = join(OUTDIR, "contact-sheet.png");
await sheet.screenshot({ path: sheetPath, fullPage: true });
console.log("wrote", sheetPath);

if (errors.length) console.log("page errors:\n" + errors.slice(0, 10).join("\n"));
await browser.close();
