// Each of Hearthwood's features (see ../features.ts) on and off, for judging what it adds without a browser
// open, and what it costs: camp from behind Elliott at noon, golden hour, blue hour and night, once with every
// feature on, once with all off, and once with each feature off alone; the ~ panel's Features section; and the
// GPU time of each part of the frame (the scene's draw and every pass) with everything on and with each
// feature off, so a feature that is only GLSL in the shared materials shows its cost as the scene's saving.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/feature-shots.mjs [label] [--only=<feature,...>] [--weather=<kind>] [--no-shots]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "features"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const SHOTS = !process.argv.includes("--no-shots");
// The weather held for every shot (see ../engine/weather.ts): fair unless asked.
const WEATHER = process.argv.find((arg) => arg.startsWith("--weather="))?.slice("--weather=".length) ?? "fair";
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const HOURS = { noon: 12.5, golden: 17.4, blue: 19.4, night: 23 };
const COST_SAMPLES = 60;

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", async (error) => {
  console.error(`The world threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
await page.goto(`${BASE}?date=mabon`, { waitUntil: "load" });
await page.addStyleTag({
  content: "nextjs-portal{display:none!important} html:not([data-shot-chrome]) [data-testid=hearthwood-world] > :not(div:first-child):not([data-testid=hearthwood-debug-panel]){visibility:hidden!important}",
});
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

const ALL = Object.keys(await page.evaluate(() => window.__hearthwoodWorld.features()));
const CHOSEN = ALL.filter((id) => ONLY === null || ONLY.includes(id));

async function setFeatures(on) {
  await page.evaluate((on) => {
    const world = window.__hearthwoodWorld;
    for (const id of Object.keys(world.features())) world.setFeature(id, on.includes(id));
  }, on);
}

await page.evaluate((weather) => {
  const world = window.__hearthwoodWorld;
  world.holdWeather(weather);
  world.holdMotion(12);
  world.setView("walk");
  world.setPointOfView("third");
}, WEATHER);

async function shoot(name, hour) {
  await page.evaluate((hour) => window.__hearthwoodWorld.holdHour(hour), hour);
  // A switched feature recompiles its materials and makes or frees its passes: let that settle into drawn frames.
  await frames(30);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

if (SHOTS) {
  const sets = [["all-on", ALL], ["all-off", []], ...CHOSEN.map((id) => [`without-${id}`, ALL.filter((f) => f !== id)])];
  for (const [label, on] of sets) {
    await setFeatures(on);
    for (const [moment, hour] of Object.entries(HOURS)) await shoot(`${label}-${moment}`, hour);
  }
}

/** The median of each span's readings over a stretch of frames: other work on the machine makes single readings jump. */
async function costs(on) {
  await setFeatures(on);
  await page.evaluate(() => window.__hearthwoodWorld.watchCosts(true));
  await frames(30);
  const samples = [];
  for (let i = 0; i < COST_SAMPLES; i++) {
    await frames(2);
    const read = await page.evaluate(() => window.__hearthwoodWorld.gpuCosts());
    if (read === null) return null;
    samples.push(read);
  }
  await page.evaluate(() => window.__hearthwoodWorld.watchCosts(false));
  const names = [...new Set(samples.flatMap((s) => Object.keys(s)))];
  return Object.fromEntries(
    names.map((name) => {
      const sorted = samples.map((s) => s[name] ?? 0).sort((a, b) => a - b);
      return [name, sorted[Math.floor(sorted.length / 2)]];
    }),
  );
}

await page.evaluate((hour) => window.__hearthwoodWorld.holdHour(hour), HOURS.golden);
const everything = await costs(ALL);
if (everything === null) console.log("GPU timing isn't available in this browser");
else {
  const line = (r) => Object.entries(r).filter(([, ms]) => ms > 0).map(([name, ms]) => `${name} ${ms.toFixed(2)}`).join(", ");
  console.log(`all on: ${line(everything)}`);
  for (const id of CHOSEN) {
    const without = await costs(ALL.filter((f) => f !== id));
    const sum = (r) => Object.values(r).reduce((a, b) => a + b, 0);
    console.log(`without ${id}: ${line(without)}  (saves ${(sum(everything) - sum(without)).toFixed(2)} ms)`);
  }
}

if (SHOTS) {
  await setFeatures(ALL);
  await page.evaluate((hour) => window.__hearthwoodWorld.holdHour(hour), HOURS.golden);
  await page.keyboard.press("Backquote");
  await page.waitForSelector("[data-testid=hearthwood-debug-features]");
  await frames(60);
  const path = join(OUTDIR, "panel.png");
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

await browser.close();
