// Screenshots of fetch in the world, for judging it without a browser open (the `fetch-` shots): Elliott
// holding a stick from behind and through their eyes, the stick in the air mid-throw, a dog galloping after
// it, carrying it back in its jaws, dropping it at Elliott's feet and sitting to wait, a stray dog won over
// by a game of fetch (its naming card), a companion's play bow, and the touch
// controls on the target phone (picking up camp's stick, and the throw button).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx; fetch is its
// `companions.fetch`) over Playwright, and waits on its events, never a sleep. Every shot holds the date, the
// hour and the weather (clear); the game is played by stepping the animals' rules on a held motion clock, so
// each moment is caught exactly.
//
// Prereq: a dev server (`npx next dev --port <port>` in a worktree) and a Chromium with WebGPU (see browser.mjs).
// Usage:  node src/projects/hearthwood/tools/fetch-shots.mjs [label] [--seed=<seed>] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "fetch"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const DATE = "mabon";
const HOUR = 10.5;
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
// The Pixel 8 Pro in Chrome, upright.
const PHONE = { viewport: { width: 448, height: 900 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));
const browser = await launchBrowser();

async function openWorld(device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  page.on("pageerror", async (error) => {
    console.error(`The world threw:\n${error.stack ?? error.message}`);
    await browser.close();
    process.exit(1);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page error:", m.text());
  });
  const query = new URLSearchParams({ weather: "clear" });
  if (SEED) query.set("seed", SEED);
  await page.goto(`${BASE}?${query}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} html:not([data-shot-chrome]) [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
  await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });
  await page.evaluate(
    ({ date, hour }) => {
      const world = window.__hearthwoodWorld;
      world.companions.forget();
      world.companions.fetch.forget();
      world.setDate(date);
      world.holdHour(hour);
    },
    { date: DATE, hour: HOUR },
  );
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

/** Holds the motion clock where it is: from here on only the probe's steps move the animals and the sticks. */
const holdMotion = (page) => page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));

/**
 * Steps the rules a frame at a time until what is asked for holds, or `seconds` pass: the first game at one of
 * `phases`, a dog at a run, the naming card up, or a stick offered.
 */
async function stepUntil(page, ask, seconds = 30) {
  const done = await page.evaluate(
    ({ ask, seconds }) => {
      const world = window.__hearthwoodWorld;
      const holds = () => {
        const phase = world.companions.fetch.games()[0]?.phase ?? null;
        if (ask.phases && !ask.phases.includes(phase)) return false;
        if (ask.running && !world.companions.animals().some((a) => a.species === "dog" && a.activity === "run")) return false;
        if (ask.naming && world.companions.naming() === null) return false;
        return true;
      };
      for (let t = 0; t < seconds; t += 1 / 30) {
        if (holds()) return true;
        world.companions.simulate(1 / 30);
      }
      return holds();
    },
    { ask, seconds },
  );
  if (!done) {
    const state = await page.evaluate(() => ({ games: window.__hearthwoodWorld.companions.fetch.games(), thrown: window.__hearthwoodWorld.companions.fetch.thrown(), dogs: window.__hearthwoodWorld.companions.animals().filter((a) => a.species === "dog") }));
    throw new Error(`Stepped ${seconds} s and never saw ${JSON.stringify(ask)}: ${JSON.stringify(state)}`);
  }
}

async function shoot(page, name, { free = null, pov = "third", orbit = null, look = null, chrome = false } = {}) {
  await page.evaluate(
    ({ free, pov, orbit, look, chrome }) => {
      const world = window.__hearthwoodWorld;
      // The bodies blend into what they now do over the motion clock, which is held: it is moved on past the blend.
      world.holdMotion(world.motion() + 1.5);
      world.setView("walk");
      world.setPointOfView(pov);
      world.setFreeCamera(free);
      if (orbit) world.setOrbit(orbit);
      if (look) world.setLook(look);
      document.documentElement.toggleAttribute("data-shot-chrome", chrome);
    },
    { free, pov, orbit, look, chrome },
  );
  await frames(page, 20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled() && window.__hearthwoodWorld.companions.settled(0), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

const live = (page, key) => page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key) ?? null, key);
const game = (page, key) => page.evaluate((key) => window.__hearthwoodWorld.companions.fetch.games().find((g) => g.key === key)?.phase ?? null, key);
const height = (page, x, z) => page.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, { x, z });

/** A camera `distance` metres from a point along a heading, `up` metres above the point's ground, looking at it `look` metres up. */
async function cameraOn(page, at, heading, distance, up, look) {
  const x = at.x + Math.sin(heading) * distance;
  const z = at.z + Math.cos(heading) * distance;
  const ay = at.y ?? (await height(page, at.x, at.z));
  const gy = await height(page, x, z);
  return { x, y: Math.max(gy + 0.4, ay + up), z, lookX: at.x, lookY: ay + look, lookZ: at.z };
}

/** The way from a point with the most open, level, dry ground ahead for a throw. */
async function openWay(page, at) {
  return page.evaluate((at) => {
    const world = window.__hearthwoodWorld;
    let best = { way: 0, score: -Infinity };
    for (let k = 0; k < 24; k++) {
      const way = (k / 24) * Math.PI * 2;
      let score = 0;
      const h0 = world.at(at.x, at.z).height;
      for (let r = 2; r <= 16; r += 2) {
        const p = world.at(at.x + Math.sin(way) * r, at.z + Math.cos(way) * r);
        score -= p.woodland * 3 + Math.abs(p.height - h0) * 0.6 + (p.water > p.height ? 20 : 0);
      }
      if (score > best.score) best = { way, score };
    }
    return best.way;
  }, at);
}

/** A friendly stray dog near camp, brought to life by putting Elliott near its home. */
async function friendlyDog(page) {
  const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
  const dogs = await page.evaluate((c) => window.__hearthwoodWorld.companions.straysNear(c.x, c.z, 1200).filter((s) => s.species === "dog"), camp);
  for (const candidate of dogs.sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z))) {
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x + 40, at.z, 0), candidate);
    await frames(page, 4);
    const dog = await live(page, candidate.id);
    if (dog && dog.boldness > -0.1) return dog;
  }
  throw new Error("No friendly dog near camp");
}

if (ONLY === null || ONLY.some((o) => !o.startsWith("fetch-phone"))) {
  const page = await openWorld(DESKTOP);
  const dog = await friendlyDog(page);
  console.log(`dog ${dog.key}: boldness ${dog.boldness.toFixed(2)}, warmth ${dog.warmth.toFixed(2)}`);
  // Elliott a few steps from the dog's home, facing the most open way for a throw.
  const home = dog.home;
  const way = await openWay(page, home);
  const stand = { x: home.x - Math.sin(way) * 2, z: home.z - Math.cos(way) * 2, heading: way };
  await page.evaluate((s) => window.__hearthwoodWorld.placeWalker(s.x, s.z, s.heading), stand);
  await page.evaluate(({ key, s }) => window.__hearthwoodWorld.companions.place(key, s.x + Math.cos(s.heading) * 1.8, s.z - Math.sin(s.heading) * 1.8, s.heading + Math.PI, "sit"), { key: dog.key, s: stand });
  await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.give());
  await holdMotion(page);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(1));

  if (want("fetch-hold")) {
    await shoot(page, "fetch-hold-third", { orbit: { yaw: stand.heading + 0.5, pitch: 0.2, distance: 3.2 }, chrome: true });
    await shoot(page, "fetch-hold-first", { pov: "first", look: { yaw: stand.heading, pitch: -0.12 }, chrome: true });
  }

  // The throw, from behind Elliott's shoulder.
  await page.evaluate((h) => window.__hearthwoodWorld.setOrbit({ yaw: h, pitch: 0.18, distance: 4 }), stand.heading);
  await page.evaluate(() => window.__hearthwoodWorld.setPointOfView("third"));
  await frames(page, 4);
  await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.throw());
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(0.4));
  const flying = await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.thrown()[0]);
  console.log(`stick ${flying.phase} at ${flying.y.toFixed(1)} m`);
  // From beside the stick's arc and back towards Elliott, the stick up in the air and the dog turning after it.
  if (want("fetch-throw")) {
    const side = stand.heading - Math.PI * 0.62;
    const eye = { x: flying.x + Math.sin(side) * 3.4, z: flying.z + Math.cos(side) * 3.4 };
    await shoot(page, "fetch-throw", { free: { ...eye, y: flying.y - 0.9, lookX: (flying.x * 2 + stand.x) / 3, lookY: flying.y - 0.7, lookZ: (flying.z * 2 + stand.z) / 3 } });
  }

  // The dog at a gallop after it.
  await stepUntil(page, { phases: ["chase"], running: true }, 5);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(0.5));
  if (want("fetch-chase")) {
    const at = await live(page, dog.key);
    // From ahead of it and to the side, the stick lying beyond.
    await shoot(page, "fetch-chase", { free: await cameraOn(page, at, at.heading + 0.9, 4.5, 0.7, 0.35) });
  }

  // Back with it in its jaws.
  await stepUntil(page, { phases: ["carry"] }, 15);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(1.6));
  if (want("fetch-carry")) {
    const at = await live(page, dog.key);
    await shoot(page, "fetch-carry", { free: await cameraOn(page, at, at.heading + 0.7, 2.6, 0.6, 0.35) });
    await shoot(page, "fetch-carry-close", { free: await cameraOn(page, at, at.heading + 0.35, 1.5, 0.45, 0.42) });
  }

  // Dropped at Elliott's feet, and sitting to wait for the next throw.
  await stepUntil(page, { phases: ["wait", "bow"] }, 15);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(1.2));
  const sat = await live(page, dog.key);
  console.log(`after one fetch: ${await game(page, dog.key)}, warmth ${sat.warmth.toFixed(2)}`);
  if (want("fetch-wait")) {
    await shoot(page, "fetch-wait", { orbit: { yaw: stand.heading + 2.4, pitch: 0.32, distance: 3.6 } });
    await shoot(page, "fetch-wait-first", { pov: "first", look: { yaw: Math.atan2(sat.x - stand.x, sat.z - stand.z), pitch: -0.55 }, chrome: true });
  }

  // Again until it is won over: the naming card opens.
  for (let round = 0; round < 4; round++) {
    const naming = await page.evaluate(() => window.__hearthwoodWorld.companions.naming());
    if (naming) break;
    await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.pickUpThrown());
    await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.throw());
    await stepUntil(page, { phases: ["wait", "bow"] }, 30);
    const now = await live(page, dog.key);
    console.log(`after fetch ${round + 2}: warmth ${now.warmth.toFixed(2)}, ${now.kind}`);
  }
  const name = await page.evaluate(() => window.__hearthwoodWorld.companions.naming());
  if (!name) throw new Error("The dog wasn't won by fetch");
  if (want("fetch-won")) await shoot(page, "fetch-won", { orbit: { yaw: stand.heading + 2.4, pitch: 0.25, distance: 4 }, chrome: true });
  await page.evaluate(() => window.__hearthwoodWorld.companions.keep());

  // A companion now: it play-bows for joy after bringing the stick back.
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(1));
  await page.evaluate(() => {
    const fetch = window.__hearthwoodWorld.companions.fetch;
    if (!fetch.holding()) fetch.give();
    fetch.throw();
  });
  await stepUntil(page, { phases: ["bow"] }, 30);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(0.5));
  if (want("fetch-bow")) {
    const at = await live(page, dog.key);
    await shoot(page, "fetch-bow", { free: await cameraOn(page, at, at.heading + 1.4, 2.6, 0.4, 0.25) });
  }
  await page.context().close();
}

if (want("fetch-phone")) {
  const page = await openWorld(PHONE);
  const stick = await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const camp = world.camp();
    return world.companions.fetch.sticksNear(camp.x, camp.z, 6).find((s) => s.id === "camp");
  });
  if (!stick) throw new Error("No stick by camp's fire");
  // Standing over camp's stick, looking down at it: the button to pick it up.
  const heading = -Math.PI / 2;
  await page.evaluate(({ s, heading }) => window.__hearthwoodWorld.placeWalker(s.x + 1.6, s.z, heading), { s: stick, heading });
  await holdMotion(page);
  await shoot(page, "fetch-phone-pick-up", { pov: "first", look: { yaw: heading, pitch: -0.75 }, chrome: true });
  const offered = await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.offered());
  if (!offered) throw new Error("Camp's stick wasn't offered");
  await page.evaluate(() => window.__hearthwoodWorld.companions.fetch.pickUp());
  await shoot(page, "fetch-phone-holding", { pov: "first", look: { yaw: heading + Math.PI * 0.8, pitch: -0.05 }, chrome: true });
  await shoot(page, "fetch-phone-holding-third", { orbit: { yaw: heading + Math.PI * 0.8 + 0.4, pitch: 0.2, distance: 3.4 }, chrome: true });
  await page.context().close();
}

await browser.close();
