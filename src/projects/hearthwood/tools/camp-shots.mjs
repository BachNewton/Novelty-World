// Screenshots of camp moving, for judging it without a browser open (the `camp-` shots): packing up at the home
// camp (the fire's card with its pack-up button, and the camp packing away), Elliott carrying camp from behind and
// through their eyes, the ghost on good ground and on ground that won't do, camp going up (its pieces settling and
// the fire catching), a camp pitched on a lake shore at dusk and one on a high valley ledge under a summit, each with
// its fire, companions settled round it, the charm post with the garland's flowers and the lantern's fireflies, and
// the keepsakes; and the touch controls on the target phone (carrying, the pitch button, and the fire's card).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx; camp is its
// `camping`) over Playwright, and waits on its events, never a sleep. Every shot holds the date, the hour and the
// weather (clear); the companions are settled by stepping their rules on a held motion clock.
//
// Prereq: a dev server (`npx next dev --port <port>` in a worktree) and `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/camp-shots.mjs [label] [--seed=<seed>] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "camp"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const DATE = "mabon";
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
// The Pixel 8 Pro in Chrome, upright.
const PHONE = { viewport: { width: 448, height: 900 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
/** How far in front of Elliott camp is pitched, and where they stand to its fire (see gameplay/camp.ts). */
const BESIDE = { angle: Math.atan2(1.5, 3.4), out: Math.hypot(3.4, 1.5) };

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

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
  await page.evaluate((date) => {
    const world = window.__hearthwoodWorld;
    world.camping.forget();
    world.companions.forget();
    world.people.forget();
    world.brewing.forget();
    world.setDate(date);
  }, DATE);
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

async function shoot(page, name, { hour, free = null, pov = "third", orbit = null, look = null, chrome = false }) {
  await page.evaluate(
    ({ hour, free, pov, orbit, look, chrome }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      // The bodies blend into what they now do over the motion clock, which is held: it is moved on past the blend.
      world.holdMotion(world.motion() + 1.5);
      world.setPointOfView(pov);
      world.setFreeCamera(free);
      if (orbit) world.setOrbit(orbit);
      if (look) world.setLook(look);
      document.documentElement.toggleAttribute("data-shot-chrome", chrome);
    },
    { hour, free, pov, orbit, look, chrome },
  );
  await frames(page, 20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled() && window.__hearthwoodWorld.companions.settled(0), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

const height = (page, x, z) => page.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, { x, z });

/** Where Elliott stands to look for a spot with the ghost's fire at `at`, facing `heading`. */
const standFor = (at, heading) => ({ x: at.x - Math.sin(heading) * BESIDE.out, z: at.z - Math.cos(heading) * BESIDE.out, heading });

/** Elliott put somewhere, standing still on the ground, the ghost worked out where they look. */
async function stand(page, at) {
  await page.evaluate((s) => {
    const world = window.__hearthwoodWorld;
    world.setView("walk");
    world.setFreeCamera(null);
    world.placeWalker(s.x, s.z, s.heading);
    world.setLook({ yaw: s.heading });
  }, at);
  await frames(page, 6);
}

/** Pitches camp with its fire at a spot, Elliott beside it as they would stand having pitched it facing `heading`. */
async function pitchAt(page, at, heading) {
  const s = standFor(at, heading);
  await stand(page, s);
  const turn = Math.atan2(s.z - at.z, s.x - at.x) - BESIDE.angle;
  await page.evaluate(({ at, turn }) => {
    const world = window.__hearthwoodWorld;
    if (!world.camping.state().carried) world.camping.pack();
    world.camping.pitchAt(at.x, at.z, turn);
  }, { at, turn });
  return s;
}

/** Wins `count` strays near home as companions, a cat and a dog first, each brought to life by walking Elliott near it. */
async function winCompanions(page, count) {
  const strays = await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const home = world.camping.state().home;
    return world.companions
      .straysNear(home.x, home.z, 1500)
      .filter((s) => s.species === "cat" || s.species === "dog")
      .sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z));
  });
  const cats = strays.filter((s) => s.species === "cat");
  const dogs = strays.filter((s) => s.species === "dog");
  const order = [cats[0], dogs[0], cats[1], dogs[1], cats[2]].filter(Boolean).slice(0, count);
  for (const stray of order) {
    await page.evaluate((s) => window.__hearthwoodWorld.placeWalker(s.x + 3, s.z, 0), stray);
    await page.waitForFunction((id) => window.__hearthwoodWorld.companions.animals().some((a) => a.key === id), stray.id, { timeout: 60000 });
    await page.evaluate((id) => {
      window.__hearthwoodWorld.companions.win(id);
      window.__hearthwoodWorld.companions.keep();
    }, stray.id);
  }
  console.log(`companions: ${order.map((s) => s.species).join(", ")}`);
}

/** Every following companion caught up and settled round the fire, every resting one there too, Elliott still by it. */
async function settleRound(page) {
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(40));
  const animals = await page.evaluate(() => window.__hearthwoodWorld.companions.animals().filter((a) => a.kind !== "stray" && a.kind !== "friend"));
  const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
  console.log(`  round the fire: ${animals.map((a) => `${a.species} ${a.kind} ${Math.hypot(a.x - camp.x, a.z - camp.z).toFixed(1)} m ${a.activity}`).join("; ")}`);
}

/** The charms that show at camp at work, and keepsakes set out on their stone. */
async function dressCamp(page) {
  await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const today = world.date().days;
    world.brewing.work("bloom", today - 0.5);
    world.brewing.work("fireflies", today - 0.1);
    for (const k of ["honey-jar", "carved-fish", "felted-reindeer", "rowan-seedling"]) world.people.keepsake(k);
  });
}

/** A camera `distance` metres out from a point along a heading, `up` metres above the point's ground, looking at a point `look` metres up. */
async function cameraOn(page, at, heading, distance, up, look, lookAt = at) {
  const x = at.x + Math.sin(heading) * distance;
  const z = at.z + Math.cos(heading) * distance;
  const ay = await height(page, at.x, at.z);
  const gy = await height(page, x, z);
  const ly = await height(page, lookAt.x, lookAt.z);
  return { x, y: Math.max(gy + 0.6, ay + up), z, lookX: lookAt.x, lookY: ly + look, lookZ: lookAt.z };
}

/** A good spot to pitch on, open meadow near home: where the ghost shows warm. */
async function meadowSpot(page) {
  const spot = await page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    const home = world.camping.state().home;
    for (const r of [40, 60, 80, 100, 130]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const found = world.camping.findPitch(home.x + Math.cos(a) * r, home.z + Math.sin(a) * r, 6);
        if (found) return found;
      }
    }
    return null;
  });
  if (!spot) throw new Error("No good ground to pitch on near home");
  return spot;
}

/** The way from a point that looks over the most open ground, for a camera behind Elliott. */
async function openWay(page, at) {
  return page.evaluate((at) => {
    const world = window.__hearthwoodWorld;
    let best = { way: 0, score: -Infinity };
    for (let k = 0; k < 24; k++) {
      const way = (k / 24) * Math.PI * 2;
      let score = 0;
      for (let r = 3; r <= 24; r += 3) {
        const p = world.at(at.x + Math.sin(way) * r, at.z + Math.cos(way) * r);
        score -= p.woodland * 3 + (p.water > p.height ? 1 : 0);
      }
      if (score > best.score) best = { way, score };
    }
    return best.way;
  }, at);
}

if (ONLY === null || ONLY.some((o) => !o.startsWith("camp-phone"))) {
  const page = await openWorld(DESKTOP);
  await winCompanions(page, 4);

  // Packing up at the home camp: sat at the fire with the card up, and the camp packing away.
  if (want("camp-pack")) {
    const home = await page.evaluate(() => window.__hearthwoodWorld.camping.state());
    const start = { x: home.x + 3.4, z: home.z + 1.5, heading: Math.atan2(-3.4, -1.5) };
    await stand(page, start);
    await settleRound(page);
    await page.evaluate(() => window.__hearthwoodWorld.cooking.open());
    await shoot(page, "camp-pack-card", { hour: 17.5, chrome: true });
    await page.evaluate(() => window.__hearthwoodWorld.camping.packFromTheFire());
    await page.waitForFunction(() => window.__hearthwoodWorld.walker().mode === "ground" && window.__hearthwoodWorld.camping.state().carried, null, { timeout: 60000 });
    // From across the fire from Elliott, so they stand behind camp as it packs away.
    const away = { x: home.x - 6.8, z: home.z - 3.4 };
    const free = { x: away.x, y: home.y + 2.2, z: away.z, lookX: home.x, lookY: home.y + 0.3, lookZ: home.z };
    for (const at of [1.6, 0.8]) {
      await page.evaluate((at) => window.__hearthwoodWorld.camping.hold(at), at);
      await shoot(page, `camp-packing-${at}`, { hour: 17.5, free });
    }
    await page.evaluate(() => window.__hearthwoodWorld.camping.hold(null));
    await page.waitForFunction(() => !window.__hearthwoodWorld.camping.state().leaving, null, { timeout: 60000 });
    await shoot(page, "camp-packed", { hour: 17.5, free });
  } else {
    await page.evaluate(() => window.__hearthwoodWorld.camping.pack());
  }

  // Carrying camp, out on the meadow: from behind, and through their eyes.
  const meadow = await meadowSpot(page);
  const way = await openWay(page, meadow);
  const looking = standFor(meadow, way);
  if (want("camp-carry")) {
    await stand(page, looking);
    await shoot(page, "camp-carry-behind", { hour: 10.5, orbit: { yaw: way + 0.25, pitch: 0.1, distance: 2.3 } });
    await shoot(page, "camp-carry-side", { hour: 10.5, orbit: { yaw: way + 1.9, pitch: 0.1, distance: 2.6 } });
  }

  // The ghost on good ground, warm, with the prompt to pitch; and on ground that won't do, faint.
  if (want("camp-ghost")) {
    await stand(page, looking);
    const ghost = await page.evaluate(() => window.__hearthwoodWorld.camping.ghost());
    console.log(`ghost: ${JSON.stringify(ghost)}, offered ${await page.evaluate(() => window.__hearthwoodWorld.camping.offered())}`);
    if (!ghost?.good) throw new Error("The ghost isn't on good ground");
    await shoot(page, "camp-ghost-good", { hour: 10.5, orbit: { yaw: way + 0.35, pitch: 0.42, distance: 4.2 }, chrome: true });
    await shoot(page, "camp-ghost-first", { hour: 10.5, pov: "first", look: { yaw: way, pitch: -0.42 }, chrome: true });
    // Facing the nearest wood: no prompt, the ghost faint.
    const poor = await page.evaluate((m) => {
      const world = window.__hearthwoodWorld;
      for (let r = 6; r < 200; r += 3) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = m.x + Math.cos(a) * r;
          const z = m.z + Math.sin(a) * r;
          if (world.camping.trouble(x, z) === "cluttered" && world.at(x, z).woodland > 0.3) return { x, z };
        }
      }
      return null;
    }, meadow);
    if (poor) {
      const facing = await openWay(page, poor);
      await stand(page, standFor(poor, facing + Math.PI));
      const ghostPoor = await page.evaluate(() => window.__hearthwoodWorld.camping.ghost());
      console.log(`poor ghost: ${JSON.stringify(ghostPoor)}`);
      await shoot(page, "camp-ghost-poor", { hour: 10.5, orbit: { yaw: facing + Math.PI + 0.35, pitch: 0.42, distance: 4.2 }, chrome: true });
    }
  }

  // Camp going up: its pieces settling one by one, then the fire catching.
  if (want("camp-settle")) {
    await stand(page, looking);
    await page.evaluate(() => window.__hearthwoodWorld.camping.pitch());
    const site = await page.evaluate(() => window.__hearthwoodWorld.camping.state());
    const free = await cameraOn(page, site, way + Math.PI * 0.75, 6.5, 2.4, 0.3);
    for (const at of [0.45, 1.0, 1.5, 2.1]) {
      await page.evaluate((at) => window.__hearthwoodWorld.camping.hold(at), at);
      await shoot(page, `camp-settle-${at}`, { hour: 10.5, free });
    }
    await page.evaluate(() => window.__hearthwoodWorld.camping.hold(null));
    await page.evaluate(() => window.__hearthwoodWorld.camping.pack());
  }

  // A camp on a lake shore at dusk.
  if (want("camp-lake")) {
    const shore = await page.evaluate(() => {
      const world = window.__hearthwoodWorld;
      const home = world.camping.state().home;
      const depth = (x, z) => world.at(x, z).water - world.at(x, z).height;
      for (let r = 60; r < 4000; r += 24) {
        for (let a = 0; a < Math.PI * 2; a += 24 / r) {
          const lx = home.x + Math.cos(a) * r;
          const lz = home.z + Math.sin(a) * r;
          if (depth(lx, lz) < 3 || world.at(lx, lz).river > 0.1) continue;
          // Out from the lake's middle every way, to its shore, and a little up from it for camp.
          for (let k = 0; k < 16; k++) {
            const b = (k / 16) * Math.PI * 2;
            let edge = null;
            for (let s = 4; s < 400; s += 2) {
              const x = lx + Math.cos(b) * s;
              const z = lz + Math.sin(b) * s;
              if (depth(x, z) < -0.3) {
                edge = { x, z, s };
                break;
              }
            }
            if (!edge) continue;
            for (let up = 5; up <= 16; up += 1.5) {
              const x = lx + Math.cos(b) * (edge.s + up);
              const z = lz + Math.sin(b) * (edge.s + up);
              if (world.camping.trouble(x, z) === null) return { x, z, lake: { x: lx, z: lz }, edge };
            }
          }
        }
      }
      return null;
    });
    if (!shore) throw new Error("No lake shore to pitch on");
    console.log(`lake shore camp at ${shore.x.toFixed(0)}, ${shore.z.toFixed(0)}, ${Math.hypot(shore.x - shore.edge.x, shore.z - shore.edge.z).toFixed(1)} m from the water`);
    const toLake = Math.atan2(shore.lake.x - shore.x, shore.lake.z - shore.z);
    // Pitched facing the water, so Elliott sits looking out over the lake.
    await pitchAt(page, shore, toLake);
    await dressCamp(page);
    await settleRound(page);
    // From behind camp, inland, over the fire and the companions to the lake.
    const free = await cameraOn(page, shore, toLake + Math.PI - 0.6, 7.5, 2.6, 0.2, { x: shore.x + Math.sin(toLake) * 4, z: shore.z + Math.cos(toLake) * 4 });
    await shoot(page, "camp-lake-dusk", { hour: 19.1, free });
    await shoot(page, "camp-lake-night", { hour: 21.5, free });
    await shoot(page, "camp-lake-close", { hour: 19.1, free: await cameraOn(page, shore, toLake - 1.4, 4.2, 1.5, 0.15) });
    await page.evaluate(() => window.__hearthwoodWorld.camping.pack());
  }

  // A camp on a high valley ledge under a summit.
  if (want("camp-ledge")) {
    const ledge = await page.evaluate(() => {
      const world = window.__hearthwoodWorld;
      const h = (x, z) => world.at(x, z).height;
      let peak = null;
      for (let z = -12000; z <= 12000; z += 300) {
        for (let x = -12000; x <= 12000; x += 300) {
          const here = h(x, z);
          if (peak === null || here > peak.height) peak = { x, z, height: here };
        }
      }
      for (let z = peak.z - 300; z <= peak.z + 300; z += 30) {
        for (let x = peak.x - 300; x <= peak.x + 300; x += 30) {
          const here = h(x, z);
          if (here > peak.height) peak = { x, z, height: here };
        }
      }
      // The highest good spot a few kilometres off the summit, on a green ledge well up the range.
      let best = null;
      for (let r = 1200; r <= 4500; r += 60) {
        for (let a = 0; a < Math.PI * 2; a += 60 / r) {
          const x = peak.x + Math.cos(a) * r;
          const z = peak.z + Math.sin(a) * r;
          const here = h(x, z);
          // Up in the high valleys, above the trees and below the snow.
          if ((best && here < best.height) || here < 700 || here > 1250) continue;
          if (Math.abs(h(x + 6, z) - h(x - 6, z)) + Math.abs(h(x, z + 6) - h(x, z - 6)) > 2) continue;
          if (world.camping.trouble(x, z) === null) best = { x, z, height: here };
        }
      }
      return best && { ...best, peak };
    });
    if (!ledge) throw new Error("No ledge to pitch on under a summit");
    console.log(`ledge camp at ${ledge.x.toFixed(0)}, ${ledge.z.toFixed(0)}, ${ledge.height.toFixed(0)} m; summit ${ledge.peak.height.toFixed(0)} m, ${(Math.hypot(ledge.x - ledge.peak.x, ledge.z - ledge.peak.z) / 1000).toFixed(1)} km off`);
    const toPeak = Math.atan2(ledge.peak.x - ledge.x, ledge.peak.z - ledge.z);
    await pitchAt(page, ledge, toPeak + Math.PI);
    await dressCamp(page);
    await settleRound(page);
    // From the far side of camp from the summit, looking over the fire and up to it.
    const back = { x: ledge.x - Math.sin(toPeak) * 8, z: ledge.z - Math.cos(toPeak) * 8 };
    const by = await height(page, back.x, back.z);
    const free = { x: back.x + Math.cos(toPeak) * 2.5, y: Math.max(by, ledge.height) + 2.6, z: back.z - Math.sin(toPeak) * 2.5, lookX: ledge.peak.x, lookY: ledge.height + (ledge.peak.height - ledge.height) * 0.25, lookZ: ledge.peak.z };
    await shoot(page, "camp-ledge-golden", { hour: 17.6, free });
    await shoot(page, "camp-ledge-noon", { hour: 12.5, free });
    await shoot(page, "camp-ledge-close", { hour: 17.6, free: await cameraOn(page, ledge, toPeak + 1.9, 4.5, 1.8, 0.15) });
  }
  await page.context().close();
}

if (want("camp-phone")) {
  const page = await openWorld(PHONE);
  await page.evaluate(() => window.__hearthwoodWorld.cooking.open());
  await shoot(page, "camp-phone-card", { hour: 17.5, chrome: true });
  await page.evaluate(() => window.__hearthwoodWorld.camping.packFromTheFire());
  const meadow = await meadowSpot(page);
  const way = await openWay(page, meadow);
  await stand(page, standFor(meadow, way));
  await shoot(page, "camp-phone-pitch", { hour: 10.5, pov: "first", look: { yaw: way, pitch: -0.4 }, chrome: true });
  await shoot(page, "camp-phone-pitch-third", { hour: 10.5, orbit: { yaw: way + 0.35, pitch: 0.42, distance: 4.2 }, chrome: true });
  await page.context().close();
}

await browser.close();
