// Screenshots of the mysteries, for judging them without a browser open: a clue in the world (through Elliott's
// eyes with the prompt to examine it, and from behind them), examining it, a clue of each mystery, the casebook with
// its clues on desktop and on the target phone (a Pixel 8 Pro in Chrome, portrait), a pairing refused, a deduction
// accepted, the case solved, and the reveal talk with its gift.
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx, people-probe.ts and
// mysteries-probe.ts) over Playwright and waits on its events (ready, streamed in, frames drawn, a person drawn, a
// clue offered), never a sleep. Every shot holds the date, the hour, the weather and the motion clock. It plays in
// the world `elliott`, whose camp has all three mysteries within a walk.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/mystery-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "mysteries"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood?seed=elliott";
const MOTION_AT = 12;
const DATE = "mabon";
const MORNING = 10.5;
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o) || o.startsWith(name));

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 448, height: 900 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

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
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    world.people.forget();
    world.mysteries.forget();
    world.companions.forget();
    world.cooking.forget();
    world.forage.forget();
  });
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

/** Holds the day, then gives the camera frames to ease where it is going and the world to stream in round it. */
async function capture(page, name, { hour = MORNING, settle = 120, person = null, offer = null } = {}) {
  await page.evaluate(
    ({ hour, date, motion }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setDate(date);
      world.holdWeather("fair");
      world.holdMotion(motion);
    },
    { hour, date: DATE, motion: MOTION_AT },
  );
  await frames(page, settle);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  if (person) await page.waitForFunction((id) => window.__hearthwoodWorld.people.drawn(id), person, { timeout: 60000 });
  if (offer) {
    await page.waitForFunction((key) => window.__hearthwoodWorld.mysteries.offer() === key, offer, { timeout: 60000 }).catch(async (error) => {
      const world = await page.evaluate(() => {
        const w = window.__hearthwoodWorld;
        return { offer: w.mysteries.offer(), person: w.people.offer(), walker: w.walker(), camera: w.camera() };
      });
      throw new Error(`${name}: the clue ${offer} was never offered; instead ${JSON.stringify(world)}`, { cause: error });
    });
  }
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

async function find(page, role, story) {
  const found = await page.evaluate(({ role, story }) => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    return world.people.find(role, camp.x, camp.z, 8, story);
  }, { role, story });
  if (!found) throw new Error(`No ${role} carrying ${story} near camp`);
  console.log(`${role} ${found.id} (${found.story}) at ${found.x.toFixed(0)}, ${found.z.toFixed(0)}, clues ${found.clues.map((c) => c.id).join(", ")}`);
  return found;
}

/** The side of a clue its teller is on, so Elliott can stand with the teller behind them and the clue alone in front. */
const awayFrom = (teller, at) => Math.atan2(teller.x - at.x, teller.z - at.z);

/** Elliott a few steps from a point, facing it, in a view, looking down at it. */
async function standBy(page, at, distance, pov, { side = 0.6, pitch = -Math.atan2(1.4 - 0.2, distance), swing = 0.5, turn = 0 } = {}) {
  await page.evaluate(
    ({ at, distance, pov, side, pitch, swing, turn }) => {
      const world = window.__hearthwoodWorld;
      const x = at.x + Math.sin(side) * distance;
      const z = at.z + Math.cos(side) * distance;
      const heading = Math.atan2(at.x - x, at.z - z) + turn;
      world.setView("walk");
      world.setFreeCamera(null);
      world.setPointOfView(pov);
      world.placeWalker(x, z, heading);
      // In first person the look's yaw is the orbit's, so only third person swings the camera round.
      world.setOrbit(pov === "third" ? { yaw: heading + swing, pitch: 0.5, distance: 3.4 } : { yaw: heading });
      world.setLook({ yaw: heading, pitch });
    },
    { at, distance, pov, side, pitch, swing, turn },
  );
}

async function standBefore(page, person, distance, pov) {
  await page.evaluate(
    ({ person, distance, pov }) => {
      const world = window.__hearthwoodWorld;
      const x = person.x + Math.sin(person.heading) * distance;
      const z = person.z + Math.cos(person.heading) * distance;
      const heading = Math.atan2(person.x - x, person.z - z);
      world.setView("walk");
      world.setFreeCamera(null);
      world.setPointOfView(pov);
      world.placeWalker(x, z, heading);
      world.setOrbit(pov === "third" ? { yaw: heading + 0.7, pitch: 0.18, distance: 4.2 } : { yaw: heading });
      world.setLook({ yaw: heading, pitch: -0.05 });
    },
    { person, distance, pov },
  );
}

async function finishTalk(page) {
  for (let n = 0; n < 24; n++) {
    const t = await page.evaluate(() => window.__hearthwoodWorld.people.talking());
    if (t === null) return;
    await page.evaluate((t) => (t.choices ? window.__hearthwoodWorld.people.choose("warm") : window.__hearthwoodWorld.people.next()), t);
  }
}

const keyOf = (person, clue) => `${person.id}/${clue}`;

/** Meets the teller, so their case is open and their clues glint. */
async function hearMystery(page, teller) {
  await standBefore(page, teller, 2.4, "first");
  await frames(page, 4);
  await page.evaluate((id) => window.__hearthwoodWorld.people.talk(id), teller.id);
  await finishTalk(page);
}

async function examineAll(page, teller) {
  for (const clue of teller.clues) {
    await page.evaluate((key) => {
      const m = window.__hearthwoodWorld.mysteries;
      m.examine(key);
      m.close();
    }, keyOf(teller, clue.id));
  }
}

async function connect(page, ids) {
  return page.evaluate((ids) => {
    const m = window.__hearthwoodWorld.mysteries;
    m.select(ids);
    return m.connect();
  }, ids);
}

async function desktopShots() {
  const page = await openWorld(DESKTOP);
  const beekeeper = await find(page, "beekeeper", "honey-thief");
  await hearMystery(page, beekeeper);

  // A clue in the world: through Elliott's eyes, offered, and from behind them.
  const prints = beekeeper.clues.find((c) => c.id === "fox-prints");
  if (want("mystery-clue")) {
    await standBy(page, prints, 1.7, "first");
    await capture(page, "mystery-clue-first", { offer: keyOf(beekeeper, "fox-prints") });
    await standBy(page, prints, 2.3, "third", { pitch: -0.3, side: awayFrom(beekeeper, prints), swing: 0, turn: -0.7 });
    await capture(page, "mystery-clue-third", { offer: keyOf(beekeeper, "fox-prints") });
    for (const id of ["fur", "mitten", "crumbs"]) {
      const clue = beekeeper.clues.find((c) => c.id === id);
      await standBy(page, clue, 1.7, "first", { side: awayFrom(beekeeper, clue) });
      await capture(page, `mystery-clue-${id}`, { offer: keyOf(beekeeper, id) });
    }
  }

  // Examining it.
  await standBy(page, prints, 1.7, "first");
  await frames(page, 30);
  await page.evaluate((key) => window.__hearthwoodWorld.mysteries.examine(key), keyOf(beekeeper, "fox-prints"));
  if (want("mystery-examine")) await capture(page, "mystery-examine-desktop", { settle: 30 });
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.close());
  await examineAll(page, beekeeper);

  // The hunch the mitten brings on.
  await standBefore(page, beekeeper, 2.4, "first");
  await frames(page, 4);
  await page.evaluate((id) => window.__hearthwoodWorld.people.talk(id), beekeeper.id);
  if (want("mystery-hunch")) await capture(page, "mystery-hunch-desktop", { person: beekeeper.id, settle: 90 });
  await finishTalk(page);

  // The casebook: its clues, a pairing refused, a deduction accepted, then solved.
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.setCasebookOpen(true));
  if (want("mystery-casebook")) await capture(page, "mystery-casebook-desktop", { settle: 20 });
  console.log(`refused: ${JSON.stringify(await connect(page, ["badger", "fur"]))}`);
  if (want("mystery-refused")) await capture(page, "mystery-refused-desktop", { settle: 4 });
  console.log(`deduced: ${JSON.stringify(await connect(page, ["badger", "lids"]))}`);
  if (want("mystery-deduced")) await capture(page, "mystery-deduced-desktop", { settle: 20 });
  await connect(page, ["fox-prints", "fur"]);
  await connect(page, ["not-badger", "mitten", "farm-child"]);
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.select(["child", "fox-cub"]));
  if (want("mystery-choosing")) await capture(page, "mystery-choosing-desktop", { settle: 4 });
  console.log(`solved: ${JSON.stringify(await connect(page, ["child", "fox-cub", "crumbs"]))}`);
  if (want("mystery-solved")) await capture(page, "mystery-solved-desktop", { settle: 20 });
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.setCasebookOpen(false));

  // The reveal.
  if (want("mystery-reveal")) {
    await standBefore(page, beekeeper, 2.4, "first");
    await frames(page, 4);
    await page.evaluate((id) => window.__hearthwoodWorld.people.talk(id), beekeeper.id);
    console.log(`reveal: ${JSON.stringify(await page.evaluate(() => window.__hearthwoodWorld.people.talking()))}`);
    await capture(page, "mystery-reveal-desktop", { person: beekeeper.id, settle: 90 });
    for (let n = 0; n < 2; n++) await page.evaluate(() => window.__hearthwoodWorld.people.next());
    await capture(page, "mystery-reveal-3-desktop", { person: beekeeper.id, settle: 10 });
    for (let n = 0; n < 12; n++) {
      const t = await page.evaluate(() => window.__hearthwoodWorld.people.talking());
      if (t.last) break;
      await page.evaluate((t) => (t.choices ? window.__hearthwoodWorld.people.choose("warm") : window.__hearthwoodWorld.people.next()), t);
    }
    await capture(page, "mystery-reveal-gift-desktop", { person: beekeeper.id, settle: 10 });
    await finishTalk(page);
  }

  // A clue of each of the other mysteries.
  if (want("mystery-other")) {
    for (const [role, story, clue] of [
      ["cottager", "still-bell", "feather"],
      ["cottager", "still-bell", "button"],
      ["fisher", "far-shore", "rope"],
      ["fisher", "far-shore", "cane-prints"],
    ]) {
      const teller = await find(page, role, story);
      await hearMystery(page, teller);
      const at = teller.clues.find((c) => c.id === clue);
      await standBy(page, at, 1.7, "first", { side: awayFrom(teller, at) });
      await capture(page, `mystery-other-${clue}`, { offer: keyOf(teller, clue) });
    }
  }
  return page;
}

async function phoneShots() {
  const page = await openWorld(PHONE);
  await page.touchscreen.tap(PHONE.viewport.width * 0.8, PHONE.viewport.height * 0.3);
  const beekeeper = await find(page, "beekeeper", "honey-thief");
  await hearMystery(page, beekeeper);
  const prints = beekeeper.clues.find((c) => c.id === "fox-prints");
  await standBy(page, prints, 1.7, "first");
  await capture(page, "mystery-clue-phone", { offer: keyOf(beekeeper, "fox-prints") });
  await page.evaluate((key) => window.__hearthwoodWorld.mysteries.examine(key), keyOf(beekeeper, "fox-prints"));
  await capture(page, "mystery-examine-phone", { settle: 30 });
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.close());
  await examineAll(page, beekeeper);
  await page.evaluate((id) => window.__hearthwoodWorld.people.talk(id), beekeeper.id);
  await finishTalk(page);
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.setCasebookOpen(true));
  await capture(page, "mystery-casebook-phone", { settle: 20 });
  await connect(page, ["badger", "fur"]);
  await capture(page, "mystery-refused-phone", { settle: 4 });
  await connect(page, ["badger", "lids"]);
  await capture(page, "mystery-deduced-phone", { settle: 20 });
  await page.evaluate(() => window.__hearthwoodWorld.mysteries.setCasebookOpen(false));
}

await desktopShots();
if (want("mystery-clue-phone") || want("mystery-casebook-phone") || want("mystery-examine-phone")) await phoneShots();

await browser.close();
