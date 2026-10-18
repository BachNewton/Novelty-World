// Comparison screenshots of two pairs of features that may give the same look twice: the light shafts (`godRays`,
// marched through the shadow maps, against `sunShafts`, smeared across the screen) and the glows (`bloom` against
// `bloomyFog`). Each scene is shot four times from the identical camera, hour, date, weather and held motion clock,
// differing only in the pair's switches (both off, each alone, both on; every other feature on), and the mean
// absolute per-pixel difference (0-255) between the shots is printed.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev) and `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/overlap-glow-shaft-shots.mjs [--only=<scene,...>]
// Writes to src/projects/hearthwood/.shots/overlaps/<pair>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const ONLY = arg("only")?.split(",") ?? null;
const OUT = join(HERE, "..", ".shots", "overlaps");
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";

const PAIRS = {
  "light-shafts": ["godRays", "sunShafts"],
  glows: ["bloom", "bloomyFog"],
};

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", async (error) => {
  console.error(`The world threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
page.on("console", (m) => {
  if (m.type() === "error") console.error("page error:", m.text());
});
await page.goto(`${BASE}?${new URLSearchParams({ date: "mabon" })}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

const MABON = await page.evaluate(() => {
  window.__hearthwoodWorld.setDate("mabon");
  return window.__hearthwoodWorld.date().day;
});

// A night near the equinox when the moon is up high and nearly full, with the sun well down.
const FULL = await page.evaluate((from) => {
  const world = window.__hearthwoodWorld;
  let best = { day: from, hour: 23 };
  let score = Infinity;
  for (let day = from; day < from + 10; day++) {
    for (let hour = 19; hour <= 27; hour += 0.25) {
      world.setDate(day);
      world.holdHour(hour % 24);
      const { sun, moon } = world.sky();
      const s = Math.abs(moon.illuminated - 1) + (moon.elevation < 15 ? 1 : 0) + (moon.elevation > 35 ? 0.5 : 0) + (sun.elevation > -14 ? 1 : 0);
      if (s < score) {
        score = s;
        best = { day, hour: hour % 24 };
      }
    }
  }
  return best;
}, MABON);

// Camp, which a mountain shades from about 14h on at the equinox, so for an evening sun two spots are found near it,
// each open and dry, with nothing on the horizon towards the sun to hide it: one in a glade with dense woods on
// level ground just in front of it (the sun behind their crowns), and one at a meadow's edge with open ground in
// front and a treeline 100-200 m off (the sun just over its tops).
const GOLDEN = 17.2;
const TREELINE = 17.3;
async function findSpot(hour, open, wooded) {
  return page.evaluate(
    ({ day, hour, open, wooded }) => {
      const world = window.__hearthwoodWorld;
      const camp = world.camp();
      world.setDate(day);
      world.holdHour(hour);
      const sun = world.sky().sun;
      const flat = Math.hypot(sun.direction.x, sun.direction.z);
      const ux = sun.direction.x / flat;
      const uz = sun.direction.z / flat;
      const sunAngle = Math.atan2(sun.direction.y, flat);
      for (let r = 0; r <= 3000; r += 40) {
        const around = Math.max(1, Math.round((2 * Math.PI * r) / 40));
        for (let a = 0; a < around; a++) {
          const x = camp.x + Math.cos((a / around) * Math.PI * 2) * r;
          const z = camp.z + Math.sin((a / around) * Math.PI * 2) * r;
          const here = world.at(x, z);
          if (here.woodland > 0.2 || here.water >= here.height - 0.5) continue;
          const along = (ds) => ds.map((d) => world.at(x + ux * d, z + uz * d));
          const level = (ps) => ps.every((p) => Math.abs(p.height - here.height) < 8 && p.water < p.height - 0.5);
          const clear = along(open);
          if (!level(clear) || clear.some((p) => p.woodland > 0.2)) continue;
          const trees = along(wooded);
          const wood = trees.reduce((sum, p) => sum + p.woodland, 0) / trees.length;
          if (wood < 0.6 || !level(trees)) continue;
          let horizon = -1;
          for (let d = 60; d <= 30000; d *= 1.15) horizon = Math.max(horizon, Math.atan2(world.at(x + ux * d, z + uz * d).height - here.height - 3, d));
          if (horizon > sunAngle - 0.015) continue;
          return { x, z, from: Math.hypot(x - camp.x, z - camp.z), wood, horizon: (horizon * 180) / Math.PI, sun: (sunAngle * 180) / Math.PI };
        }
      }
      return null;
    },
    { day: MABON, hour, open, wooded },
  );
}
const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
const spots = { camp, wood: await findSpot(GOLDEN, [], [25, 45, 70, 100]), edge: await findSpot(TREELINE, [20, 45, 70, 90], [120, 150, 180]) };
for (const [name, spot] of Object.entries(spots)) {
  if (spot === null) throw new Error(`No ${name} spot near camp sees the evening sun`);
  if (name !== "camp") console.log(`${name} spot ${spot.x.toFixed(0)}, ${spot.z.toFixed(0)} (${spot.from.toFixed(0)} m from camp), woods ${spot.wood.toFixed(2)}, horizon ${spot.horizon.toFixed(1)}°, sun ${spot.sun.toFixed(1)}°`);
}

// Where the camera stands and what it looks at. `toward` is "sun", "moon" or "fire"; yaw and pitch (radians) nudge
// the look off it, `rise` floors how far up it looks; the eye stands `height` above the ground at `at` moved by dx, dz.
const golden = (pair, name, weather, what) => ({ pair, name, day: MABON, hour: GOLDEN, weather, eye: { at: "wood", height: 1.6 }, look: { toward: "sun", rise: 0.04 }, what });
const treeline = (pair, name, weather, what) => ({ pair, name, day: MABON, hour: TREELINE, weather, eye: { at: "edge", height: 1.6 }, look: { toward: "sun", pitch: 0.06 }, what });
const SCENES = [
  treeline("light-shafts", "treeline-sun-mist", "mist", "a meadow's edge looking west across open ground at the low sun just over a treeline, in mist"),
  { ...treeline("light-shafts", "treeline-sun-clear", "clear", "the same view in clear air, the sun a little higher, just over the treetops"), hour: Number(arg("clear-hour") ?? 17.15), motion: Number(arg("clear-motion") ?? 12) },
  golden("light-shafts", "glade-sun-mist", "mist", "a glade looking west into the low sun behind dense woods' crowns, in mist"),
  {
    pair: "light-shafts",
    name: "morning-camp-mist",
    day: MABON,
    hour: 8,
    weather: "mist",
    eye: { at: "camp", dx: 3.4, dz: 1.5, height: 1.6 },
    look: { toward: "sun", rise: 0.05 },
    what: "camp's edge, looking east into the morning sun through the woods in mist",
  },
  {
    pair: "glows",
    name: "campfire-night-mist",
    day: MABON,
    hour: 21.5,
    weather: "mist",
    eye: { at: "camp", dx: 4.5, dz: 2, height: 1.4 },
    look: { toward: "fire", pitch: -0.05 },
    what: "the campfire from a few steps off at night in mist",
  },
  {
    pair: "glows",
    name: "campfire-night-clear",
    day: MABON,
    hour: 21.5,
    weather: "clear",
    eye: { at: "camp", dx: 4.5, dz: 2, height: 1.4 },
    look: { toward: "fire", pitch: -0.05 },
    what: "the campfire the same, on a clear night",
  },
  treeline("glows", "treeline-sun-mist", "mist", "the low sun just over a treeline, in mist"),
  {
    pair: "glows",
    name: "moon-mist",
    ...FULL,
    weather: "mist",
    eye: { at: "camp", dx: 3.4, dz: 1.5, height: 1.6 },
    look: { toward: "moon" },
    what: "the full moon over the trees from camp, in mist",
  },
];

async function shoot(scene, suffix, toggles) {
  await page.evaluate(
    ({ scene, toggles, spots }) => {
      const world = window.__hearthwoodWorld;
      for (const [id, on] of Object.entries(toggles)) world.setFeature(id, on);
      world.holdWeather(scene.weather);
      world.setDate(scene.day);
      world.holdHour(scene.hour);
      world.holdMotion(scene.motion ?? 12);
      world.setView("walk");
      world.setPointOfView("first");
      const base = spots[scene.eye.at];
      const x = base.x + (scene.eye.dx ?? 0);
      const z = base.z + (scene.eye.dz ?? 0);
      world.placeWalker(x, z);
      const eye = { x, y: world.at(x, z).height + scene.eye.height, z };
      let dir;
      if (scene.look.toward === "fire") {
        const fy = world.at(spots.camp.x, spots.camp.z).height + 0.4;
        dir = { x: spots.camp.x - eye.x, y: fy - eye.y, z: spots.camp.z - eye.z };
      } else {
        const sky = world.sky();
        dir = { ...(scene.look.toward === "sun" ? sky.sun.direction : sky.moon.direction) };
      }
      const flat = Math.hypot(dir.x, dir.z) || 1;
      const yaw = Math.atan2(dir.x, dir.z) + (scene.look.yaw ?? 0);
      let rise = Math.atan2(dir.y, flat) + (scene.look.pitch ?? 0);
      if (scene.look.rise !== undefined) rise = Math.max(rise, scene.look.rise);
      world.setFreeCamera({
        ...eye,
        lookX: eye.x + Math.sin(yaw) * Math.cos(rise) * 100,
        lookY: eye.y + Math.sin(rise) * 100,
        lookZ: eye.z + Math.cos(yaw) * Math.cos(rise) * 100,
      });
    },
    { scene, toggles, spots },
  );
  await frames(40);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(6);
  const path = join(OUT, scene.pair, `${scene.name}__${suffix}.png`);
  await page.screenshot({ path });
  return path;
}

async function pixels(path) {
  return sharp(path).removeAlpha().raw().toBuffer();
}

// The frame meter in the top right corner changes from shot to shot, so it is left out.
const WIDTH = 1600;
const inMeter = (i) => {
  const p = Math.floor(i / 3);
  return p % WIDTH >= 1500 && Math.floor(p / WIDTH) < 60;
};
function meanDiff(a, b) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (inMeter(i)) continue;
    sum += Math.abs(a[i] - b[i]);
    n++;
  }
  return sum / n;
}

for (const pair of Object.keys(PAIRS)) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
  mkdirSync(join(OUT, pair), { recursive: true });
}

const all = await page.evaluate(() => window.__hearthwoodWorld.features());
const everythingOn = Object.fromEntries(Object.keys(all).map((id) => [id, true]));

for (const scene of SCENES.filter((s) => ONLY === null || ONLY.includes(s.name))) {
  const [a, b] = PAIRS[scene.pair];
  const shots = {
    off: await shoot(scene, "off", { ...everythingOn, [a]: false, [b]: false }),
    a: await shoot(scene, a, { ...everythingOn, [a]: true, [b]: false }),
    b: await shoot(scene, b, { ...everythingOn, [a]: false, [b]: true }),
    both: await shoot(scene, "both", { ...everythingOn, [a]: true, [b]: true }),
  };
  const px = Object.fromEntries(await Promise.all(Object.entries(shots).map(async ([k, p]) => [k, await pixels(p)])));
  const facts = await page.evaluate(() => {
    const { sun, moon } = window.__hearthwoodWorld.sky();
    const w = window.__hearthwoodWorld.weather().weather;
    return `sun ${sun.elevation.toFixed(1)}°, moon ${moon.elevation.toFixed(1)}° ${(moon.illuminated * 100).toFixed(0)}% lit, mist ${w.mist.toFixed(2)}, haze ${w.haze.toFixed(2)}`;
  });
  console.log(
    `${scene.pair}/${scene.name} (day ${scene.day}, ${scene.hour.toFixed(2)}h, ${scene.weather}; ${facts})\n` +
      `  off->${a} ${meanDiff(px.off, px.a).toFixed(2)}  off->${b} ${meanDiff(px.off, px.b).toFixed(2)}  ` +
      `${a}->both ${meanDiff(px.a, px.both).toFixed(2)}  ${b}->both ${meanDiff(px.b, px.both).toFixed(2)}  off->both ${meanDiff(px.off, px.both).toFixed(2)}`,
  );
}

await browser.close();
