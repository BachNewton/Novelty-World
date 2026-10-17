// Screenshots of Hearthwood's sky and light, for judging them without a browser open: camp and the sky through the
// day and the year (noon, golden hour, the sun on the horizon, the blue hour, a full-moon and a new-moon night, a
// midsummer night, a midwinter noon), the moon close up at several phases, the stars and the Milky Way overhead, the
// northern lights, noctilucent clouds and a rainbow held on, with the date, the moon and the sun's height of each.
// Optionally each shot again with chosen features off (`--without=`), to see what each adds.
//
// Drives the world's probe (window.__hearthwoodWorld) and the sky's inputs (window.__hearthwoodSky) over
// Playwright and waits on their events (ready, streamed in, frames drawn), never a sleep.
//
// Prereq: a dev server (`npx next dev --port <port>` in a worktree) and `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/sky-shots.mjs [label] [--only=<shot,...>] [--features=<-id,+id,...>] [--without=<id,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "sky"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const ONLY = arg("only")?.split(",") ?? null;
const FEATURES = arg("features");
const WITHOUT = arg("without")?.split(",") ?? [];
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

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
const query = new URLSearchParams({ date: "mabon" });
if (FEATURES !== null) query.set("features", FEATURES);
await page.goto(`${BASE}?${query}`, { waitUntil: "load" });
await page.addStyleTag({
  content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}",
});
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true && window.__hearthwoodSky !== undefined, null, { timeout: 300000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
const ALL = Object.keys(await page.evaluate(() => window.__hearthwoodWorld.features()));
const startingOn = await page.evaluate(() => window.__hearthwoodWorld.features());

await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  world.holdMotion(12);
  world.setView("walk");
  world.setPointOfView("third");
});

/** A night from `from` on, and an hour in it, when the moon is up and about as lit as `lit` (or, for a new moon, when it is down), with the sun well down. */
async function moonNight(from, lit, days = 10) {
  return page.evaluate(
    ({ from, lit, days }) => {
      const world = window.__hearthwoodWorld;
      let best = { day: from, hour: 23 };
      let score = Infinity;
      for (let day = from; day < from + days; day++) {
        for (let hour = 17; hour <= 24; hour += 0.25) {
          world.setDate(day);
          world.holdHour(hour % 24);
          const { sun, moon } = world.sky();
          const s = Math.abs(moon.illuminated - lit) + (lit > 0.05 ? (moon.elevation < 12 ? 1 : 0) : moon.elevation > -5 ? 1 : 0) + (sun.elevation > -14 ? 1 : 0);
          if (s < score) {
            score = s;
            best = { day, hour: hour % 24 };
          }
        }
      }
      return best;
    },
    { from, lit, days },
  );
}

const dayOf = (date) => page.evaluate((d) => {
  window.__hearthwoodWorld.setDate(d);
  return window.__hearthwoodWorld.date().day;
}, date);

const MABON = await dayOf("mabon");
const LITHA = await dayOf("litha");
const YULE = await dayOf("yule");
const FULL = await moonNight(MABON, 1);
const NEW = await moonNight(MABON, 0);
const QUARTER = await moonNight(MABON, 0.5);
const CRESCENT = await moonNight(MABON, 0.2);
const WINTER_DARK = await moonNight(YULE - 4, 0, 9);

/** A free camera at camp a little above the ground, looking along a bearing (degrees from north through east) and up. */
function looking(azimuth, elevation, height = 60) {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return { x: camp.x, y: height, z: camp.z, dx: Math.sin(a) * Math.cos(e), dy: Math.sin(e), dz: -Math.cos(a) * Math.cos(e) };
}

/** Looking at a body in the sky (the sun or the moon). */
const at = (body, height = 30) => ({ body, height });

const SHOTS = [
  { name: "noon-camp", day: MABON, hour: 12.5 },
  { name: "morning-camp", day: MABON, hour: 8 },
  { name: "golden-camp", day: MABON, hour: 17.2 },
  { name: "golden-sun", day: MABON, hour: 17.2, camera: at("sun") },
  { name: "sunset-sun", day: MABON, hour: 18.1, camera: at("sun") },
  { name: "sunset-away", day: MABON, hour: 18.1, camera: looking(90, 12) },
  { name: "blue-hour-west", day: MABON, hour: 18.9, camera: looking(270, 10) },
  { name: "blue-hour-east", day: MABON, hour: 18.9, camera: looking(90, 10) },
  { name: "blue-hour-camp", day: MABON, hour: 19.1 },
  { name: "night-full-camp", ...FULL },
  { name: "night-full-moon", ...FULL, camera: at("moon") },
  { name: "night-new-camp", ...NEW },
  { name: "night-new-sky", ...NEW, camera: looking(0, 55) },
  { name: "night-new-milky-way", ...WINTER_DARK, camera: looking(0, 70) },
  { name: "moon-quarter", ...QUARTER, camera: at("moon"), clip: true },
  { name: "moon-crescent", ...CRESCENT, camera: at("moon"), clip: true },
  { name: "moon-crescent-sky", ...CRESCENT, camera: at("moon") },
  { name: "moon-full", ...FULL, camera: at("moon"), clip: true },
  { name: "aurora", day: MABON + 3, hour: 23.5, camera: looking(350, 18), inputs: { aurora: "on" } },
  { name: "aurora-camp", day: MABON + 3, hour: 23.5, inputs: { aurora: "on" } },
  { name: "noctilucent", day: LITHA + 1, hour: 23.8, camera: looking(0, 8), inputs: { noctilucent: "on" } },
  { name: "midsummer-night", day: LITHA, hour: 22.5, camera: looking(330, 12) },
  { name: "midwinter-noon", day: YULE, hour: 12 },
  { name: "rainbow", day: MABON, hour: 16.6, camera: "rainbow", inputs: { rain: 1 } },
];

async function place(camera) {
  await page.evaluate(
    ({ camera, camp }) => {
      const world = window.__hearthwoodWorld;
      if (!camera) {
        world.setFreeCamera(null);
        return;
      }
      const ground = world.at(camp.x, camp.z).height;
      let dir;
      if (camera === "rainbow") {
        const sun = world.sky().sun.direction;
        const flat = Math.hypot(sun.x, sun.z);
        dir = { x: -sun.x / flat * Math.cos(0.38), y: Math.sin(0.38), z: -sun.z / flat * Math.cos(0.38) };
      } else if (camera.body) dir = world.sky()[camera.body].direction;
      else dir = { x: camera.dx, y: camera.dy, z: camera.dz };
      const y = ground + (camera.height ?? 3);
      world.setFreeCamera({ x: camp.x, y, z: camp.z, lookX: camp.x + dir.x * 100, lookY: y + dir.y * 100, lookZ: camp.z + dir.z * 100 });
    },
    { camera: camera ?? null, camp },
  );
}

async function shoot(shot, suffix, toggles) {
  await page.evaluate(
    ({ shot, toggles }) => {
      const world = window.__hearthwoodWorld;
      for (const [id, on] of Object.entries(toggles)) world.setFeature(id, on);
      Object.assign(window.__hearthwoodSky, { rain: 0, aurora: "seeded", noctilucent: "seeded" }, shot.inputs ?? {});
      world.setDate(shot.day);
      world.holdHour(shot.hour);
    },
    { shot, toggles },
  );
  await place(shot.camera);
  await frames(20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(6);
  const path = join(OUTDIR, `${shot.name}${suffix}.png`);
  const clip = shot.clip ? { x: 700, y: 350, width: 200, height: 200 } : undefined;
  await page.screenshot({ path, clip });
  const facts = await page.evaluate(() => {
    const { sun, moon } = window.__hearthwoodWorld.sky();
    const date = window.__hearthwoodWorld.date();
    return `${date.season} ${date.dayOfSeason}, ${date.hour.toFixed(2)}h: sun ${sun.elevation.toFixed(1)}°, moon ${moon.elevation.toFixed(1)}° ${(moon.illuminated * 100).toFixed(0)}% lit`;
  });
  console.log(`wrote ${path}  (${facts})`);
}

for (const shot of SHOTS.filter((s) => ONLY === null || ONLY.includes(s.name))) {
  await shoot(shot, "", startingOn);
  for (const id of WITHOUT) {
    if (!ALL.includes(id)) throw new Error(`--without names ${id}, which is not a feature`);
    await shoot(shot, `-without-${id}`, { ...startingOn, [id]: false });
  }
}

await browser.close();
