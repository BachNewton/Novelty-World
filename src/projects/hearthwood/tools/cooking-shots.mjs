// Screenshots of cooking at Hearthwood's campfire, for judging it without a browser open: the card for choosing,
// the hearth's view mid-cooking at dusk in the pan, the pot and on the stick, the dish served rising before the
// fire, the recipe book, on desktop and on the target phone (a Pixel 8 Pro in Chrome, portrait), and a stray cat
// given its favourite dish (the prompt holding the dish out, then the hearts and the naming card).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx) over Playwright and
// waits on its events (ready, streamed in, frames drawn, the dish served), never a sleep. Every shot holds the date,
// the hour, the weather and the motion clock; a dish mid-cooking is held part-cooked through the probe.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/cooking-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "cooking"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;
const DATE = "mabon";
const DUSK = 18.4;
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 448, height: 870 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

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
async function capture(page, name, { hour = DUSK, settle = 150 } = {}) {
  if (!want(name)) return;
  await page.evaluate(
    ({ hour, date, motion }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setDate(date);
      world.holdWeather("clear");
      world.holdMotion(motion);
    },
    { hour, date: DATE, motion: MOTION_AT },
  );
  await frames(page, settle);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

/** Elliott a couple of steps from the fire, facing it, with something from the forest in the basket. */
async function sitDown(page) {
  return page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    world.cooking.leave();
    world.cooking.forget();
    world.forage.forget();
    for (const [kind, n] of [["bilberry", 4], ["lingonberry", 3], ["cloudberry", 2], ["chanterelle", 5], ["porcini", 3], ["wild-strawberry", 2], ["raspberry", 2]]) world.forage.stock(kind, n);
    const heading = Math.atan2(-3.4, -1.5);
    world.setView("walk");
    world.setFreeCamera(null);
    world.placeWalker(camp.x - Math.sin(heading) * 2.4, camp.z - Math.cos(heading) * 2.4, heading);
    world.setLook({ yaw: heading, pitch: -0.25 });
    world.cooking.open();
    return camp;
  });
}

async function cookAt(page, name, ingredients, cookware, held) {
  await page.evaluate(
    ({ ingredients, cookware, held }) => {
      const cooking = window.__hearthwoodWorld.cooking;
      if (cooking.state()?.phase !== "choosing") cooking.again();
      cooking.choose(ingredients, cookware);
      cooking.hold(held);
      cooking.cook();
    },
    { ingredients, cookware, held },
  );
  await capture(page, name);
  await page.evaluate(() => window.__hearthwoodWorld.cooking.hold(null));
}

async function served(page, name) {
  await page.waitForFunction(() => window.__hearthwoodWorld.cooking.state()?.phase === "served", null, { timeout: 60000 });
  await capture(page, name, { settle: 90 });
}

async function hearthShots(device, suffix) {
  const page = await openWorld(device);
  if (device.hasTouch) await page.touchscreen.tap(device.viewport.width * 0.8, device.viewport.height * 0.3);
  await page.evaluate(() => window.__hearthwoodWorld.setPointOfView("first"));
  await sitDown(page);
  await page.evaluate(() => window.__hearthwoodWorld.cooking.choose(["bilberry", "flour", "butter"], "pan"));
  await capture(page, `cooking-choose-${suffix}`);
  await cookAt(page, `cooking-pan-dusk-${suffix}`, ["bilberry", "flour", "butter"], "pan", 0.5);
  await served(page, `cooking-served-${suffix}`);
  if (suffix === "desktop") {
    await cookAt(page, "cooking-pot-dusk-desktop", ["porcini", "chanterelle", "cream"], "pot", 0.5);
    await served(page, "cooking-served-soup-desktop");
    await cookAt(page, "cooking-stick-dusk-desktop", ["lingonberry", "flour", "honey"], "stick", 0.5);
    await served(page, "cooking-served-stick-bread-desktop");
    await cookAt(page, "cooking-pan-humble-desktop", ["raspberry", "eggs"], "pan", 0.5);
    await served(page, "cooking-served-humble-desktop");
  }
  await page.evaluate(() => window.__hearthwoodWorld.cooking.setBookOpen(true));
  await capture(page, `cooking-book-${suffix}`, { settle: 20 });
  await page.evaluate(() => window.__hearthwoodWorld.cooking.setBookOpen(false));
  await page.evaluate(() => window.__hearthwoodWorld.cooking.leave());
  return page;
}

async function catShots(page) {
  // A stray cat near camp, given its favourite dish.
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.companions.forget();
    world.forage.forget();
    world.cooking.forget();
    world.holdMotion(null);
    world.holdHour(10.5);
    const camp = world.camp();
    world.placeWalker(camp.x + 3.4, camp.z + 1.5, 0);
  });
  await frames(page, 10);
  const cat = await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    return world.companions
      .animals()
      .filter((a) => a.kind === "stray" && a.species === "cat")
      .sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z))[0];
  });
  if (!cat) throw new Error("No stray cat near camp");
  console.log(`cat ${cat.key}: favourite dish ${cat.favourite}`);
  const stand = await page.evaluate((cat) => {
    const world = window.__hearthwoodWorld;
    world.cooking.stock(cat.favourite, 1);
    world.forage.stock("bilberry", 2);
    const heading = Math.atan2(cat.x - (cat.x + 1.4), cat.z - cat.z);
    const at = { x: cat.x + 1.4, z: cat.z, heading };
    world.placeWalker(at.x, at.z, heading);
    world.companions.place(cat.key, cat.x, cat.z, heading + Math.PI, "sit");
    world.setPointOfView("first");
    world.setLook({ yaw: heading, pitch: -0.62 });
    return at;
  }, cat);
  await page.waitForFunction((key) => window.__hearthwoodWorld.companions.settled(1, key), cat.key, { timeout: 120000 });
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  await capture(page, "cooking-cat-offered", { hour: 10.5, settle: 20 });
  const offer = await page.evaluate(() => window.__hearthwoodWorld.companions.offer());
  console.log(`offered: ${JSON.stringify(offer)}`);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(null));
  await page.evaluate((key) => window.__hearthwoodWorld.companions.treat(key), cat.key);
  await frames(page, 24);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  const path = join(OUTDIR, "cooking-cat-given.png");
  await page.screenshot({ path });
  console.log(`wrote ${path} (Elliott at ${stand.x.toFixed(1)}, ${stand.z.toFixed(1)})`);
}

const desktop = await hearthShots(DESKTOP, "desktop");
if (want("cooking-cat")) await catShots(desktop);
if (want("cooking-") && (ONLY === null || ONLY.some((o) => o.includes("phone")))) await hearthShots(PHONE, "phone");

await browser.close();
