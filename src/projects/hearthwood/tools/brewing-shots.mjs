// Screenshots of brewing at Hearthwood's campfire, for judging it without a browser open: the card turned to
// brewing and choosing a brew, the cauldron mid-brew at dusk (a tea, a charm), a brew made rising before the fire,
// the card under a full moon, each charm's work in the world (the garland charm's flowers round camp, the lantern
// charm's fireflies over camp at night, the hush about Elliott's feet, the mist-parting charm on a misty morning
// before and after, and the charm post with every charm hanging), and the brew book, on desktop and on the target
// phone (a Pixel 8 Pro in Chrome, portrait, 448x900).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx and
// ../components/valley/brewing-probe.ts) over Playwright and waits on its events (ready, streamed in, frames drawn,
// the brew made), never a sleep. Every shot holds the date, the hour, the weather and the motion clock; a brew
// mid-way is held part-brewed through the probe.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/brewing-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "brewing"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;
const DATE = "mabon";
const DUSK = 18.4;
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 448, height: 900 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

/** What the basket holds for brewing: the herbs, the fly agaric and a few berries. */
const BASKET = [
  ["yarrow", 4],
  ["meadowsweet", 4],
  ["juniper", 3],
  ["fly-agaric", 3],
  ["cloudberry", 2],
  ["lingonberry", 3],
  ["bilberry", 2],
];

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser();

async function openWorld(device) {
  const page = await (await browser.newContext(device)).newPage();
  page.on("pageerror", async (error) => {
    console.error(`The world threw:\n${error.stack ?? error.message}`);
    await browser.close();
    process.exit(1);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page error:", m.text());
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

/** Holds the day, then gives the camera frames to ease where it is going and the world to stream in round it. */
async function capture(page, name, { hour = DUSK, date = DATE, weather = "clear", settle = 150 } = {}) {
  if (!want(name)) return;
  await page.evaluate(
    ({ hour, date, weather, motion }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setDate(date);
      world.holdWeather(weather);
      world.holdMotion(motion);
    },
    { hour, date, weather, motion: MOTION_AT },
  );
  await frames(page, settle);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

/** Elliott a couple of steps from the fire, facing it, with herbs in the basket, sat down and turned to brewing. */
async function sitDown(page) {
  await page.evaluate((basket) => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    world.cooking.leave();
    world.brewing.forget();
    world.forage.forget();
    for (const [kind, n] of basket) world.forage.stock(kind, n);
    const heading = Math.atan2(-3.4, -1.5);
    world.setView("walk");
    world.setFreeCamera(null);
    world.placeWalker(camp.x - Math.sin(heading) * 2.4, camp.z - Math.cos(heading) * 2.4, heading);
    world.setLook({ yaw: heading, pitch: -0.25 });
    world.cooking.open();
    world.brewing.setCraft("brew");
  }, BASKET);
}

async function brewAt(page, name, ingredients, form, held, options) {
  await page.evaluate(
    ({ ingredients, form, held }) => {
      const brewing = window.__hearthwoodWorld.brewing;
      if (brewing.state()?.phase !== "choosing") brewing.again();
      brewing.choose(ingredients, form);
      brewing.hold(held);
      brewing.brew();
    },
    { ingredients, form, held },
  );
  await capture(page, name, options);
  await page.evaluate(() => window.__hearthwoodWorld.brewing.hold(null));
}

async function made(page, name, options) {
  await page.waitForFunction(() => window.__hearthwoodWorld.brewing.state()?.phase === "brewed", null, { timeout: 60000 });
  await capture(page, name, { settle: 90, ...options });
}

/** The first night, from day 0, whose moon is full and up at the hour: where the full moon's blessing can be seen. */
async function fullMoonNight(page) {
  return page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    for (let day = 0; day < 60; day++) {
      for (const hour of [21, 22, 23]) {
        world.setDate(day);
        world.holdHour(hour);
        const { moon, sun } = world.sky();
        if (moon.illuminated >= 0.95 && moon.elevation > 12 && sun.elevation < -8) return { day, hour };
      }
    }
    throw new Error("No full moon in the first sixty days");
  });
}

async function cardShots(device, suffix) {
  const page = await openWorld(device);
  if (device.hasTouch) await page.touchscreen.tap(device.viewport.width * 0.8, device.viewport.height * 0.3);
  await page.evaluate(() => window.__hearthwoodWorld.setPointOfView("first"));
  await sitDown(page);
  await page.evaluate(() => window.__hearthwoodWorld.brewing.choose(["yarrow", "honey"], "tea"));
  await capture(page, `brewing-choose-${suffix}`);
  if (suffix === "desktop") {
    await brewAt(page, "brewing-cauldron-tea-dusk-desktop", ["yarrow", "honey"], "tea", 0.6);
    await made(page, "brewing-made-tea-desktop");
    await brewAt(page, "brewing-cauldron-hush-dusk-desktop", ["meadowsweet", "salt"], "charm", 0.7);
    await made(page, "brewing-made-hush-desktop");
    await brewAt(page, "brewing-cauldron-salve-dusk-desktop", ["fly-agaric", "beeswax"], "salve", 0.5);
    await made(page, "brewing-made-salve-desktop");
    const night = await fullMoonNight(page);
    console.log(`full moon: day ${night.day} at ${night.hour}`);
    await page.evaluate(() => window.__hearthwoodWorld.brewing.again());
    await page.evaluate(() => window.__hearthwoodWorld.brewing.choose(["juniper", "lingonberry", "honey"], "tea"));
    await capture(page, "brewing-full-moon-desktop", { hour: night.hour, date: night.day });
  }
  // The book with a few brews found, one hinted, one moon-blessed and the charms at work.
  await page.evaluate(() => {
    const brewing = window.__hearthwoodWorld.brewing;
    brewing.stock("yarrow-tea", 2);
    brewing.stock("winter-tea", 1, true);
    brewing.stock("yarrow-salve", 1);
    // Charms worked a little while ago, so the book shows them at work on the held clock.
    const days = window.__hearthwoodWorld.date().days;
    brewing.work("bloom", days - 0.6);
    brewing.work("fireflies", days - 0.1);
    brewing.stock("garland-charm");
    brewing.stock("lantern-charm");
    brewing.stock("humble-tea-bilberry");
    brewing.stock("humble-charm-chanterelle");
    brewing.setBookOpen(true);
  });
  await capture(page, `brewing-book-${suffix}`, { settle: 20 });
  await page.evaluate(() => window.__hearthwoodWorld.brewing.setBookOpen(false));
  await page.evaluate(() => window.__hearthwoodWorld.cooking.leave());
  return page;
}

/** The camp seen from across its clearing, Elliott stood to one side, in third person. */
async function lookAtCamp(page, { from = 9, height = 3.2, angle = 2.0 } = {}) {
  await page.evaluate(
    ({ from, height, angle }) => {
      const world = window.__hearthwoodWorld;
      const camp = world.camp();
      const y = world.walker().y;
      world.setFreeCamera({ x: camp.x + Math.cos(angle) * from, y: y + height, z: camp.z + Math.sin(angle) * from, lookX: camp.x, lookY: y + 0.4, lookZ: camp.z });
    },
    { from, height, angle },
  );
}

async function charmShots(page) {
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.brewing.forget();
    world.setPointOfView("third");
    const camp = world.camp();
    world.placeWalker(camp.x + 3.4, camp.z + 1.5, Math.atan2(-3.4, -1.5));
  });
  // Flowers round camp, a little way into the garland charm's days.
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.setDate("mabon");
    world.holdHour(10);
    world.brewing.work("bloom", world.date().days - 0.5);
  });
  await lookAtCamp(page);
  await capture(page, "charm-bloom", { hour: 10 });
  await lookAtCamp(page, { from: 4.2, height: 1.6, angle: 0.9 });
  await capture(page, "charm-bloom-close", { hour: 10 });
  await page.evaluate(() => window.__hearthwoodWorld.brewing.forget());

  // Fireflies over camp tonight.
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.setDate("mabon");
    world.holdHour(22.5);
    world.brewing.work("fireflies", world.date().days - 0.1);
  });
  await lookAtCamp(page, { from: 8, height: 2.4, angle: 2.0 });
  await capture(page, "charm-fireflies", { hour: 22.5 });
  await page.evaluate(() => window.__hearthwoodWorld.brewing.forget());
  await capture(page, "charm-fireflies-without", { hour: 22.5, settle: 20 });

  // The hush about Elliott's feet.
  await page.evaluate((hour) => {
    const world = window.__hearthwoodWorld;
    world.setDate("mabon");
    world.holdHour(hour);
    world.brewing.work("hush", world.date().days - 0.2);
    world.setFreeCamera(null);
    world.setView("walk");
    world.setOrbit({ yaw: Math.atan2(-3.4, -1.5) - 2.2, pitch: 0.36, distance: 3.6 });
  }, 18.6);
  await capture(page, "charm-hush", { hour: 18.6 });
  await page.evaluate(() => window.__hearthwoodWorld.brewing.forget());

  // The mist-parting charm on a misty morning, before and after.
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.setPointOfView("first");
    const camp = world.camp();
    world.placeWalker(camp.x + 3.4, camp.z + 1.5, Math.atan2(3.4, 1.5));
    world.setLook({ yaw: Math.atan2(3.4, 1.5), pitch: 0.02 });
  });
  await capture(page, "charm-clearing-before", { hour: 7, weather: "mist" });
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.brewing.work("clearing", world.date().days - 0.1);
  });
  await capture(page, "charm-clearing-after", { hour: 7, weather: "mist" });

  // The charm post with every charm at work.
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.holdHour(19.6);
    const days = world.date().days - 0.1;
    for (const charm of ["bloom", "fireflies", "hush", "clearing"]) world.brewing.work(charm, days);
    world.setPointOfView("third");
  });
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    const y = world.walker().y;
    world.setFreeCamera({ x: camp.x + 1.05 + 1.6, y: y + 1.3, z: camp.z - 1.25 + 1.2, lookX: camp.x + 1.05, lookY: y + 0.85, lookZ: camp.z - 1.25 });
  });
  await capture(page, "charm-post", { hour: 19.6 });
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.setFreeCamera(null);
    world.brewing.forget();
  });
}

const desktop = await cardShots(DESKTOP, "desktop");
const asked = (prefix) => ONLY === null || ONLY.some((o) => o.startsWith(prefix) || prefix.startsWith(o));
if (asked("charm-")) await charmShots(desktop);
if (ONLY === null || ONLY.some((o) => o.includes("phone"))) await cardShots(PHONE, "phone");

await browser.close();
