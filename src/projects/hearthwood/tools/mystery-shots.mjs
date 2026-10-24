// Screenshots of the mysteries, for judging them without a browser open: a clue in the world (through Elliott's
// eyes with the prompt to examine it, and from behind them), examining it, a clue of each mystery, the casebook with
// its clues on desktop and on the target phone (a Pixel 8 Pro in Chrome, portrait), a pairing refused, a deduction
// accepted, the case solved, and the reveal talk with its gift; and the companions helping (the `mystery-help-`
// shots): a dog snuffling towards a clue and then sat by it, and a cat sat by one, each from behind Elliott and
// through their eyes, the companion's steps played by the animals' rules on a held motion clock.
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx, people-probe.ts and
// mysteries-probe.ts) over Playwright and waits on its events (ready, streamed in, frames drawn, a person drawn, a
// clue offered), never a sleep. Every shot holds the date, the hour, the weather and the motion clock. It plays in
// the world `elliott`, whose camp has all three mysteries within a walk.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/mystery-shots.mjs [label] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
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

/** Holds the day on a page without moving the motion clock, for shots whose animals are stepped by the probe. */
async function holdDay(page) {
  await page.evaluate(
    ({ hour, date }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setDate(date);
      world.holdWeather("fair");
    },
    { hour: MORNING, date: DATE },
  );
}

/** A stray of a kind near a point, brought to life by putting Elliott near its home, won over and named. */
async function befriend(page, species, near) {
  const strays = await page.evaluate(({ species, near }) => window.__hearthwoodWorld.companions.straysNear(near.x, near.z, 1500).filter((s) => s.species === species), { species, near });
  strays.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
  for (const stray of strays) {
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x + 6, at.z, 0), stray);
    await frames(page, 4);
    const won = await page.evaluate((key) => {
      const companions = window.__hearthwoodWorld.companions;
      if (!companions.animals().some((a) => a.key === key && a.kind === "stray")) return false;
      companions.win(key);
      companions.keep();
      return true;
    }, stray.id);
    if (won) return stray.id;
  }
  throw new Error(`No ${species} to befriend near ${near.x.toFixed(0)}, ${near.z.toFixed(0)}`);
}

/**
 * Steps the animals' rules a frame at a time until a companion is off to one of some clues in a phase (and has
 * come within `within` metres of it), or `seconds` pass; returns the clue's key.
 */
async function stepUntilHelping(page, key, clues, phase, seconds, within = Infinity) {
  const found = await page.evaluate(
    ({ key, clues, phase, seconds, within }) => {
      const world = window.__hearthwoodWorld;
      const holds = () => {
        const help = world.mysteries.helping().find((h) => h.animal === key);
        const clue = clues.find((c) => c.key === help?.clue);
        const animal = world.companions.animals().find((a) => a.key === key);
        return help?.phase === phase && clue && animal && Math.hypot(animal.x - clue.x, animal.z - clue.z) < within ? clue.key : null;
      };
      for (let t = 0; t < seconds; t += 1 / 30) {
        if (holds()) return holds();
        world.companions.simulate(1 / 30);
      }
      return holds();
    },
    { key, clues, phase, seconds, within },
  );
  if (!found) {
    const state = await page.evaluate((key) => ({ helping: window.__hearthwoodWorld.mysteries.helping(), animal: window.__hearthwoodWorld.companions.animals().find((a) => a.key === key) }), key);
    throw new Error(`Stepped ${seconds} s and never saw ${key} ${phase} at a clue: ${JSON.stringify(state)}`);
  }
  return found;
}

/** A shot of animals stepped by the probe: the motion clock moved on past the bodies' blend and held, the world drawn and the animals settled. */
async function shootHeld(page, name, { pov, orbit = null, look = null, free = false }) {
  await page.evaluate(
    ({ pov, orbit, look, free }) => {
      const world = window.__hearthwoodWorld;
      world.holdMotion(world.motion() + 1.5);
      world.setView("walk");
      if (!free) world.setFreeCamera(null);
      world.setPointOfView(pov);
      if (orbit) world.setOrbit(orbit);
      if (look) world.setLook(look);
    },
    { pov, orbit, look, free },
  );
  await frames(page, 30);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled() && window.__hearthwoodWorld.companions.settled(0), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

/** Elliott `distance` metres from a clue on its teller's side (or turned round from it by `turn`), facing it, and where they stand. */
async function standOff(page, teller, clue, distance, turn = 0) {
  const way = awayFrom(teller, clue) + turn;
  const stand = { x: clue.x + Math.sin(way) * distance, z: clue.z + Math.cos(way) * distance, heading: way + Math.PI };
  await page.evaluate((s) => window.__hearthwoodWorld.placeWalker(s.x, s.z, s.heading), stand);
  return stand;
}

/** Shots from behind Elliott and through their eyes, looking at the clue. */
async function bothViews(page, name, stand, clue, firstPitch) {
  const look = Math.atan2(clue.x - stand.x, clue.z - stand.z);
  await shootHeld(page, `${name}-third`, { pov: "third", orbit: { yaw: look - 0.25, pitch: 0.32, distance: 4.2 } });
  await shootHeld(page, `${name}-first`, { pov: "first", look: { yaw: look, pitch: firstPitch } });
}

/** The companions helping: a dog snuffling towards one of the honey thief's clues and sat by it, then (in a fresh walk, so it notices the same clue) a cat sat by it. */
async function helpingShots() {
  for (const species of ["dog", "cat"]) {
    if (!want(`mystery-help-${species}`)) continue;
    const page = await openWorld(DESKTOP);
    await holdDay(page);
    const beekeeper = await find(page, "beekeeper", "honey-thief");
    await hearMystery(page, beekeeper);
    const clues = beekeeper.clues.map((c) => ({ key: keyOf(beekeeper, c.id), x: c.x, z: c.z }));
    const key = await befriend(page, species, beekeeper);
    const stand = await standOff(page, beekeeper, beekeeper.clues.find((c) => c.id === "fox-prints"), 13);
    await page.evaluate(({ key, s }) => window.__hearthwoodWorld.companions.place(key, s.x + Math.cos(s.heading) * 1.6, s.z - Math.sin(s.heading) * 1.6, s.heading, "sit"), { key, s: stand });
    await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
    await frames(page, 30);
    // Whichever clue it notices: the one it goes to.
    const noticed = await stepUntilHelping(page, key, clues, "going", 40);
    const clue = clues.find((c) => c.key === noticed);
    const from = await page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key), key);
    await stepUntilHelping(page, key, [clue], "going", 20, Math.hypot(from.x - clue.x, from.z - clue.z) * 0.55);
    const at = beekeeper.clues.find((c) => keyOf(beekeeper, c.id) === clue.key);
    if (species === "dog" && want("mystery-help-dog-going")) {
      await bothViews(page, "mystery-help-dog-going", stand, at, -0.12);
      // From beside it, its nose down to the ground.
      const dog = await page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key), key);
      const side = dog.heading + Math.PI / 2;
      const eye = { x: dog.x + Math.sin(side) * 2.4, z: dog.z + Math.cos(side) * 2.4 };
      await page.evaluate(({ eye, dog }) => window.__hearthwoodWorld.setFreeCamera({ x: eye.x, y: dog.y + 0.7, z: eye.z, lookX: dog.x, lookY: dog.y + 0.3, lookZ: dog.z }), { eye, dog });
      await shootHeld(page, "mystery-help-dog-going-side", { pov: "third", free: true });
    }
    await stepUntilHelping(page, key, [clue], "by", 30);
    // Elliott a few steps from it, round from its teller so nobody stands between, where the woods are thinnest at
    // their back and the camera's, the companion turning to look at them.
    const turn = await page.evaluate((at) => {
      const world = window.__hearthwoodWorld;
      const woods = (way, r) => world.at(at.x + Math.sin(way) * r, at.z + Math.cos(way) * r).woodland;
      const ways = [0.8, -0.8, 0.6, -0.6, 1].map((k) => k * Math.PI);
      return ways.map((turn) => ({ turn, woods: woods(at.way + turn, 5) + woods(at.way + turn, 9) })).sort((a, b) => a.woods - b.woods)[0].turn;
    }, { x: at.x, z: at.z, way: awayFrom(beekeeper, at) });
    const near = await standOff(page, beekeeper, at, 5, turn);
    await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(2.5));
    const by = await page.evaluate(({ key, clue }) => ({ by: window.__hearthwoodWorld.mysteries.companionBy(clue), animal: window.__hearthwoodWorld.companions.animals().find((a) => a.key === key) }), { key, clue: clue.key });
    console.log(`${species} ${key} by ${clue.key}: ${by.by}, ${by.animal.activity}`);
    if (want(`mystery-help-${species}-by`)) await bothViews(page, `mystery-help-${species}-by`, near, at, -0.3);
    await page.context().close();
  }
}

if (ONLY === null || ONLY.some((o) => !o.startsWith("mystery-help"))) await desktopShots();
if (want("mystery-help")) await helpingShots();
if (want("mystery-clue-phone") || want("mystery-casebook-phone") || want("mystery-examine-phone")) await phoneShots();

await browser.close();
