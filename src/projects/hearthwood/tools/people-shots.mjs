// Screenshots of the people Elliott meets, for judging them without a browser open: meeting a shepherd by a
// seter (from behind Elliott and through their eyes, with the prompt to talk), the storybook panel mid-conversation
// on desktop and on the target phone (a Pixel 8 Pro in Chrome, portrait), a cold traveller given something warm
// cooked at the fire and their thanks, a herder's lost dog befriended, brought back and sat at home again, a
// shepherd asking for yarrow salve for their ewe (the panel showing what is asked) and thanking Elliott for it on
// desktop and the phone, the keepsakes set out at camp (those given, and every one there is), and the journal on
// desktop and the phone.
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx and
// people-probe.ts) over Playwright and waits on its events (ready, streamed in, frames drawn, a person drawn,
// a dish served), never a sleep. Every shot holds the date, the hour, the weather and the motion clock.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/people-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "people"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
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
    world.companions.forget();
    world.cooking.forget();
    world.brewing.forget();
    world.forage.forget();
  });
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

/** Holds the day, then gives the camera frames to ease where it is going and the world to stream in round it. */
async function capture(page, name, { hour = MORNING, settle = 120, person = null } = {}) {
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
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

/** Elliott a few steps in front of someone, facing them, in a view; from behind, the camera swung `swing` round to one side. */
async function standBefore(page, person, distance, pov, side = 0, swing = 0) {
  await page.evaluate(
    ({ person, distance, pov, side, swing }) => {
      const world = window.__hearthwoodWorld;
      const h = person.heading + side;
      const x = person.x + Math.sin(h) * distance;
      const z = person.z + Math.cos(h) * distance;
      const heading = Math.atan2(person.x - x, person.z - z);
      world.setView("walk");
      world.setFreeCamera(null);
      world.setPointOfView(pov);
      world.placeWalker(x, z, heading);
      world.setLook({ yaw: heading, pitch: -0.05 });
      world.setOrbit({ yaw: heading + swing, pitch: 0.18, distance: 4.2 });
    },
    { person, distance, pov, side, swing },
  );
}

async function find(page, role, cells, story) {
  const found = await page.evaluate(({ role, cells, story }) => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    return world.people.find(role, camp.x, camp.z, cells, story);
  }, { role, cells, story });
  if (!found) throw new Error(`No ${role}${story ? ` carrying ${story}` : ""} within ${cells} cells of camp`);
  console.log(`${role} ${found.id} (${found.story}) at ${found.x.toFixed(0)}, ${found.z.toFixed(0)}`);
  return found;
}

/** Talks with someone until a page that offers a choice, or the end. */
async function talkTo(page, id) {
  await page.evaluate((id) => window.__hearthwoodWorld.people.talk(id), id);
}

async function untilChoice(page) {
  for (let n = 0; n < 12; n++) {
    const t = await page.evaluate(() => window.__hearthwoodWorld.people.talking());
    if (t === null || t.choices) return t;
    await page.evaluate(() => window.__hearthwoodWorld.people.next());
  }
  return null;
}

async function toLastPage(page) {
  for (let n = 0; n < 16; n++) {
    const t = await page.evaluate(() => window.__hearthwoodWorld.people.talking());
    if (t === null || t.last) return t;
    await page.evaluate((t) => (t.choices ? window.__hearthwoodWorld.people.choose("warm") : window.__hearthwoodWorld.people.next()), t);
  }
  return null;
}

async function finishTalk(page) {
  for (let n = 0; n < 20; n++) {
    const t = await page.evaluate(() => window.__hearthwoodWorld.people.talking());
    if (t === null) return;
    await page.evaluate((t) => (t.choices ? window.__hearthwoodWorld.people.choose("warm") : window.__hearthwoodWorld.people.next()), t);
  }
}

async function desktopShots() {
  const page = await openWorld(DESKTOP);

  // Meeting a shepherd by a seter.
  if (want("people-shepherd") || want("people-talk-desktop")) {
    const shepherd = await find(page, "shepherd", 40);
    await standBefore(page, shepherd, 2.8, "third", 0.3, 0.75);
    await capture(page, "people-shepherd-third", { person: shepherd.id });
    await standBefore(page, shepherd, 2.4, "first");
    await capture(page, "people-shepherd-first", { person: shepherd.id });
    await talkTo(page, shepherd.id);
    const t = await untilChoice(page);
    console.log(`talking: ${JSON.stringify(t)}`);
    await capture(page, "people-talk-desktop", { person: shepherd.id, settle: 90 });
    await page.evaluate(() => window.__hearthwoodWorld.people.choose("playful"));
    await capture(page, "people-talk-reply-desktop", { person: shepherd.id, settle: 20 });
    await page.evaluate(() => window.__hearthwoodWorld.setPointOfView("third"));
    await capture(page, "people-talk-third-desktop", { person: shepherd.id, settle: 90 });
    await finishTalk(page);
  }

  // A cold traveller given something warm from the pot, cooked at the fire.
  if (want("people-traveller") || want("people-cook")) {
    const traveller = await find(page, "traveller", 40, "long-road");
    await standBefore(page, traveller, 2.4, "first");
    await talkTo(page, traveller.id);
    await finishTalk(page);
    await page.evaluate(() => {
      const world = window.__hearthwoodWorld;
      const camp = world.camp();
      world.forage.stock("raspberry", 2);
      const heading = Math.atan2(-3.4, -1.5);
      world.setPointOfView("first");
      world.placeWalker(camp.x - Math.sin(heading) * 2.4, camp.z - Math.cos(heading) * 2.4, heading);
      world.setLook({ yaw: heading, pitch: -0.25 });
      world.cooking.open();
      world.cooking.choose(["raspberry", "honey"], "pot");
      world.cooking.cook();
    });
    await page.waitForFunction(() => window.__hearthwoodWorld.cooking.state()?.phase === "served", null, { timeout: 60000 });
    await capture(page, "people-cook-for-traveller", { hour: 17.8, settle: 90 });
    await page.evaluate(() => window.__hearthwoodWorld.cooking.leave());
    await standBefore(page, traveller, 2.2, "first");
    await frames(page, 30);
    await talkTo(page, traveller.id);
    console.log(`thanks: ${JSON.stringify(await page.evaluate(() => window.__hearthwoodWorld.people.talking()))}`);
    await capture(page, "people-traveller-thanks", { person: traveller.id, settle: 90 });
    const last = await toLastPage(page);
    console.log(`last: ${JSON.stringify(last)}`);
    await capture(page, "people-traveller-gift", { person: traveller.id, settle: 20 });
    await finishTalk(page);
  }

  // A herder's lost dog, befriended, brought back and home again.
  if (want("people-dog")) {
    const herder = await find(page, "herder", 60, "snow-light");
    await standBefore(page, herder, 2.4, "third");
    await talkTo(page, herder.id);
    await finishTalk(page);
    const pet = herder.pet;
    await page.evaluate((pet) => window.__hearthwoodWorld.placeWalker(pet.x + 4, pet.z, -Math.PI / 2), pet);
    await frames(page, 6);
    await page.evaluate((pet) => {
      const world = window.__hearthwoodWorld;
      world.companions.win(pet.id);
      world.companions.keep();
    }, pet);
    await standBefore(page, herder, 2.6, "third", 0.6);
    await frames(page, 4);
    // The dog sat between them, a little to the side, so the camera over Elliott's shoulder sees it.
    await page.evaluate((herder) => {
      const world = window.__hearthwoodWorld;
      const me = world.walker();
      const x = (me.x + herder.x) / 2 - Math.cos(me.heading) * 0.9;
      const z = (me.z + herder.z) / 2 + Math.sin(me.heading) * 0.9;
      world.companions.place(herder.pet.id, x, z, Math.atan2(herder.x - x, herder.z - z), "sit");
    }, herder);
    await talkTo(page, herder.id);
    console.log(`reunited: ${JSON.stringify(await page.evaluate(() => window.__hearthwoodWorld.people.talking()))}`);
    await capture(page, "people-dog-reunited", { person: herder.id, settle: 90 });
    await finishTalk(page);
    await standBefore(page, herder, 4.2, "third", 0.5, 0.9);
    await capture(page, "people-dog-home", { person: herder.id });
  }

  // A shepherd asking for yarrow salve for their ewe, and thanking Elliott for it.
  if (want("people-brew")) await brewShots(page, "desktop");

  if (want("people-keepsakes")) {
    await page.evaluate(() => {
      const world = window.__hearthwoodWorld;
      const camp = world.camp();
      const angle = 5.45;
      const x = camp.x + Math.cos(angle) * 2.9;
      const z = camp.z + Math.sin(angle) * 2.9;
      world.setView("walk");
      world.setPointOfView("third");
      world.placeWalker(camp.x + Math.cos(angle) * 4.6, camp.z + Math.sin(angle) * 4.6, Math.atan2(x - (camp.x + Math.cos(angle) * 4.6), z - (camp.z + Math.sin(angle) * 4.6)));
      world.setFreeCamera({ x: camp.x + Math.cos(angle) * 4.4, y: world.at(x, z).height + 1.3, z: camp.z + Math.sin(angle) * 4.4 + 0.6, lookX: x, lookY: world.at(x, z).height + 0.1, lookZ: z });
    });
    await capture(page, "people-keepsakes-at-camp", { hour: 17.8 });
    await page.evaluate(() => {
      const world = window.__hearthwoodWorld;
      for (const k of ["honey-jar", "carved-fish", "felted-reindeer", "sea-glass", "rowan-seedling", "compass", "magnifying-glass", "deerstalker", "sheep-bell", "kuksa"]) world.people.keepsake(k);
    });
    await capture(page, "people-keepsakes-all-at-camp", { hour: 17.8 });
    await page.evaluate(() => window.__hearthwoodWorld.setFreeCamera(null));
  }

  if (want("people-journal")) {
    await page.evaluate(() => window.__hearthwoodWorld.people.setJournalOpen(true));
    await capture(page, "people-journal-desktop", { settle: 20 });
    await page.evaluate(() => window.__hearthwoodWorld.people.setJournalOpen(false));
  }
  return page;
}

/** Asks a shepherd about their ewe to the end of the asking, then comes back with the salve in the basket for the thanks. */
async function brewShots(page, device) {
  const shepherd = await find(page, "shepherd", 40, "sore-hoof");
  await standBefore(page, shepherd, 2.6, "third", 0.3, 0.75);
  await talkTo(page, shepherd.id);
  const asked = await toLastPage(page);
  console.log(`asked: ${JSON.stringify(asked)}`);
  await capture(page, `people-brew-ask-${device}`, { person: shepherd.id, settle: 90 });
  await finishTalk(page);
  await page.evaluate(() => window.__hearthwoodWorld.brewing.stock("yarrow-salve"));
  await talkTo(page, shepherd.id);
  console.log(`thanks: ${JSON.stringify(await page.evaluate(() => window.__hearthwoodWorld.people.talking()))}`);
  await capture(page, `people-brew-thanks-${device}`, { person: shepherd.id, settle: 60 });
  const last = await toLastPage(page);
  console.log(`last: ${JSON.stringify(last)}`);
  await capture(page, `people-brew-gift-${device}`, { person: shepherd.id, settle: 20 });
  await finishTalk(page);
}

async function phoneBrewShots() {
  const page = await openWorld(PHONE);
  await page.touchscreen.tap(PHONE.viewport.width * 0.8, PHONE.viewport.height * 0.3);
  await brewShots(page, "phone");
}

async function phoneShots() {
  const page = await openWorld(PHONE);
  await page.touchscreen.tap(PHONE.viewport.width * 0.8, PHONE.viewport.height * 0.3);
  const neighbour = await find(page, "cottager", 2, "cat-who-chose");
  await standBefore(page, neighbour, 2.4, "first");
  await capture(page, "people-offer-phone", { person: neighbour.id });
  await talkTo(page, neighbour.id);
  await page.evaluate(() => window.__hearthwoodWorld.people.next());
  await capture(page, "people-talk-phone", { person: neighbour.id, settle: 90 });
  await page.evaluate(() => window.__hearthwoodWorld.people.choose("curious"));
  await capture(page, "people-talk-reply-phone", { person: neighbour.id, settle: 20 });
  await finishTalk(page);
  await page.evaluate(() => window.__hearthwoodWorld.people.setJournalOpen(true));
  await capture(page, "people-journal-phone", { settle: 20 });
}

await desktopShots();
if (want("people-offer-phone") || want("people-talk-phone") || want("people-journal-phone")) await phoneShots();
if (want("people-brew-ask-phone") || want("people-brew-thanks-phone") || want("people-brew-gift-phone")) await phoneBrewShots();

await browser.close();
