// Screenshots of one room on the Betrayal art bench, for judging the art without a browser open.
//
// Drives the bench's control surface (window.__betrayalBench, see ../art/bench.ts) over Playwright and
// waits on its events (room built, textures decoded, camera settled, frames rendered), never a sleep.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/shots.mjs <room-id> [label] [--explorer=<id>] [--idle]
// Writes to src/projects/betrayal/.shots/<label>/<room-id>/ (gitignored): view-0..3.png (desktop
// dollhouse views), phone.png (360×780 portrait), close-up.png, explorer.png (the explorer framed
// close), and contact-sheet.png combining them. --explorer picks who stands at the room's pawn spot
// (the bench's first explorer by default; `pawn` is the plain scale pawn). --idle also writes
// idle-strip.png: the explorer at a run of frozen times, to judge the idle animation.
//
// The bench's clock is frozen at FREEZE_AT for every shot, so candle flicker and the explorer's idle
// stand still and two runs differ only where the art does.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [ROOM, LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const EXPLORER = FLAGS.find((flag) => flag.startsWith("--explorer="))?.slice("--explorer=".length);
const IDLE = FLAGS.includes("--idle");
const FREEZE_AT = 2;
/** The idle strip's frozen times: every 1.5 s over 24 s, long enough to catch his occasional gestures. */
const IDLE_TIMES = Array.from({ length: 16 }, (_, i) => i * 1.5);
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
// A room that throws while building never becomes ready, so without this the
// run would end in a bare timeout instead of the room's own error.
async function failOnPageError(error) {
  console.error(`The bench threw while showing "${ROOM}":\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
}

async function openBench(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => void failOnPageError(error));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page console error:", m.text());
  });
  await page.goto(`${BASE}?bench=${encodeURIComponent(ROOM)}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 30000 });
  const known = await page.evaluate(() => window.__betrayalBench.rooms());
  if (!known.includes(ROOM)) throw new Error(`The bench has no room "${ROOM}"; it has: ${known.join(", ")}`);
  await page.evaluate(
    ({ explorer, frozenAt }) => {
      const bench = window.__betrayalBench;
      if (explorer) {
        if (!bench.explorers().includes(explorer)) {
          throw new Error(`The bench has no explorer "${explorer}"; it has: ${bench.explorers().join(", ")}`);
        }
        bench.setExplorer(explorer);
      }
      bench.freezeClock(frozenAt);
    },
    { explorer: EXPLORER, frozenAt: FREEZE_AT },
  );
  return page;
}

async function capture(page, name, { view = 0, zoom = 1, chrome = true, subject = "room", at = FREEZE_AT, clip } = {}) {
  await page.evaluate(
    ({ view, zoom, chrome, subject, at }) => {
      const bench = window.__betrayalBench;
      bench.setView(view);
      bench.setZoom(zoom);
      bench.setSubject(subject);
      bench.freezeClock(at);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = chrome ? "" : "hidden";
      });
    },
    { view, zoom, chrome, subject, at },
  );
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 30000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 10000 });
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path, clip });
  console.log("wrote", path);
  return path;
}

const desktop = await openBench(DESKTOP);
const shots = [];
for (const view of [0, 1, 2, 3]) {
  shots.push({ name: `view ${view}`, path: await capture(desktop, `view-${view}`, { view, chrome: false }) });
}
shots.push({ name: "close-up", path: await capture(desktop, "close-up", { view: 0, zoom: 2.4, chrome: false }) });
shots.push({ name: "explorer", path: await capture(desktop, "explorer", { view: 0, subject: "explorer", chrome: false }) });
const idle = [];
if (IDLE) {
  const clip = { x: (DESKTOP.width - 640) / 2, y: 0, width: 640, height: DESKTOP.height };
  for (const at of IDLE_TIMES) {
    const name = `idle-${at.toFixed(1)}s`;
    idle.push({ name, path: await capture(desktop, name, { view: 0, subject: "explorer", chrome: false, at, clip }) });
  }
}
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
${cell(shots[2])}${cell(shots[3])}${cell(shots[5])}
</div></body></html>`);
await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
const sheetPath = join(OUTDIR, "contact-sheet.png");
await sheet.screenshot({ path: sheetPath, fullPage: true });
console.log("wrote", sheetPath);

if (IDLE) {
  await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:14px sans-serif">
<h1 style="margin:0 0 12px;font-size:18px">${ROOM} · ${LABEL} · idle, one frame every ${IDLE_TIMES[1] - IDLE_TIMES[0]} s</h1>
<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">${idle.map((shot) => cell(shot)).join("")}</div>
</body></html>`);
  await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  const stripPath = join(OUTDIR, "idle-strip.png");
  await sheet.screenshot({ path: stripPath, fullPage: true });
  console.log("wrote", stripPath);
}

await browser.close();
