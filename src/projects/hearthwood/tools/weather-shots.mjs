// The weather and the air, for judging them without a browser open: each held weather (see ../engine/weather.ts)
// at chosen hours, from a few views: camp from behind Elliott (`camp`), a high spot near camp looking out over
// the land to the horizon (`vista`), the sky from camp (`sky`), the ground at Elliott's feet through their eyes
// (`ground`), the sun low through the trees (`trees`), and up at the sun from the high spot (`sun`); `--flash` holds
// storm shots on a flash of lightning. Prints the weather each shot was drawn in.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/weather-shots.mjs [label] [--weather=<kind,...>] [--hours=<name,...>]
//           [--views=<view,...>] [--features=<-id,+id,none,...>] [--date=<date>] [--motion=<seconds>] [--flash]
// Hours by name: dawn, morning, noon, golden, blue, night, or a number. Writes to
// src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const [LABEL = "weather"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const WEATHERS = arg("weather", "clear,fair,mist,rain").split(",");
const HOUR_NAMES = { dawn: 6.2, morning: 8.5, noon: 12.5, golden: 17.4, blue: 19.4, night: 23 };
const HOURS = arg("hours", "morning,noon,golden,night")
  .split(",")
  .map((h) => [h, HOUR_NAMES[h] ?? Number(h)]);
const VIEWS = arg("views", "camp,vista,sky").split(",");
const FEATURES = arg("features", null);
const DATE = arg("date", "mabon");
const MOTION = Number(arg("motion", "12"));
// --flash: storm shots wait for a flash of lightning.
const FLASH = process.argv.includes("--flash");
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", async (error) => {
  console.error(`The world threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.error(`page ${m.type()}:`, m.text());
});
const query = new URLSearchParams({ date: DATE });
if (FEATURES !== null) query.set("features", FEATURES);
await page.goto(`${BASE}?${query}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

// A high open spot within a kilometre or so of camp, and the way out from it over the lowest land.
const spots = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  const camp = world.camp();
  let high = { x: camp.x, z: camp.z, height: world.at(camp.x, camp.z).height };
  for (let r = 100; r <= 1400; r += 100) {
    for (let a = 0; a < 24; a++) {
      const x = camp.x + Math.cos((a / 24) * Math.PI * 2) * r;
      const z = camp.z + Math.sin((a / 24) * Math.PI * 2) * r;
      const here = world.at(x, z);
      if (here.height > high.height && here.water < here.height && here.woodland < 0.3) high = { x, z, height: here.height };
    }
  }
  let low = null;
  for (let a = 0; a < 24; a++) {
    const angle = (a / 24) * Math.PI * 2;
    const far = world.at(high.x + Math.cos(angle) * 3000, high.z + Math.sin(angle) * 3000);
    if (low === null || far.height < low.height) low = { angle, height: far.height };
  }
  return { camp, high, angle: low.angle };
});
console.log(`vista from ${spots.high.x.toFixed(0)}, ${spots.high.z.toFixed(0)} at ${spots.high.height.toFixed(0)} m`);

const VIEW_SETUP = {
  camp: ({ camp }) => ({ view: "walk", pov: "third", walker: { x: camp.x + 3.4, z: camp.z + 1.5, heading: Math.atan2(-3.4, -1.5) }, orbit: { yaw: Math.atan2(-3.4, -1.5), pitch: 0.2, distance: 7 } }),
  vista: ({ high, angle }) => ({
    view: "walk",
    pov: "third",
    walker: { x: high.x, z: high.z },
    free: { x: high.x, y: high.height + 12, z: high.z, lookX: high.x + Math.cos(angle) * 4000, lookY: high.height - 120, lookZ: high.z + Math.sin(angle) * 4000 },
  }),
  sky: ({ camp }) => ({ view: "walk", pov: "first", look: { pitch: 0.55 }, walker: { x: camp.x + 3.4, z: camp.z + 1.5 } }),
  ground: ({ camp }) => ({ view: "walk", pov: "first", look: { pitch: -0.45 }, walker: { x: camp.x + 9, z: camp.z + 6 } }),
  trees: ({ camp }) => ({ view: "walk", pov: "first", look: { pitch: 0.12 }, walker: { x: camp.x + 3.4, z: camp.z + 1.5 } }),
  sun: ({ high }) => ({ view: "walk", pov: "first", walker: { x: high.x, z: high.z } }),
};

for (const weather of WEATHERS) {
  for (const viewName of VIEWS) {
    const setup = VIEW_SETUP[viewName](spots);
    for (const [hourName, hour] of HOURS) {
      await page.evaluate(
        ({ weather, hour, motion, setup, viewName }) => {
          const world = window.__hearthwoodWorld;
          world.holdWeather(weather === "drift" ? null : weather);
          world.holdHour(hour);
          world.holdMotion(motion);
          world.setView(setup.view);
          world.setPointOfView(setup.pov);
          world.setFreeCamera(setup.free ?? null);
          if (setup.walker) world.placeWalker(setup.walker.x, setup.walker.z, setup.walker.heading);
          if (setup.orbit) world.setOrbit(setup.orbit);
          if (setup.look) world.setLook(setup.look);
          // The trees and sun views look towards the sun (or the moon), wherever it is: through the trees from camp, and from the high spot.
          if (viewName === "trees" || viewName === "sun") {
            const sun = world.sky().key.direction;
            const at = world.walker();
            const eye = { x: at.x, y: at.y + 1.6, z: at.z };
            const rise = viewName === "sun" ? Math.max(sun.y, 0.12) : Math.max(sun.y, 0.05);
            const flat = Math.hypot(sun.x, sun.z) || 1;
            world.setFreeCamera({ ...eye, lookX: eye.x + (sun.x / flat) * 100, lookY: eye.y + rise * 100, lookZ: eye.z + (sun.z / flat) * 100 });
          }
        },
        { weather, hour, motion: MOTION, setup, viewName },
      );
      await frames(40);
      await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
      await frames(6);
      // In a storm, the motion clock is moved on to the next flash of lightning, so the shot shows one.
      if (weather === "storm" && FLASH) {
        for (let t = MOTION; t < MOTION + 90; t += 0.1) {
          await page.evaluate((t) => window.__hearthwoodWorld.holdMotion(t), t);
          await frames(2);
          if ((await page.evaluate(() => window.__hearthwoodWorld.weather().flash)) > 0.5) break;
        }
      }
      const wanted = await page.evaluate(() => window.__hearthwoodWorld.weather());
      const path = join(OUTDIR, `${weather}-${viewName}-${hourName}.png`);
      await page.screenshot({ path });
      const w = wanted.weather;
      console.log(
        `wrote ${path}  ${w.temperature.toFixed(1)}°C  humidity ${w.humidity.toFixed(2)}  cloud ${w.cloudCover.toFixed(2)}  rain ${w.precipitation.toFixed(2)} (snow ${w.snow.toFixed(2)})  mist ${w.mist.toFixed(2)}  haze ${w.haze.toFixed(2)}  wet ${w.wetness.toFixed(2)}  floor ${wanted.floor.toFixed(0)} m`,
      );
    }
  }
}

await browser.close();
