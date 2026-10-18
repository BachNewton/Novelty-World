// Screenshots of the forest's animals in the world, for judging them without a browser open: a fox close up
// and following Elliott with a cat, a hedgehog curled up and riding in Elliott's basket, a red squirrel up its
// trunk, a mountain hare in its summer and its winter coat, roe deer grazing a meadow's edge at dawn, songbirds
// on a branch and on the ground, and butterflies over a summer meadow (the `wildlife-` shots).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx) over Playwright
// and waits on its events (ready, streamed in, frames drawn, animals settled into their poses), never a sleep.
// Every shot holds the date, the hour, the weather (clear) and, once staged, the motion clock.
//
// Prereq: a dev server (`npx next dev --port <port>` in a worktree) and `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/wildlife-shots.mjs [label] [--seed=<seed>] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "wildlife"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

async function openWorld() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
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
  await page.evaluate(() => window.__hearthwoodWorld.companions.forget());
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

/** Lets motion and the hours run, at a date and hour, so the animals play out what is staged in real frames. */
async function run(page, date, hour) {
  await page.evaluate(({ date, hour }) => {
    const world = window.__hearthwoodWorld;
    world.holdMotion(null);
    world.setDate(date);
    world.holdHour(hour);
  }, { date, hour });
}

/** Waits until the animal named has held what it is doing a while, then holds the motion there. */
async function holdWhenSettled(page, key, seconds = 1) {
  await page.waitForFunction(({ key, seconds }) => window.__hearthwoodWorld.companions.settled(seconds, key), { key, seconds }, { timeout: 120000 });
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
}

async function shoot(page, name, { free = null, pov = "third", orbit = null, chrome = false } = {}) {
  await page.evaluate(({ free, pov, orbit, chrome }) => {
    const world = window.__hearthwoodWorld;
    world.setView("walk");
    world.setPointOfView(pov);
    world.setFreeCamera(free);
    if (orbit) world.setOrbit(orbit);
    document.documentElement.toggleAttribute("data-shot-chrome", chrome);
  }, { free, pov, orbit, chrome });
  await frames(page, 20);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  const { sun } = await page.evaluate(() => window.__hearthwoodWorld.sky());
  console.log(`wrote ${path}  sun ${sun.elevation.toFixed(1)}°`);
}

const live = (page, key) => page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key) ?? null, key);
const ground = (page, x, z) => page.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, { x, z });
/** A camera `distance` metres from a point along a heading, `up` metres above its ground, looking at the point `look` metres up. */
async function cameraOn(page, at, heading, distance, up, look) {
  const x = at.x + Math.sin(heading) * distance;
  const z = at.z + Math.cos(heading) * distance;
  const gy = await ground(page, x, z);
  const ay = at.y ?? (await ground(page, at.x, at.z));
  return { x, y: Math.max(gy + 0.3, ay + up), z, lookX: at.x, lookY: ay + look, lookZ: at.z };
}

/** The nearest of a kind among the strays or friends round camp, brought to life by putting Elliott near it. */
async function nearest(page, list, species) {
  const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
  const all = await page.evaluate(({ list, camp }) => window.__hearthwoodWorld.companions[list](camp.x, camp.z, 2500), { list, camp });
  const found = all.filter((s) => s.species === species).sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z))[0];
  if (!found) throw new Error(`No ${species} within 2.5 km of camp`);
  return found;
}

const page = await openWorld();

if (want("wildlife-fox")) {
  const fox = await nearest(page, "straysNear", "fox");
  console.log(`fox ${fox.id} at ${fox.x.toFixed(0)}, ${fox.z.toFixed(0)}`);
  await run(page, "mabon", 10.5);
  await page.evaluate((f) => window.__hearthwoodWorld.placeWalker(f.x + 45, f.z, -Math.PI / 2), fox);
  await frames(page, 6);
  // Close up, standing at home, Elliott out of its way.
  await page.evaluate((f) => window.__hearthwoodWorld.companions.place(f.id, f.x, f.z, Math.PI * 0.5, "stand"), fox);
  await holdWhenSettled(page, fox.id, 1.2);
  const at = await live(page, fox.id);
  await shoot(page, "wildlife-fox-close", { free: await cameraOn(page, at, at.heading + 0.5, 2.1, 0.55, 0.42) });
  // Won over, and following Elliott with a cat across a meadow.
  await run(page, "mabon", 10.5);
  await page.evaluate((key) => {
    window.__hearthwoodWorld.companions.win(key);
    window.__hearthwoodWorld.companions.keep();
  }, fox.id);
  const cat = await nearest(page, "straysNear", "cat");
  await page.evaluate((c) => window.__hearthwoodWorld.placeWalker(c.x + 3, c.z, 0), cat);
  await frames(page, 6);
  await page.evaluate((key) => {
    window.__hearthwoodWorld.companions.win(key);
    window.__hearthwoodWorld.companions.keep();
  }, cat.id);
  const way = await page.evaluate((c) => {
    let best = { way: 0, wood: Infinity };
    for (let k = 0; k < 16; k++) {
      const way = (k / 16) * Math.PI * 2;
      let wood = 0;
      for (let r = 4; r <= 40; r += 4) {
        const here = window.__hearthwoodWorld.at(c.x + Math.sin(way) * r, c.z + Math.cos(way) * r);
        wood += here.woodland + (here.water > here.height ? 5 : 0);
      }
      if (wood < best.wood) best = { way, wood };
    }
    return best.way;
  }, cat);
  await page.evaluate(({ c, way }) => {
    const world = window.__hearthwoodWorld;
    world.placeWalker(c.x, c.z, way);
    world.setOrbit({ yaw: way, pitch: 0.15, distance: 7 });
    for (const a of world.companions.animals().filter((a) => a.kind === "following")) world.companions.place(a.key, c.x - Math.sin(way) * 2.5, c.z - Math.cos(way) * 2.5, way, "stand");
  }, { c: cat, way });
  await frames(page, 5);
  await page.keyboard.down("KeyW");
  await frames(page, 130);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  await page.keyboard.up("KeyW");
  const here = await page.evaluate(() => window.__hearthwoodWorld.walker());
  const side = { x: here.x - Math.sin(way) * 1.5 + Math.cos(way) * 5, z: here.z - Math.cos(way) * 1.5 - Math.sin(way) * 5 };
  const gy = await ground(page, side.x, side.z);
  await shoot(page, "wildlife-fox-following", { free: { ...side, y: gy + 1.3, lookX: here.x - Math.sin(way) * 3.2, lookY: here.y + 0.4, lookZ: here.z - Math.cos(way) * 3.2 } });
  await page.evaluate(() => window.__hearthwoodWorld.companions.forget());
}

if (want("wildlife-hedgehog")) {
  const hog = await nearest(page, "straysNear", "hedgehog");
  console.log(`hedgehog ${hog.id} at ${hog.x.toFixed(0)}, ${hog.z.toFixed(0)}`);
  await run(page, "summer-3", 11);
  await page.evaluate((h) => window.__hearthwoodWorld.placeWalker(h.x + 1.8, h.z + 0.6, -Math.PI / 2), hog);
  await frames(page, 6);
  // Elliott right beside it: it curls up.
  await page.evaluate((h) => window.__hearthwoodWorld.companions.place(h.id, h.x, h.z, Math.PI * 0.4, "lie"), hog);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(1.5));
  await holdWhenSettled(page, hog.id, 1.2);
  const at = await live(page, hog.id);
  console.log(`  curled: ${at.activity}`);
  await shoot(page, "wildlife-hedgehog-curled", { free: await cameraOn(page, at, -Math.PI / 2 + 0.6, 0.95, 0.38, 0.1) });
  // Won over, walked a long way: it rides in the basket, peeking out.
  await run(page, "summer-3", 11);
  await page.evaluate((key) => {
    window.__hearthwoodWorld.companions.win(key);
    window.__hearthwoodWorld.companions.keep();
  }, hog.id);
  await page.evaluate(() => window.__hearthwoodWorld.setOrbit({ yaw: 0, pitch: 0.15, distance: 4 }));
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForFunction((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key)?.ride === "riding", hog.id, { timeout: 60000 });
  await page.keyboard.up("ShiftLeft");
  await frames(page, 30);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  await page.keyboard.up("KeyW");
  const me = await page.evaluate(() => window.__hearthwoodWorld.walker());
  // From their right, a little ahead and low, the basket on their hip.
  const right = me.heading - Math.PI / 2;
  const eye = { x: me.x + Math.sin(right) * 1.6 + Math.sin(me.heading) * 0.9, z: me.z + Math.cos(right) * 1.6 + Math.cos(me.heading) * 0.9 };
  await shoot(page, "wildlife-hedgehog-basket", { free: { ...eye, y: me.y + 1.05, lookX: me.x + Math.sin(right) * 0.35, lookY: me.y + 0.78, lookZ: me.z + Math.cos(right) * 0.35 } });
  await page.evaluate(() => window.__hearthwoodWorld.companions.forget());
}

if (want("wildlife-squirrel")) {
  const squirrel = await nearest(page, "friendsNear", "squirrel");
  console.log(`squirrel ${squirrel.id} at ${squirrel.x.toFixed(0)}, ${squirrel.z.toFixed(0)}, trunk ${JSON.stringify(squirrel.trunk)}`);
  await run(page, "mabon", 10.5);
  await page.evaluate((s) => window.__hearthwoodWorld.placeWalker(s.x + 12, s.z + 3, -Math.PI / 2), squirrel);
  await frames(page, 6);
  const side = Math.atan2(12, 3);
  await page.evaluate(({ s, side }) => window.__hearthwoodWorld.companions.climb(s.id, Math.min(2.2, s.trunk.bare * 0.6), side), { s: squirrel, side });
  await holdWhenSettled(page, squirrel.id, 1.2);
  const trunkY = await ground(page, squirrel.trunk.x, squirrel.trunk.z);
  const at = { x: squirrel.trunk.x + Math.sin(side) * squirrel.trunk.radius, y: trunkY + Math.min(2.2, squirrel.trunk.bare * 0.6), z: squirrel.trunk.z + Math.cos(side) * squirrel.trunk.radius };
  await shoot(page, "wildlife-squirrel-trunk", { free: { x: at.x + Math.sin(side + 0.3) * 3.2, y: at.y - 0.4, z: at.z + Math.cos(side + 0.3) * 3.2, lookX: at.x, lookY: at.y + 0.05, lookZ: at.z } });
  await page.evaluate((s) => window.__hearthwoodWorld.companions.climb(s.id, null), squirrel);
}

if (want("wildlife-hare")) {
  const hare = await nearest(page, "friendsNear", "hare");
  console.log(`hare ${hare.id} at ${hare.x.toFixed(0)}, ${hare.z.toFixed(0)}`);
  for (const [season, date] of [["summer", "summer-4"], ["winter", "winter-3"]]) {
    await run(page, date, 11);
    await page.evaluate((h) => window.__hearthwoodWorld.placeWalker(h.x + 8, h.z, -Math.PI / 2), hare);
    await frames(page, 6);
    await page.evaluate((h) => {
      window.__hearthwoodWorld.companions.know(h.id);
      window.__hearthwoodWorld.companions.place(h.id, h.x, h.z, Math.PI * 0.35, "sit");
    }, hare);
    await holdWhenSettled(page, hare.id, 1.2);
    const at = await live(page, hare.id);
    await shoot(page, `wildlife-hare-${season}`, { free: await cameraOn(page, at, at.heading + 0.9, 1.9, 0.45, 0.25) });
  }
}

if (want("wildlife-deer")) {
  const deer = await nearest(page, "friendsNear", "deer");
  console.log(`deer ${deer.id} at ${deer.x.toFixed(0)}, ${deer.z.toFixed(0)}`);
  // Dawn on the autumn equinox: the sun just up, the deer out on their meadow.
  await run(page, "mabon", 6.4);
  await page.evaluate((d) => window.__hearthwoodWorld.placeWalker(d.x + 70, d.z + 20, -Math.PI / 2), deer);
  await frames(page, 6);
  await page.evaluate((d) => window.__hearthwoodWorld.companions.place(d.id, d.x, d.z, Math.PI * 0.6, "sit"), deer);
  await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(3));
  await holdWhenSettled(page, deer.id, 1.2);
  const at = await live(page, deer.id);
  console.log(`  deer ${at.activity}`);
  await shoot(page, "wildlife-deer-dawn", { free: await cameraOn(page, at, at.heading + 1.3, 7, 1.4, 0.7) });
}

if (want("wildlife-songbirds")) {
  await run(page, "mabon", 9);
  const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
  // Out from camp until a songbird is seen perched on the edge of a crown (or, failing that, anywhere up).
  let bird = null;
  for (let r = 0; r < 600 && !bird; r += 60) {
    await page.evaluate(({ c, r }) => window.__hearthwoodWorld.placeWalker(c.x + r, c.z + 4, 0), { c: camp, r });
    await frames(page, 30);
    const { birds } = await page.evaluate(() => window.__hearthwoodWorld.wildlife());
    bird = birds.find((b) => b.mode === "perched" && b.perch === "crown") ?? birds.find((b) => b.mode === "perched" && b.perch !== "ground") ?? null;
  }
  if (!bird) throw new Error("No perched songbird within 600 m of camp");
  console.log(`songbird ${bird.species} on a ${bird.perch} at ${bird.x.toFixed(1)}, ${bird.y.toFixed(1)}, ${bird.z.toFixed(1)}`);
  await page.evaluate((b) => window.__hearthwoodWorld.placeWalker(b.x + 14, b.z, -Math.PI / 2), bird);
  await frames(page, 20);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  const now = (await page.evaluate(() => window.__hearthwoodWorld.wildlife())).birds.find((b) => b.key === bird.key);
  // From out beyond the twig's end, looking back at the bird and the crown.
  // From out beyond the twig's end and a little below, looking back at the bird with the tree behind it.
  const out = now.twig ? { x: now.x - now.twig.x, z: now.z - now.twig.z } : { x: 1, z: 0.6 };
  const length = Math.hypot(out.x, out.z) || 1;
  const eye = { x: now.x + (out.x / length) * 1.4 + (out.z / length) * 0.5, z: now.z + (out.z / length) * 1.4 - (out.x / length) * 0.5 };
  await shoot(page, "wildlife-songbirds-perched", { free: { ...eye, y: now.y - 0.15, lookX: now.x, lookY: now.y + 0.06, lookZ: now.z } });
  // A bird down on the ground, hopping and pecking.
  await run(page, "mabon", 9);
  let ground = null;
  for (let tries = 0; tries < 40 && !ground; tries++) {
    await frames(page, 30);
    ground = (await page.evaluate(() => window.__hearthwoodWorld.wildlife())).birds.find((b) => b.mode === "ground") ?? null;
  }
  if (ground) {
    await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
    await shoot(page, "wildlife-songbirds-ground", { free: { x: ground.x + 0.8, y: ground.y + 0.3, z: ground.z + 0.5, lookX: ground.x, lookY: ground.y + 0.05, lookZ: ground.z } });
  } else console.log("no songbird came down to the ground to shoot");
}

if (want("wildlife-butterflies")) {
  await run(page, "summer-4", 13);
  const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());
  let spot = null;
  for (let r = 0; r < 900 && !spot; r += 70) {
    await page.evaluate(({ c, r }) => window.__hearthwoodWorld.placeWalker(c.x + r * 0.7, c.z - r * 0.7, 0), { c: camp, r });
    await frames(page, 12);
    const { butterflies } = await page.evaluate(() => window.__hearthwoodWorld.wildlife());
    spot = butterflies[0] ?? null;
  }
  if (!spot) throw new Error("No butterflies near camp");
  const { about } = await page.evaluate(() => window.__hearthwoodWorld.wildlife());
  console.log(`butterflies on the wing: ${(about.butterflies * 100).toFixed(0)}%`);
  await page.evaluate((s) => window.__hearthwoodWorld.placeWalker(s.x + 9, s.z + 2, -Math.PI / 2), spot);
  await frames(page, 30);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
  await shoot(page, "wildlife-butterflies", { free: { x: spot.x + 1.6, y: spot.y + 1.6, z: spot.z + 1.0, lookX: spot.x, lookY: spot.y + 0.35, lookZ: spot.z } });
}

await browser.close();
