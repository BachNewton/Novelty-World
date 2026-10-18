// Screenshots of Hearthwood's art gallery (`?art`), for judging the art pieces without a browser open: the
// whole gallery at golden hour and at night, each row, and chosen pieces alone at noon, golden hour and night.
//
// Drives the gallery's probe (window.__hearthwoodArt, see ../components/gallery/art-gallery.tsx) over
// Playwright and waits on its events (ready, frames drawn), never a sleep. Every shot holds the hour and the
// motion clock, so two runs differ only where the art does.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/art-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "art"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", async (error) => {
  console.error(`The gallery threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
page.on("console", (m) => {
  if (m.type() === "error") console.error("page error:", m.text());
});
await page.goto(`${BASE}?art`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__hearthwoodArt?.isReady() === true, null, { timeout: 180000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodArt.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodArt.frameCount() >= n, start + count, { timeout: 60000 });
}

async function capture(name, { hour, focus = null, row = null, view = null, turntable = false }) {
  if (!want(name)) return;
  await page.evaluate(
    ({ hour, focus, row, turntable, motion }) => {
      const art = window.__hearthwoodArt;
      art.holdHour(hour);
      art.holdMotion(motion);
      art.setTurntable(turntable);
      art.focus(focus);
      art.showRow(row);
    },
    { hour, focus, row, turntable, motion: MOTION_AT },
  );
  await frames(6);
  if (view) await page.evaluate((v) => window.__hearthwoodArt.setView(v[0], v[1], v[2]), view);
  await frames(6);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

await capture("gallery-golden", { hour: 17.2 });
await capture("gallery-noon", { hour: 12.5 });
await capture("gallery-night", { hour: 22.5 });
const rows = await page.evaluate(() => window.__hearthwoodArt.rows());
for (const row of rows) await capture(`row-${row.toLowerCase().replace(/[^a-z]+/g, "-")}`, { hour: 16.5, row, view: [20, 18, null] });
const pieces = await page.evaluate(() => window.__hearthwoodArt.pieces());
const chosen = pieces.filter((id) => id.startsWith("places/") || id.startsWith("camp/") || id.startsWith("cooking/") || id.startsWith("folk/") || id.startsWith("people/") ||/\/0$/.test(id));
for (const id of chosen) {
  const name = `piece-${id.replace(/\//g, "-")}`;
  await capture(name, { hour: id.startsWith("camp/") ? 21.5 : 15.5, focus: id, view: [35, 16, null] });
}

await browser.close();
