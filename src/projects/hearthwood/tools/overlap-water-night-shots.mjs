// Comparison shots for two pairs of Hearthwood features that might paint the same look twice: the water's
// sky reflection and its screen-space reflections, and night vision and the colour grade. Each scene is shot four
// times from one camera, hour, date, weather and held motion clock: both off, each alone, both on (every other
// feature at its default). Prints the mean absolute per-pixel difference (0-255) between the pairs of shots.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server on port 3001 and `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/overlap-water-night-shots.mjs [--only=<scene,...>]
// Writes to src/projects/hearthwood/.shots/overlaps/<pair>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const OUTROOT = join(HERE, "..", ".shots", "overlaps");
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
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

const DEFAULTS = await page.evaluate(() => window.__hearthwoodWorld.features());

// The nearest good lake to camp and a shore point on the camp side of it, as water-shots finds them.
const spots = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  const camp = world.camp();
  const depth = (x, z) => {
    const at = world.at(x, z);
    return { depth: at.water - at.height, water: at.water, height: at.height, river: at.river };
  };
  let lake = null;
  for (let r = 40; r < 3000 && !lake; r += 24) {
    for (let a = 0; a < Math.PI * 2 && !lake; a += 24 / r) {
      const x = camp.x + Math.cos(a) * r;
      const z = camp.z + Math.sin(a) * r;
      const at = depth(x, z);
      if (at.depth > 3 && at.river < 0.1) lake = { x, z, ...at };
    }
  }
  if (!lake) return null;
  const dx = camp.x - lake.x;
  const dz = camp.z - lake.z;
  const len = Math.hypot(dx, dz);
  let shore = null;
  for (let s = 0; s < len; s += 2) {
    const x = lake.x + (dx / len) * s;
    const z = lake.z + (dz / len) * s;
    const at = depth(x, z);
    if (at.depth < -0.4) {
      shore = { x, z, ...at };
      break;
    }
  }
  return { camp, lake, shore, dir: { x: -dx / len, z: -dz / len } };
});
if (!spots?.shore) await fail(`No lake with a shore near camp: ${JSON.stringify(spots)}`);
const { camp, lake, shore, dir } = spots;
const level = lake.water;
console.log(`camp ${camp.x.toFixed(0)}, ${camp.z.toFixed(0)}; lake ${lake.x.toFixed(0)}, ${lake.z.toFixed(0)} (water ${level.toFixed(1)}); shore ${shore.x.toFixed(0)}, ${shore.z.toFixed(0)}`);

/** The day (from mabon on) and hour nearest a full moon well up, with the sun well down. */
const FULL = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  world.setDate("mabon");
  const from = world.date().day;
  let best = { day: from, hour: 23 };
  let score = Infinity;
  for (let day = from; day < from + 30; day++) {
    for (let hour = 20; hour <= 26; hour += 0.25) {
      world.setDate(day);
      world.holdHour(hour % 24);
      const { sun, moon } = world.sky();
      const s = Math.abs(moon.illuminated - 1) + (moon.elevation < 25 ? 1 : 0) + (sun.elevation > -14 ? 1 : 0);
      if (s < score) {
        score = s;
        best = { day, hour: hour % 24 };
      }
    }
  }
  return best;
});

/** Across the lake towards the sun at an hour, low over the water, looking down by `down` metres at 60 m so its glint lies in frame. */
async function sunward(hour, height, down) {
  return page.evaluate(
    ({ lake, level, hour, height, down }) => {
      const world = window.__hearthwoodWorld;
      world.setDate("mabon");
      world.holdHour(hour);
      const { x, z } = world.sky().sun.direction;
      const across = Math.hypot(x, z);
      const back = { x: -x / across, z: -z / across };
      return { x: lake.x + back.x * 45, y: level + height, z: lake.z + back.z * 45, lookX: lake.x - back.x * 60, lookY: level + height - down, lookZ: lake.z - back.z * 60 };
    },
    { lake, level, hour, height, down },
  );
}
const GLINT = await sunward(17.4, 1.2, -1.8);
const AFTERNOON = await sunward(15.5, 1.5, 9);

/** Moonlit open land: a little above camp, looking along the land away from the moon so it lights what we see. */
const MOONLIT = await page.evaluate(
  ({ camp, FULL }) => {
    const world = window.__hearthwoodWorld;
    world.setDate(FULL.day);
    world.holdHour(FULL.hour);
    const { x, z } = world.sky().moon.direction;
    const across = Math.hypot(x, z);
    const away = { x: -x / across, z: -z / across };
    const ground = world.at(camp.x, camp.z).height;
    return { x: camp.x - away.x * 20, y: ground + 14, z: camp.z - away.z * 20, lookX: camp.x + away.x * 200, lookY: ground, lookZ: camp.z + away.z * 200 };
  },
  { camp, FULL },
);

/** Camp's fire from a few metres off, standing height, with the land behind. */
const CAMPFIRE = await page.evaluate(
  ({ camp, dir }) => {
    const world = window.__hearthwoodWorld;
    const ground = world.at(camp.x, camp.z).height;
    const from = { x: camp.x - dir.x * 7, z: camp.z - dir.z * 7 };
    const fromGround = world.at(from.x, from.z).height;
    return { x: from.x, y: fromGround + 2.2, z: from.z, lookX: camp.x + dir.x * 10, lookY: ground + 0.6, lookZ: camp.z + dir.z * 10 };
  },
  { camp, dir },
);

const WATER = ["skyReflection", "screenSpaceReflections"];
const NIGHT = ["nightVision", "colourGrade"];

const SCENES = [
  {
    pair: "water-reflections", ids: WATER, name: "lake-noon", date: "mabon", hour: 12.5, weather: "clear",
    camera: { x: shore.x, y: shore.height + 1.0, z: shore.z, lookX: lake.x + dir.x * 60, lookY: level + 1.5, lookZ: lake.z + dir.z * 60 },
  },
  { pair: "water-reflections", ids: WATER, name: "lake-afternoon-sunward", date: "mabon", hour: 15.5, weather: "fair", camera: AFTERNOON },
  { pair: "water-reflections", ids: WATER, name: "lake-golden-glint", date: "mabon", hour: 17.4, weather: "clear", camera: GLINT },
  { pair: "night-colour", ids: NIGHT, name: "moonlit-land", date: FULL.day, hour: FULL.hour, weather: "clear", camera: MOONLIT },
  { pair: "night-colour", ids: NIGHT, name: "camp-fire-night", date: FULL.day, hour: FULL.hour, weather: "clear", camera: CAMPFIRE },
  { pair: "night-colour", ids: NIGHT, name: "blue-hour", date: "mabon", hour: 19.4, weather: "clear", camera: MOONLIT },
];

async function shoot(scene, on, path) {
  await page.evaluate(
    ({ scene, on, defaults }) => {
      const world = window.__hearthwoodWorld;
      for (const [id, value] of Object.entries(defaults)) world.setFeature(id, value);
      for (const [id, value] of Object.entries(on)) world.setFeature(id, value);
      world.holdMotion(12);
      world.holdWeather(scene.weather);
      world.setDate(scene.date);
      world.holdHour(scene.hour);
      world.setFreeCamera(scene.camera);
    },
    { scene, on, defaults: DEFAULTS },
  );
  await frames(20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(6);
  await page.screenshot({ path });
}

async function pixels(path) {
  return sharp(path).removeAlpha().raw().toBuffer();
}
function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

for (const scene of SCENES.filter((s) => ONLY === null || ONLY.includes(s.name))) {
  const outdir = join(OUTROOT, scene.pair);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
  mkdirSync(outdir, { recursive: true });
  const [a, b] = scene.ids;
  const variants = { off: [false, false], [a]: [true, false], [b]: [false, true], both: [true, true] };
  const paths = {};
  for (const [label, [onA, onB]] of Object.entries(variants)) {
    paths[label] = join(outdir, `${scene.name}__${label}.png`);
    await shoot(scene, { [a]: onA, [b]: onB }, paths[label]);
    console.log(`wrote ${paths[label]}`);
  }
  const facts = await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const { sun, moon } = world.sky();
    const date = world.date();
    return `${date.season} ${date.dayOfSeason} (day ${date.day}), ${date.hour.toFixed(2)}h, ${world.weather().kind ?? ""}: sun ${sun.elevation.toFixed(1)}°, moon ${moon.elevation.toFixed(1)}° ${(moon.illuminated * 100).toFixed(0)}% lit`;
  });
  const px = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([k, p]) => [k, await pixels(p)])));
  console.log(`${scene.name}: ${facts}; camera ${JSON.stringify(Object.fromEntries(Object.entries(scene.camera).map(([k, v]) => [k, Math.round(v * 10) / 10])))}`);
  console.log(
    `  diff off-vs-${a} ${meanDiff(px.off, px[a]).toFixed(2)}, off-vs-${b} ${meanDiff(px.off, px[b]).toFixed(2)}, ${a}-vs-both ${meanDiff(px[a], px.both).toFixed(2)}, ${b}-vs-both ${meanDiff(px[b], px.both).toFixed(2)}`,
  );
}

await browser.close();
