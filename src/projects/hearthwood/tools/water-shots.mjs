// Hearthwood's water (see ../features/water.ts) from headless screenshots: a lake found near camp from its
// shore, from above its shallows, from under its surface looking up and along, a river, the lake in deep
// winter, and the lakes of the far land from a height, at noon, golden hour, blue hour and night, with every
// feature on and with every water feature off; and the lake from its shore with each water feature off alone.
// Any shader that fails to compile fails the run.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/water-shots.mjs [label] [--only=<view,...>] [--hours=<moment,...>] [--each] [--costs] [--no-shots]
// Views: shore, shallows, under, river, winter, far, and glint (across the lake into the low sun and the moon). --each adds the shore with each water feature off alone;
// --costs prints the GPU time of each part of the frame from the shore at golden hour, with every feature on
// and with each water feature off, the median of a stretch of frames.
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "water"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3).split(",") ?? null;
const ONLY = option("only");
const MOMENTS = option("hours");
const EACH = process.argv.includes("--each");
const COSTS = process.argv.includes("--costs");
const SHOTS = !process.argv.includes("--no-shots");
const COST_SAMPLES = 60;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const HOURS = { noon: 12.5, golden: 17.4, blue: 19.4, night: 23 };
const CHOSEN_HOURS = Object.entries(HOURS).filter(([moment]) => MOMENTS === null || MOMENTS.includes(moment));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
async function fail(message) {
  console.error(message);
  await browser.close();
  process.exit(1);
}
page.on("pageerror", (error) => fail(`The world threw:\n${error.stack ?? error.message}`));
page.on("console", (message) => {
  if (message.type() === "error" && /shader|program|glsl/i.test(message.text())) void fail(`A shader failed:\n${message.text()}`);
});
await page.goto(`${BASE}?date=mabon`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

const ALL = await page.evaluate(() => Object.keys(window.__hearthwoodWorld.features()));
const WATER = ["ripples", "rippleParallax", "waterAbsorption", "shoreHighlight", "skyReflection", "refraction", "screenSpaceReflections", "caustics", "underwaterFog", "snellsWindow", "farWater", "lakeIce"];

async function setFeatures(on) {
  await page.evaluate((on) => {
    const world = window.__hearthwoodWorld;
    for (const id of Object.keys(world.features())) world.setFeature(id, on.includes(id));
  }, on);
}

// The nearest good lake to camp: deep in its middle, with a shore point and a shallow point found by walking out from it.
const spots = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  const camp = world.camp();
  const depth = (x, z) => {
    const at = world.at(x, z);
    return { depth: at.water - at.height, water: at.water, height: at.height, river: at.river };
  };
  let lake = null;
  let river = null;
  for (let r = 40; r < 3000 && (!lake || !river); r += 24) {
    for (let a = 0; a < Math.PI * 2; a += 24 / r) {
      const x = camp.x + Math.cos(a) * r;
      const z = camp.z + Math.sin(a) * r;
      const at = depth(x, z);
      if (!lake && at.depth > 3 && at.river < 0.1) lake = { x, z, ...at };
      if (!river && at.river > 0.8 && at.depth > 0.2) river = { x, z, ...at };
    }
  }
  if (!lake) return null;
  // Walk from the lake's middle towards camp until dry ground, for the shore.
  const dx = camp.x - lake.x;
  const dz = camp.z - lake.z;
  const len = Math.hypot(dx, dz);
  let shore = null;
  let shallow = null;
  for (let s = 0; s < len; s += 2) {
    const x = lake.x + (dx / len) * s;
    const z = lake.z + (dz / len) * s;
    const at = depth(x, z);
    if (!shallow && at.depth < 1.2) shallow = { x, z, ...at };
    if (at.depth < -0.4) {
      shore = { x, z, ...at };
      break;
    }
  }
  // A big lake out in the far land, beyond where water is drawn in full, to look out at from a height.
  let far = null;
  for (let r = 3000; r < 12000 && !far; r += 150) {
    for (let a = 0; a < Math.PI * 2 && !far; a += 150 / r) {
      const x = camp.x + Math.cos(a) * r;
      const z = camp.z + Math.sin(a) * r;
      const at = depth(x, z);
      if (at.depth > 4) far = { x, z, water: at.water, back: { x: Math.cos(a), z: Math.sin(a) } };
    }
  }
  return { lake, shore, shallow, river, far, dir: { x: -dx / len, z: -dz / len } };
});
if (!spots?.shore || !spots.shallow) await fail(`No lake with a shore near camp: ${JSON.stringify(spots)}`);
console.log(`far lake ${spots.far ? `at ${spots.far.x.toFixed(0)}, ${spots.far.z.toFixed(0)}` : "none found"}`);
console.log(`lake at ${spots.lake.x.toFixed(0)}, ${spots.lake.z.toFixed(0)} (${spots.lake.depth.toFixed(1)} m deep, water at ${spots.lake.water.toFixed(1)}); river ${spots.river ? `at ${spots.river.x.toFixed(0)}, ${spots.river.z.toFixed(0)}` : "none found"}`);

const { lake, shore, shallow, river, far, dir } = spots;
const level = lake.water;
const VIEWS = {
  shore: { x: shore.x, y: shore.height + 1.7, z: shore.z, lookX: lake.x + dir.x * 40, lookY: level + 2, lookZ: lake.z + dir.z * 40 },
  shallows: { x: shallow.x - dir.x * 10, y: level + 5, z: shallow.z - dir.z * 10, lookX: shallow.x + dir.x * 6, lookY: level - 1, lookZ: shallow.z + dir.z * 6 },
  under: { x: lake.x - dir.x * 6, y: level - 2, z: lake.z - dir.z * 6, lookX: lake.x + dir.x * 4, lookY: level + 8, lookZ: lake.z + dir.z * 4 },
  river: river ? { x: river.x + 6, y: river.water + 2.2, z: river.z + 6, lookX: river.x - 10, lookY: river.water - 1, lookZ: river.z - 10 } : null,
  winter: { x: shore.x, y: shore.height + 4, z: shore.z, lookX: lake.x, lookY: level - 4, lookZ: lake.z },
  far: far ? { x: far.x - far.back.x * 4500, y: far.water + 650, z: far.z - far.back.z * 4500, lookX: far.x, lookY: far.water, lookZ: far.z } : null,
};

await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  world.holdMotion(12);
});

/** Across the lake towards a body low in the sky (the sun or the moon), on a date and hour when it is up, so its glint lies on the water. */
async function towards(body, hour, dates) {
  for (const date of dates) {
    const sky = await page.evaluate(
      ({ date, hour }) => {
        const world = window.__hearthwoodWorld;
        world.setDate(date);
        world.holdHour(hour);
        return world.sky();
      },
      { date, hour },
    );
    const { x, y, z } = sky[body].direction;
    if (y < 0.08 || y > 0.5) continue;
    const across = Math.hypot(x, z);
    const back = { x: -x / across, z: -z / across };
    return { date, view: { x: lake.x + back.x * 45, y: level + 1.8, z: lake.z + back.z * 45, lookX: lake.x - back.x * 60, lookY: level + 4, lookZ: lake.z - back.z * 60 } };
  }
  return null;
}

async function shoot(name, view, hour, date = "mabon") {
  await page.evaluate(
    ({ view, hour, date }) => {
      const world = window.__hearthwoodWorld;
      world.setDate(date);
      world.holdHour(hour);
      world.setFreeCamera(view);
    },
    { view, hour, date },
  );
  // A switched feature recompiles its materials and makes or frees its passes: let that settle into drawn frames.
  await frames(20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

const chosen = Object.entries(VIEWS).filter(([name, view]) => SHOTS && view !== null && (ONLY === null || ONLY.includes(name)));
for (const [label, on] of [["on", ALL], ["off", ALL.filter((id) => !WATER.includes(id))]]) {
  await setFeatures(on);
  for (const [name, view] of chosen) {
    const date = name === "winter" ? "yule" : "mabon";
    for (const [moment, hour] of CHOSEN_HOURS) await shoot(`${name}-${moment}-${label}`, view, name === "winter" && moment === "noon" ? 12 : hour, date);
  }
}

if (SHOTS && (ONLY === null || ONLY.includes("glint"))) {
  await setFeatures(ALL);
  const sun = await towards("sun", HOURS.golden, ["mabon", "litha", "ostara"]);
  if (sun) await shoot("glint-golden-on", sun.view, HOURS.golden, sun.date);
  const days = Array.from({ length: 28 }, (_, i) => i);
  const moon = await towards("moon", 23, days);
  if (moon) await shoot("moonlit-night-on", moon.view, 23, moon.date);
}

if (EACH) {
  for (const id of WATER) {
    await setFeatures(ALL.filter((f) => f !== id));
    await shoot(`shore-golden-without-${id}`, VIEWS.shore, HOURS.golden);
  }
}

/** The median of each span's readings over a stretch of frames: other work on the machine makes single readings jump. */
async function costs(on) {
  await setFeatures(on);
  await page.evaluate(() => window.__hearthwoodWorld.watchCosts(true));
  await frames(30);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
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

if (COSTS) {
  await page.evaluate(
    ({ view, hour }) => {
      const world = window.__hearthwoodWorld;
      world.setDate("mabon");
      world.holdHour(hour);
      world.setFreeCamera(view);
    },
    { view: VIEWS.shore, hour: HOURS.golden },
  );
  // Each feature off is timed beside everything on, just before it, so the machine's own drift between the two stays small.
  const sum = (r) => Object.values(r).reduce((a, b) => a + b, 0);
  const line = (r) => Object.entries(r).filter(([, ms]) => ms > 0).map(([name, ms]) => `${name} ${ms.toFixed(2)}`).join(", ");
  for (const [label, off] of [["all water", WATER], ...WATER.map((id) => [id, [id]])]) {
    const everything = await costs(ALL);
    if (everything === null) {
      console.log("GPU timing isn't available in this browser");
      break;
    }
    const without = await costs(ALL.filter((f) => !off.includes(f)));
    console.log(`without ${label}: saves ${(sum(everything) - sum(without)).toFixed(2)} ms  [on: ${line(everything)}]  [off: ${line(without)}]`);
  }
}
await browser.close();
