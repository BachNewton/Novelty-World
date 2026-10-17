// Hearthwood's shadows and foliage (see ../art/shadows and ../art/foliage), for judging them without a browser open:
// camp at noon, golden hour, blue hour and by moonlight; shadows at Elliott's feet up close; a wood with the sun
// behind it (the light through leaves); the land from a ridge at golden hour (the far shadows and the far slopes);
// the same under cloud; and Elliott standing in a meadow (the plants parting). `--features=` sets the switches for
// every shot, as `?features=` does.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/shadow-shots.mjs [label] [--only=<prefix,...>] [--features=<list>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "shadows"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const FEATURES = process.argv.find((arg) => arg.startsWith("--features="))?.slice("--features=".length) ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const HOURS = { noon: 12.5, afternoon: 15, golden: 17.4, blue: 19.4, night: 23 };

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

async function open(extra = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  page.on("pageerror", async (error) => {
    console.error(`The world threw:\n${error.stack ?? error.message}`);
    await browser.close();
    process.exit(1);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.error(`page ${m.type()}:`, m.text().slice(0, 4000));
  });
  const query = new URLSearchParams({ date: "mabon", ...extra });
  if (FEATURES !== null) query.set("features", FEATURES);
  await page.goto(`${BASE}?${query}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
  await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(12));
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

async function shoot(page, name, setup) {
  if (!want(name)) return;
  await page.evaluate(setup.fn, setup.arg ?? null);
  await frames(page, 40);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

const page = await open();
const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());

for (const [moment, hour] of Object.entries(HOURS)) {
  await shoot(page, `camp-${moment}`, {
    fn: (hour) => {
      const world = window.__hearthwoodWorld;
      world.setFreeCamera(null);
      world.holdHour(hour);
      world.setView("walk");
      world.setPointOfView("third");
    },
    arg: hour,
  });
}

for (const [moment, hour] of [
  ["noon", HOURS.noon],
  ["golden", HOURS.golden],
]) {
  await shoot(page, `feet-${moment}`, {
    fn: ({ hour, camp }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setPointOfView("third");
      const w = world.walker();
      world.setFreeCamera({ x: w.x + 2.2, y: w.y + 1.6, z: w.z + 2.4, lookX: (w.x + camp.x) / 2, lookY: w.y + 0.2, lookZ: (w.z + camp.z) / 2 });
    },
    arg: { hour, camp },
  });
}

// A wood, from inside it, looking towards the low sun.
const wood = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  for (let r = 60; r < 3000; r += 40) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const here = world.at(x, z);
      if (here.woodland > 0.55 && here.water <= here.height && here.mountainous < 0.4) return { x, z, y: here.height };
    }
  }
  return null;
});
if (wood) {
  for (const [moment, hour] of [
    ["golden", 17.6],
    ["noon", HOURS.noon],
  ]) {
    await shoot(page, `wood-${moment}`, {
      fn: ({ hour, wood }) => {
        const world = window.__hearthwoodWorld;
        world.holdHour(hour);
        const d = world.sky().key.direction;
        const flat = Math.hypot(d.x, d.z) || 1;
        world.setFreeCamera({ x: wood.x, y: wood.y + 1.7, z: wood.z, lookX: wood.x + (d.x / flat) * 40, lookY: wood.y + 6, lookZ: wood.z + (d.z / flat) * 40 });
      },
      arg: { hour, wood },
    });
  }
}

// The land from high up at golden hour, across the light, with the light behind, and towards it.
const ridge = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  let best = null;
  for (let x = -2500; x <= 2500; x += 125) {
    for (let z = -2500; z <= 2500; z += 125) {
      const h = world.at(x, z).height;
      if (!best || h > best.y) best = { x, z, y: h };
    }
  }
  return best;
});
for (const [name, turn] of [
  ["ridge-across", Math.PI / 2],
  ["ridge-away", Math.PI],
]) {
  await shoot(page, name, {
    fn: ({ ridge, turn }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(17.2);
      const d = world.sky().key.direction;
      const a = Math.atan2(d.z, d.x) + turn;
      world.setFreeCamera({ x: ridge.x, y: ridge.y + 60, z: ridge.z, lookX: ridge.x + Math.cos(a) * 1000, lookY: ridge.y - 200, lookZ: ridge.z + Math.sin(a) * 1000 });
    },
    arg: { ridge, turn },
  });
}

// The edge of the wood round camp with the low sun behind it: the light through the leaves.
for (const [name, hour] of [
  ["edge-backlit", 16.4],
  ["edge-backlit-late", 17.2],
]) {
  await shoot(page, name, {
    fn: ({ hour, camp }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      const d = world.sky().key.direction;
      const flat = Math.hypot(d.x, d.z) || 1;
      const y = world.at(camp.x, camp.z).height;
      world.setFreeCamera({ x: camp.x - (d.x / flat) * 6, y: y + 1.6, z: camp.z - (d.z / flat) * 6, lookX: camp.x + (d.x / flat) * 40, lookY: y + 7, lookZ: camp.z + (d.z / flat) * 40 });
    },
    arg: { hour, camp },
  });
}

// Elliott standing in a berry patch, from close by: the bushes part round their feet.
const patch = await page.evaluate(({ camp }) => {
  const world = window.__hearthwoodWorld;
  world.forage.setDayOfYear(220);
  const spots = world.forage.spotsNear(camp.x, camp.z, 400);
  return spots.find((s) => /berry/.test(s.kind)) ?? null;
}, { camp });
if (patch) {
  for (const [name, at] of [
    ["parting-in", 0.3],
    ["parting-beside", 2.6],
  ]) {
    await shoot(page, name, {
      fn: ({ patch, at }) => {
        const world = window.__hearthwoodWorld;
        world.holdHour(13);
        world.setFreeCamera(null);
        world.setView("walk");
        world.setPointOfView("third");
        world.placeWalker(patch.x + at, patch.z, Math.PI / 2);
        world.setOrbit({ distance: 3, pitch: 0.45 });
      },
      arg: { patch, at },
    });
  }
}

await page.close();

if (ONLY === null || ONLY.some((o) => "overcast".startsWith(o) || o.startsWith("overcast"))) {
  const cloudy = await open({ clouds: "0.8", wind: "0.8" });
  await shoot(cloudy, "overcast-camp", {
    fn: () => {
      const world = window.__hearthwoodWorld;
      world.holdHour(14);
      world.setView("walk");
      world.setPointOfView("third");
    },
  });
}

await browser.close();
