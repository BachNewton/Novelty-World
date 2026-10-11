// Screenshots of placement (see ../art/placement.ts): rooms on the art bench with crowds placed by the solver,
// for judging how a room looks with one explorer up to the worst case.
//
// Drives the bench's control surface (window.__betrayalBench) over Playwright like shots.mjs, waiting on its
// events, never a sleep, with the clock frozen.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/placement-shots.mjs <out dir> [room-id ...] [--paths] [--view=<n>]
//
// For each room writes <out dir>/<room-id>/<preset>.png and <out dir>/<room-id>.png, a contact sheet of every
// crowd. --paths draws the paths overlay too (the prime place, keep-clear areas, footprints coloured by
// crowding), into <room-id>-paths.png.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const [OUT, ...ROOMS_ASKED] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!OUT) {
  console.error("usage: node src/projects/betrayal/tools/placement-shots.mjs <out dir> [room-id ...] [--paths] [--view=<n>]");
  process.exit(1);
}
const ROOMS = ROOMS_ASKED.length > 0 ? ROOMS_ASKED : ["kitchen", "dusty-hallway", "graveyard"];
const PATHS = FLAGS.includes("--paths");
const VIEW = Number(flag("view") ?? 0);
const PRESETS = ["place-1", "place-3", "place-6", "place-6-spider", "place-worst"];
const FREEZE_AT = 2;
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const VIEWPORT = { width: 1600, height: 1000 };

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

/** The bench link for one room and crowd: the same link the owner opens. */
const link = (room, preset) => `${BASE}?bench=${encodeURIComponent(room)}&explorer=${preset}${PATHS ? "&paths" : ""}`;

/** Opens one crowd on its own page, so every shot is one build, and shoots it. */
async function shoot(room, preset, path) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (error) => console.error(`page error in ${room} ${preset}:`, error.message));
  await page.goto(link(room, preset), { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 60000 });
  await page.evaluate(
    ({ view, frozenAt }) => {
      const bench = window.__betrayalBench;
      bench.setView(view);
      bench.freezeClock(frozenAt);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = "hidden";
      });
    },
    { view: VIEW, frozenAt: FREEZE_AT },
  );
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 60000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 10000 });
  await page.screenshot({ path });
  await page.close();
  console.log("wrote", path);
  return path;
}

const sheet = await browser.newPage({ viewport: { width: 2400, height: 200 } });
const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;

for (const room of ROOMS) {
  const dir = join(OUT, room);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing where it is told to
  mkdirSync(dir, { recursive: true });
  const cells = [];
  for (const preset of PRESETS) cells.push({ preset, path: await shoot(room, preset, join(dir, `${preset}${PATHS ? "-paths" : ""}.png`)) });
  const body = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cells
    .map(({ preset, path }) => `<figure style="margin:0"><img src="${dataUrl(path)}" style="width:100%;display:block"><figcaption>${preset}</figcaption></figure>`)
    .join("")}</div>`;
  await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:16px sans-serif">
<h1 style="margin:0 0 12px;font-size:20px">${room} · placement${PATHS ? " · paths" : ""} · view ${VIEW}</h1>${body}</body></html>`);
  await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  const path = join(OUT, `${room}${PATHS ? "-paths" : ""}.png`);
  await sheet.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}
await browser.close();
