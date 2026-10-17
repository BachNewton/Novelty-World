// Screenshots of Hearthwood's endless world, for judging its look without a browser open: camp through the
// day, walking views in each region at morning, golden hour and night, a range seen from afar with a pass
// in it, an aerial view, a top-down map of a few kilometres drawn from the world itself, the phone's
// touch controls on the target phone (a Pixel 8 Pro in Chrome, portrait and landscape) with the jump
// button on the ground and on the broom, camp through Elliott's own eyes, with its hints (the `fp-` shots),
// a glide on the broom down off a ridge, behind them and through their eyes (the `glide-` shots), and foraging
// (the `forage-` shots: a patch of each kind, a close-up through Elliott's eyes before and after picking, and the
// basket on desktop and the target phone), and the companions (the `companions-` shots: a stray cat watching from a
// woodland edge, a dog bounding up, the naming card on desktop and the target phone, Elliott walking with their
// companions in third and first person, the companions round the campfire, and a cat and a dog answering a pet). Prints what each
// frame drew (triangles, draw calls) and how long frames took (SHOTS_UNCAPPED=1 for the frame's own time).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx) over
// Playwright and waits on its events (ready, streamed in, frames drawn), never a sleep. Every shot holds
// the date, the hour and the motion clock, so two runs differ only where the art does. The shots are on the
// autumn equinox, whose day has every moment at its usual hour and a dark night, except the `calendar-`
// shots, which show the light through the year: a midsummer evening, a midwinter noon and a spring morning.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/world-shots.mjs [label] [--seed=<seed>] [--only=<name,...>] [--features=<-id,+id,none,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
// The features' switches for every shot, as `?features=` takes them (see ../features.ts).
const FEATURES = process.argv.find((arg) => arg.startsWith("--features="))?.slice("--features=".length) ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;
const DATE = "mabon";
const REGIONS = ["greenwood", "birchvale", "highlands", "heath", "maplewood"];

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
// The Pixel 8 Pro in Chrome: 448 x 997 CSS pixels at a device pixel ratio of 3, less Chrome's own bars.
const PHONE_PORTRAIT = { viewport: { width: 448, height: 870 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
const PHONE_LANDSCAPE = { viewport: { width: 997, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const USE_GPU = process.env.SHOTS_CPU !== "1";
// SHOTS_UNCAPPED=1 lifts the 60 fps cap, so the printed frame times measure the frame rather than the display.
const UNCAPPED = process.env.SHOTS_UNCAPPED === "1" ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [];
const browser = await chromium.launch({
  headless: true,
  args: [
    ...(USE_GPU ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    ...UNCAPPED,
  ],
});

async function failOnPageError(error) {
  console.error(`The world threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
}

async function openWorld(device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  page.on("pageerror", (error) => void failOnPageError(error));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.error(`page ${m.type()}:`, m.text());
  });
  const query = new URLSearchParams();
  if (SEED) query.set("seed", SEED);
  if (FEATURES !== null) query.set("features", FEATURES);
  await page.goto(`${BASE}${query.size > 0 ? `?${query}` : ""}`, { waitUntil: "load" });
  // The overlay (hints, buttons) is hidden unless a shot asks for it, by a rule rather than per element, so
  // what mounts while a shot settles is hidden too.
  await page.addStyleTag({
    content: "nextjs-portal{display:none!important} html:not([data-shot-chrome]) [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}",
  });
  await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

// Most shots are from behind Elliott, in third person; the `fp-` ones are through their eyes, with `look` the way they look.
// `glide` puts them on the broom over a spot and holds them there, so the shot is mid-glide.
// `keepMotion` leaves the motion clock as the shot set it (the companions' shots hold it themselves, mid-movement).
async function capture(page, name, { hour, date = DATE, view = "walk", pov = "third", orbit = null, look = null, walker = null, free = null, chrome = false, haze = 1, glide = null, keepMotion = false }) {
  await page.evaluate(
    ({ hour, date, view, pov, orbit, look, walker, free, motion, chrome, haze, glide, keepMotion }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setDate(date);
      world.setHaze(haze);
      if (!keepMotion) world.holdMotion(motion);
      world.setView(view);
      world.setPointOfView(pov);
      world.setFreeCamera(free);
      if (orbit) world.setOrbit(orbit);
      if (look) world.setLook(look);
      if (walker) world.placeWalker(walker.x, walker.z, walker.heading);
      world.holdWalker(glide !== null);
      if (glide) world.glide(glide.x, glide.z, glide.above, glide.heading);
      document.documentElement.toggleAttribute("data-shot-chrome", chrome);
    },
    { hour, date, view, pov, orbit, look, walker, free, motion: MOTION_AT, chrome, haze, glide, keepMotion },
  );
  // The camera eases after the walker, and the world streams in round wherever it ends up: give the
  // camera frames to arrive, then wait for the streaming to settle, then read a settled frame.
  await frames(page, 40);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const drawn = await page.evaluate(() => window.__hearthwoodWorld.drawn());
  const { sun, moon } = await page.evaluate(() => window.__hearthwoodWorld.sky());
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  const times = drawn.frameTimes.slice(-30).sort((a, b) => a - b);
  console.log(
    `wrote ${path}  sun ${sun.elevation.toFixed(1)}° (${sun.twilight})  moon ${moon.elevation.toFixed(1)}° ${moon.phase}  tris ${drawn.triangles}  calls ${drawn.calls}  points ${drawn.points}  buffer ${drawn.width}x${drawn.height}@${drawn.pixelRatio}  median frame ${times[Math.floor(times.length / 2)]?.toFixed(1)} ms`,
  );
}

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));
/** Whether any shot under a prefix is wanted, for a group of shots that sets up once. */
const wantAny = (prefix) => ONLY === null || ONLY.some((o) => o.startsWith(prefix) || prefix.startsWith(o));

/** A dry, gentle spot deep in a region, searched for outwards from camp: where to stand, and the way down the land. */
async function findRegionSpot(page, region) {
  return page.evaluate((region) => {
    const world = window.__hearthwoodWorld;
    for (let r = 250; r < 9000; r += 120) {
      const steps = Math.ceil((2 * Math.PI * r) / 160);
      for (let k = 0; k < steps; k++) {
        const angle = (k / steps) * Math.PI * 2 + r * 0.01;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const here = world.at(x, z);
        if (here.region !== region || here.regions[region] < 0.9 || here.height - here.water < 1.5 || here.river > 0 || here.woodland > 0.15) continue;
        const e = 3;
        const sx = world.at(x + e, z).height - world.at(x - e, z).height;
        const sz = world.at(x, z + e).height - world.at(x, z - e).height;
        if (Math.hypot(sx, sz) / (2 * e) > 0.35) continue;
        // Face the way the land opens out: towards the lowest of a ring of points 120 m off.
        let best = 0;
        let lowest = Infinity;
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const h = world.at(x + Math.sin(ang) * 120, z + Math.cos(ang) * 120).height;
          if (h < lowest) {
            lowest = h;
            best = ang;
          }
        }
        return { x, z, yaw: best };
      }
    }
    return null;
  }, region);
}

/** A range seen from afar: the highest point within reach, and a viewpoint on lower ground off one side of it, a long way back. */
async function findRange(page) {
  return page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    let peak = null;
    for (let z = -6000; z <= 6000; z += 150) {
      for (let x = -6000; x <= 6000; x += 150) {
        const here = world.at(x, z);
        if (peak === null || here.height > peak.height) peak = { x, z, height: here.height };
      }
    }
    // The lowest open, dry ground a long way off, so the view is across the valley floor to the range and not into a wood.
    let view = null;
    for (const out of [1700, 2100, 2500, 3000]) {
      for (let a = 0; a < 48; a++) {
        const angle = (a / 48) * Math.PI * 2;
        const x = peak.x + Math.cos(angle) * out;
        const z = peak.z + Math.sin(angle) * out;
        const here = world.at(x, z);
        if (here.woodland > 0.05 || here.height - here.water < 1) continue;
        if (view === null || here.height < view.height) view = { x, z, height: here.height };
      }
    }
    return { peak, view };
  });
}

/** The ridge with the longest drop near camp: open ground to stand on, and the way the land falls away from it. */
async function findRidge(page) {
  return page.evaluate(() => {
    const world = window.__hearthwoodWorld;
    let best = null;
    for (let z = -3000; z <= 3000; z += 150) {
      for (let x = -3000; x <= 3000; x += 150) {
        const here = world.at(x, z);
        if (here.height - here.water < 1) continue;
        for (let a = 0; a < 8; a++) {
          const heading = (a / 8) * Math.PI * 2;
          const drop = here.height - world.at(x + Math.sin(heading) * 600, z + Math.cos(heading) * 600).height;
          if (best === null || drop > best.drop) best = { x, z, height: here.height, drop, heading };
        }
      }
    }
    return best;
  });
}

const desktop = await openWorld(DESKTOP);
const camp = await desktop.evaluate(() => window.__hearthwoodWorld.camp());
const atCamp = { x: camp.x + 3.4, z: camp.z + 1.5, heading: Math.atan2(-3.4, -1.5) };
const facingCamp = { yaw: Math.atan2(-3.4, -1.5), pitch: 0.28, distance: 7 };
const outward = { yaw: Math.atan2(-camp.x, -camp.z) + Math.PI, pitch: 0.12, distance: 7.5 };

if (want("map")) {
  for (const [name, size, pixels, relief] of [["map-6km", 6000, 900, false], ["map-16km", 16000, 1000, false], ["map-16km-relief", 16000, 1000, true]]) {
    const url = await desktop.evaluate((r) => window.__hearthwoodWorld.map(r), { x: 0, z: 0, size, pixels, places: size <= 6000, relief });
    const path = join(OUTDIR, `${name}.png`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
    writeFileSync(path, Buffer.from(url.split(",")[1], "base64"));
    console.log(`wrote ${path}`);
  }
}

const shots = [
  ["camp-morning", { hour: 8.3, walker: atCamp, orbit: facingCamp }],
  ["camp-golden", { hour: 16.8, walker: atCamp, orbit: facingCamp }],
  ["camp-dusk", { hour: 19.1, walker: atCamp, orbit: facingCamp }],
  ["camp-night", { hour: 22.5, walker: atCamp, orbit: facingCamp }],
  ["camp-out-morning", { hour: 8.3, walker: atCamp, orbit: outward }],
  ["camp-out-golden", { hour: 16.8, walker: atCamp, orbit: outward }],
  ["camp-night-sky", { hour: 23, walker: atCamp, orbit: { ...outward, pitch: -0.1, distance: 6 } }],
  ["aerial-golden", { hour: 16.8, free: { x: camp.x - 260, y: 180, z: camp.z - 260, lookX: camp.x + 200, lookY: 20, lookZ: camp.z + 200 } }],
  // The light through the year, from the sun's real height at Helsinki's latitude.
  ["calendar-midsummer-2230", { date: "litha", hour: 22.5, walker: atCamp, orbit: outward }],
  ["calendar-midsummer-2230-camp", { date: "litha", hour: 22.5, walker: atCamp, orbit: facingCamp }],
  ["calendar-midwinter-noon", { date: "yule", hour: 12, walker: atCamp, orbit: outward }],
  ["calendar-midwinter-noon-camp", { date: "yule", hour: 12, walker: atCamp, orbit: facingCamp }],
  ["calendar-spring-morning", { date: "spring-4", hour: 8.5, walker: atCamp, orbit: outward }],
  ["calendar-spring-morning-camp", { date: "spring-4", hour: 8.5, walker: atCamp, orbit: facingCamp }],
];
// Through Elliott's eyes: at camp facing the fire, looking out of camp, walking out, and the hints.
const towardsOut = { x: atCamp.x + Math.sin(outward.yaw) * 24, z: atCamp.z + Math.cos(outward.yaw) * 24, heading: outward.yaw };
shots.push(
  ["fp-golden-camp", { hour: 16.8, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 } }],
  ["fp-golden-out", { hour: 16.8, pov: "first", walker: atCamp, look: { yaw: outward.yaw, pitch: 0 } }],
  ["fp-morning-walk", { hour: 8.3, pov: "first", walker: towardsOut, look: { yaw: outward.yaw, pitch: 0.04 } }],
  ["fp-night-camp", { hour: 22.5, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.15 } }],
  ["fp-hints", { hour: 16.8, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true }],
  ["tp-hints", { hour: 16.8, walker: atCamp, orbit: facingCamp, chrome: true }],
);
for (const [name, shot] of shots) if (want(name)) await capture(desktop, name, shot);

for (const region of REGIONS) {
  if (!want(`region-${region}`)) continue;
  const spot = await findRegionSpot(desktop, region);
  if (spot === null) {
    console.log(`no spot found deep in ${region}`);
    continue;
  }
  console.log(`${region}: standing at ${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}`);
  const walker = { x: spot.x, z: spot.z, heading: spot.yaw };
  for (const [moment, hour] of [["morning", 8.3], ["golden", 16.8], ["night", 22.5]]) {
    await capture(desktop, `region-${region}-${moment}`, { hour, walker, orbit: { yaw: spot.yaw, pitch: 0.1, distance: 7.5 } });
  }
}

if (want("range")) {
  const { peak, view } = await findRange(desktop);
  console.log(`range: peak ${peak.height.toFixed(0)} m at ${peak.x}, ${peak.z}; viewing from ${view.x.toFixed(0)}, ${view.z.toFixed(0)}`);
  for (const [moment, hour] of [["morning", 9], ["golden", 16.8]]) {
    await capture(desktop, `range-${moment}`, { hour, walker: { x: view.x, z: view.z }, free: { x: view.x, y: view.height + 30, z: view.z, lookX: peak.x, lookY: peak.height * 0.6, lookZ: peak.z } });
  }
  // On a perfectly clear day, with no haze to hide anything, the land must hold up out to the horizon on its own:
  // from the valley floor towards the range, from partway up looking out, and from the summit.
  const mid = await desktop.evaluate(({ peak, view }) => {
    // Partway up, on open ground: the first spot above the trees on the way from the valley floor to the peak.
    for (let t = 0.3; t < 0.9; t += 0.02) {
      const x = view.x + (peak.x - view.x) * t;
      const z = view.z + (peak.z - view.z) * t;
      const here = window.__hearthwoodWorld.at(x, z);
      if (here.woodland < 0.05) return { x, z, height: here.height };
    }
    return { x: (peak.x + view.x) / 2, z: (peak.z + view.z) / 2, height: window.__hearthwoodWorld.at((peak.x + view.x) / 2, (peak.z + view.z) / 2).height };
  }, { peak, view });
  const away = { x: view.x + (view.x - peak.x) * 10, z: view.z + (view.z - peak.z) * 10 };
  await capture(desktop, "clear-floor", { hour: 11, haze: 0, walker: { x: view.x, z: view.z }, free: { x: view.x, y: view.height + 2.5, z: view.z, lookX: peak.x, lookY: peak.height * 0.55, lookZ: peak.z } });
  await capture(desktop, "clear-ridge", { hour: 11, haze: 0, walker: { x: mid.x, z: mid.z }, free: { x: mid.x, y: mid.height + 4, z: mid.z, lookX: away.x, lookY: mid.height - 300, lookZ: away.z } });
  await capture(desktop, "clear-summit", { hour: 15, haze: 0, walker: { x: peak.x, z: peak.z }, free: { x: peak.x, y: peak.height + 6, z: peak.z, lookX: away.x, lookY: peak.height - 900, lookZ: away.z } });
  await capture(desktop, "clear-summit-hazy", { hour: 15, walker: { x: peak.x, z: peak.z }, free: { x: peak.x, y: peak.height + 6, z: peak.z, lookX: away.x, lookY: peak.height - 900, lookZ: away.z } });
}

const placeKinds = ["stone-circle", "cairn", "tor", "shrine", "fallen-tree", "fairy-ring", "seter", "tarn", "cascade", "waterfall"];
if (want("place")) {
  const places = await desktop.evaluate(() => window.__hearthwoodWorld.placesNear(0, 0, 9000));
  for (const kind of placeKinds) {
    const place = places.filter((p) => p.kind === kind).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (!place) {
      console.log(`no ${kind} within 5 km`);
      continue;
    }
    if (kind === "cascade" && place.foot) {
      // From below its foot, looking up the fall.
      const up = Math.atan2(place.x - place.foot.x, place.z - place.foot.z);
      const walker = { x: place.foot.x - Math.sin(up) * 25, z: place.foot.z - Math.cos(up) * 25, heading: up };
      await capture(desktop, `place-${kind}`, { hour: 16.6, walker, orbit: { yaw: up, pitch: -0.1, distance: 6 } });
      continue;
    }
    const back = kind === "waterfall" ? 16 : kind === "fallen-tree" ? 13 : kind === "tarn" ? (place.radius ?? 20) + 8 : kind === "seter" ? 24 : 11;
    const facing = kind === "waterfall" ? place.turn + Math.PI : place.turn + 0.7;
    const walker = { x: place.x + Math.sin(facing) * back, z: place.z + Math.cos(facing) * back, heading: facing + Math.PI };
    await capture(desktop, `place-${kind}`, { hour: 16.6, walker, orbit: { yaw: facing + Math.PI, pitch: kind === "waterfall" ? 0.05 : 0.2, distance: 7 } });
  }
}

if (want("glide")) {
  const ridge = await findRidge(desktop);
  console.log(`ridge: ${ridge.height.toFixed(0)} m at ${ridge.x}, ${ridge.z}, falling ${ridge.drop.toFixed(0)} m over 600 m`);
  // Some way out from the ridge, a little below its top, high over the valley.
  const out = 140;
  const x = ridge.x + Math.sin(ridge.heading) * out;
  const z = ridge.z + Math.cos(ridge.heading) * out;
  const below = await desktop.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z), { x, z });
  const glide = { x, z, above: ridge.height - 30 - Math.max(below.height, below.water), heading: ridge.heading };
  await capture(desktop, "glide-golden", { hour: 17.4, glide, orbit: { yaw: ridge.heading + 0.5, pitch: 0.2, distance: 6 } });
  await capture(desktop, "glide-golden-side", { hour: 17.4, glide, orbit: { yaw: ridge.heading - 1.3, pitch: 0.08, distance: 5 } });
  await capture(desktop, "glide-fp-golden", { hour: 17.4, pov: "first", glide, look: { yaw: ridge.heading, pitch: -0.12 } });
  await capture(desktop, "glide-fp-morning", { hour: 9, pov: "first", glide, look: { yaw: ridge.heading, pitch: -0.05 } });
  await capture(desktop, "glide-fp-hints", { hour: 17.4, pov: "first", glide, look: { yaw: ridge.heading, pitch: -0.2 }, chrome: true });
}

// Foraging. The basket starts empty for the run, the day is set for the kind (cloudberries ripen in July),
// and a patch is found by searching out from camp for the first place where a kind grows thick.
async function findPatch(page, kind, least) {
  return page.evaluate(({ kind, least }) => {
    const world = window.__hearthwoodWorld;
    for (let r = 0; r < 6000; r += 90) {
      const steps = Math.max(1, Math.ceil((2 * Math.PI * r) / 90));
      for (let k = 0; k < steps; k++) {
        const angle = (k / steps) * Math.PI * 2;
        const spots = world.forage.spotsNear(Math.cos(angle) * r, Math.sin(angle) * r, 45).filter((s) => s.kind === kind && s.look === "ripe");
        if (spots.length < least) continue;
        // The thickest part of the patch: the spot with the most of its kind within 4 m.
        const crowd = (s) => spots.filter((o) => Math.hypot(o.x - s.x, o.z - s.z) < 4).length;
        const heart = spots.reduce((best, s) => (crowd(s) > crowd(best) ? s : best));
        // Stand on the side where the woods are thinnest, so no tree's boughs are in the way.
        let away = null;
        for (let a = 0; a < 24; a++) {
          const ang = (a / 24) * Math.PI * 2;
          let woodland = 0;
          for (const out of [2.5, 4.5, 6.5, 8.5, 10.5]) {
            const here = world.at(heart.x + Math.sin(ang) * out, heart.z + Math.cos(ang) * out);
            woodland = Math.max(woodland, here.height < here.water + 0.3 ? 1 : here.woodland);
          }
          if (away === null || woodland < away.woodland) away = { angle: ang, woodland };
        }
        if (away === null || away.woodland > 0.2) continue;
        return { heart, away: away.angle, count: spots.filter((o) => Math.hypot(o.x - heart.x, o.z - heart.z) < 6).length };
      }
    }
    return null;
  }, { kind, least });
}

/** Elliott `back` metres from the heart of a patch, on its open side, facing it. */
function standBy(patch, back) {
  const { heart, away } = patch;
  const x = heart.x + Math.sin(away) * back;
  const z = heart.z + Math.cos(away) * back;
  return { x, z, yaw: Math.atan2(heart.x - x, heart.z - z) };
}

/** Where to look from Elliott's eyes, stood at `stand`, to look at a spot `lift` metres above its ground. */
async function aimAt(page, stand, spot, lift) {
  await page.evaluate(({ x, z, yaw }) => {
    const world = window.__hearthwoodWorld;
    world.setPointOfView("first");
    world.setView("walk");
    world.setFreeCamera(null);
    world.placeWalker(x, z, yaw);
    world.setLook({ yaw, pitch: 0 });
  }, stand);
  await frames(page, 30);
  const eye = await page.evaluate(() => window.__hearthwoodWorld.camera());
  const dx = spot.x - eye.x;
  const dz = spot.z - eye.z;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(spot.y + lift - eye.y, Math.hypot(dx, dz)) };
}

const FORAGE_SHOTS = [
  { kind: "bilberry", name: "bilberry-slope", day: 236, least: 20 },
  { kind: "chanterelle", name: "chanterelle-spot", day: 236, least: 8 },
  { kind: "cloudberry", name: "cloudberry-bog", day: 205, least: 8 },
  { kind: "fly-agaric", name: "fly-agaric-birches", day: 250, least: 4 },
  { kind: "raspberry", name: "raspberry-canes", day: 236, least: 4 },
  { kind: "wild-strawberry", name: "strawberry-edge", day: 190, least: 6 },
  { kind: "lingonberry", name: "lingonberry-heath", day: 250, least: 12 },
  { kind: "porcini", name: "porcini", day: 236, least: 3 },
  { kind: "funnel-chanterelle", name: "funnel-chanterelles", day: 280, least: 5 },
];
if (wantAny("forage")) {
  await desktop.evaluate(() => window.__hearthwoodWorld.forage.forget());
  for (const { kind, name, day, least } of FORAGE_SHOTS) {
    if (!want(`forage-${name}`)) continue;
    // The game day standing for that day of the year, which every capture holds.
    const date = await desktop.evaluate((d) => {
      window.__hearthwoodWorld.forage.setDayOfYear(d);
      return window.__hearthwoodWorld.date().day;
    }, day);
    const patch = await findPatch(desktop, kind, least);
    if (patch === null) {
      console.log(`no patch of ${kind} found`);
      continue;
    }
    console.log(`${kind}: ${patch.count} round ${patch.heart.x.toFixed(0)}, ${patch.heart.z.toFixed(0)}`);
    // From the open side, a little above, with Elliott at the patch's edge for scale.
    const beside = standBy(patch, 2.6);
    const from = standBy(patch, 7.5);
    const ground = await desktop.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, from);
    const free = { x: from.x, y: ground + 2.4, z: from.z, lookX: patch.heart.x, lookY: patch.heart.y + 0.3, lookZ: patch.heart.z };
    await capture(desktop, `forage-${name}`, { date, hour: 10.5, walker: { x: beside.x + Math.cos(beside.yaw) * 1.2, z: beside.z - Math.sin(beside.yaw) * 1.2, heading: beside.yaw }, free });
    // Close up through Elliott's eyes, looking at the spot with the prompt up, then picked.
    const close = standBy(patch, kind === "raspberry" ? 1.6 : 1.4);
    const look = await aimAt(desktop, close, patch.heart, kind === "raspberry" ? 0.6 : 0.08);
    await capture(desktop, `forage-${name}-close`, { date, hour: 10.5, pov: "first", walker: { x: close.x, z: close.z, heading: close.yaw }, look, chrome: true });
    const target = await desktop.evaluate(() => window.__hearthwoodWorld.forage.target());
    if (target === null) console.log(`  nothing on offer looking at the ${kind}`);
    else {
      await desktop.evaluate(() => window.__hearthwoodWorld.forage.pick());
      await capture(desktop, `forage-${name}-picked`, { date, hour: 10.5, pov: "first", walker: { x: close.x, z: close.z, heading: close.yaw }, look, chrome: true });
    }
  }
  if (want("forage-basket")) {
    await desktop.evaluate(() => window.__hearthwoodWorld.forage.setBasketOpen(true));
    await capture(desktop, "forage-basket-desktop", { date: await desktop.evaluate(() => window.__hearthwoodWorld.date().day), hour: 10.5, chrome: true });
    await desktop.evaluate(() => window.__hearthwoodWorld.forage.setBasketOpen(false));
  }
}

async function forageOnPhone(device, name) {
  if (!want(name)) return;
  const page = await openWorld(device);
  const { width, height } = device.viewport;
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  const date = await page.evaluate(() => {
    window.__hearthwoodWorld.forage.setDayOfYear(236);
    return window.__hearthwoodWorld.date().day;
  });
  const patch = await findPatch(page, "bilberry", 20);
  const close = standBy(patch, 1.4);
  const look = await aimAt(page, close, patch.heart, 0.08);
  await page.evaluate(() => window.__hearthwoodWorld.forage.forget());
  await capture(page, `${name}-prompt`, { date, hour: 10.5, pov: "first", walker: { x: close.x, z: close.z, heading: close.yaw }, look, chrome: true });
  // A few of what grows near, picked through the probe, so the basket has a row to show.
  await page.evaluate(() => {
    const forage = window.__hearthwoodWorld.forage;
    const here = window.__hearthwoodWorld.walker();
    for (const spot of forage.spotsNear(here.x, here.z, 9).filter((s) => s.look === "ripe").slice(0, 6)) forage.pick(spot.id);
    forage.setBasketOpen(true);
  });
  await capture(page, `${name}-basket`, { date, hour: 10.5, pov: "first", walker: { x: close.x, z: close.z, heading: close.yaw }, look, chrome: true });
  await page.context().close();
}
if (want("forage")) await forageOnPhone(PHONE_PORTRAIT, "forage-phone");

async function phoneShots(device, name) {
  if (!want(name)) return;
  const page = await openWorld(device);
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = device.viewport;
  // A tap on the right half makes touch the last input used, without walking, so its hints show.
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await capture(page, `${name}-hints`, { hour: 16.8, walker: atCamp, orbit: facingCamp, chrome: true });
  const thumb = { x: width * 0.22, y: height * 0.78 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [thumb] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: thumb.x + 14, y: thumb.y - 40 }] });
  await capture(page, `${name}-stick`, { hour: 16.8, chrome: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await capture(page, `${name}-night`, { hour: 22.5, walker: atCamp, orbit: facingCamp });
  // On the broom, the jump button shows it will put the broom away.
  const out = { x: atCamp.x + Math.sin(outward.yaw) * 30, z: atCamp.z + Math.cos(outward.yaw) * 30, above: 12, heading: outward.yaw };
  await capture(page, `${name}-glide`, { hour: 17.4, glide: out, orbit: { yaw: outward.yaw + 0.4, pitch: 0.25, distance: 6 }, chrome: true });
  await page.context().close();
}
await phoneShots(PHONE_PORTRAIT, "phone-portrait");

// The target phone through Elliott's eyes: the touch hints and the view button.
async function firstPersonPhoneShots(device, name) {
  if (!want(name)) return;
  const page = await openWorld(device);
  const { width, height } = device.viewport;
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await capture(page, `${name}-hints`, { hour: 16.8, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true });
  await page.context().close();
}
await firstPersonPhoneShots(PHONE_PORTRAIT, "fp-phone-portrait");
await firstPersonPhoneShots(PHONE_LANDSCAPE, "fp-phone-landscape");
await phoneShots(PHONE_LANDSCAPE, "phone-landscape");

// The companions. Their poses are staged by the probe and played in real frames (a body only blends into what it is
// doing frame by frame), then the motion clock is held where it is for the shot.
async function holdWhenSettled(page, seconds, key) {
  await page.waitForFunction(({ seconds, key }) => window.__hearthwoodWorld.companions.settled(seconds, key ?? undefined), { seconds, key: key ?? null }, { timeout: 120000 });
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
}
async function letMotionRun(page) {
  await page.evaluate(() => {
    window.__hearthwoodWorld.holdMotion(null);
    window.__hearthwoodWorld.holdHour(10.5);
  });
}
/** A spot `distance` metres from a point, back along a heading, facing it. */
const facing = (at, distance, heading) => ({ x: at.x - Math.sin(heading) * distance, z: at.z - Math.cos(heading) * distance, heading });
const towards = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

async function companionShots(page, phone) {
  await page.evaluate(() => window.__hearthwoodWorld.companions.forget());
  await letMotionRun(page);
  // Elliott at camp brings the strays round it to life.
  await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x, at.z, at.heading), atCamp);
  await frames(page, 10);
  const strays = await page.evaluate((c) => window.__hearthwoodWorld.companions.animals().filter((a) => a.kind === "stray").sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)), camp);
  const cat = strays.find((a) => a.species === "cat");
  if (!cat) throw new Error("No stray cat near camp");
  console.log(`cat ${cat.key} at ${cat.x.toFixed(0)}, ${cat.z.toFixed(0)}: boldness ${cat.boldness.toFixed(2)}, favourite ${cat.favourite}`);

  if (phone) {
    await page.evaluate((key) => window.__hearthwoodWorld.companions.win(key), cat.key);
    await capture(page, "companions-naming-phone", { hour: 10.5, walker: atCamp, orbit: facingCamp, chrome: true });
    return;
  }

  if (want("companions-stray")) {
    // A stray cat at the edge of the woods by camp, watching Elliott come.
    // Where it is now: it wanders round its home.
    const now = await page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key), cat.key);
    const heading = towards(atCamp, now) + 0.1;
    const stand = facing(now, 6, heading);
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x, at.z, at.heading), stand);
    await page.evaluate(() => window.__hearthwoodWorld.companions.simulate(6));
    await holdWhenSettled(page, 1.2, cat.key);
    await capture(page, "companions-stray-cat-watching", { hour: 10.5, walker: stand, orbit: { yaw: heading, pitch: 0.12, distance: 6 }, keepMotion: true });
    await capture(page, "companions-stray-cat-watching-fp", { hour: 10.5, pov: "first", walker: stand, look: { yaw: heading, pitch: -0.08 }, keepMotion: true });
  }

  // A friendly dog, the nearest to camp, bounding up to Elliott.
  const dogs = await page.evaluate((c) => window.__hearthwoodWorld.companions.straysNear(c.x, c.z, 700).filter((s) => s.species === "dog"), camp);
  let dog = null;
  for (const candidate of dogs.sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z))) {
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x + 40, at.z, 0), candidate);
    await frames(page, 4);
    const live = await page.evaluate((id) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === id) ?? null, candidate.id);
    if (live && live.boldness > -0.1) {
      dog = live;
      break;
    }
  }
  if (!dog) throw new Error("No friendly dog near camp");
  console.log(`dog ${dog.key} at ${dog.home.x.toFixed(0)}, ${dog.home.z.toFixed(0)}: boldness ${dog.boldness.toFixed(2)}`);
  if (want("companions-dog")) {
    await letMotionRun(page);
    const heading = Math.PI * 0.25;
    const stand = facing(dog.home, 13, heading);
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x, at.z, at.heading), stand);
    await page.evaluate(({ key, home }) => window.__hearthwoodWorld.companions.place(key, home.x, home.z, Math.PI * 1.25, "stand"), dog);
    await page.waitForFunction((key) => {
      const a = window.__hearthwoodWorld.companions.animals().find((x) => x.key === key);
      return a !== undefined && a.activity === "run" && a.held > 0.5;
    }, dog.key, { timeout: 120000 });
    await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
    const at = await page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key), dog.key);
    // From beside its way, low, a little ahead of it, with Elliott beyond.
    const side = { x: at.x + Math.cos(heading) * 3.2 + Math.sin(heading) * -1.5, z: at.z - Math.sin(heading) * 3.2 + Math.cos(heading) * -1.5 };
    const ground = await page.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, side);
    await capture(page, "companions-dog-bounding", { hour: 10.5, walker: stand, free: { x: side.x, y: ground + 0.8, z: side.z, lookX: at.x - Math.sin(heading) * 0.5, lookY: at.y + 0.35, lookZ: at.z - Math.cos(heading) * 0.5 }, keepMotion: true });
    await capture(page, "companions-dog-bounding-fp", { hour: 10.5, pov: "first", walker: stand, look: { yaw: heading, pitch: -0.12 }, keepMotion: true });
  }

  // Won over: the naming card.
  await letMotionRun(page);
  await page.evaluate((key) => window.__hearthwoodWorld.companions.win(key), dog.key);
  if (want("companions-naming")) {
    await capture(page, "companions-naming-desktop", { hour: 10.5, walker: null, orbit: { yaw: Math.PI * 0.25 + 0.35, pitch: 0.1, distance: 5.5 }, chrome: true, keepMotion: true });
  }
  const dogName = await page.evaluate(() => window.__hearthwoodWorld.companions.naming());
  await page.evaluate(() => window.__hearthwoodWorld.companions.keep());
  console.log(`the dog is ${dogName}`);

  // Two cats too: the camp cat and the next nearest.
  await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x, at.z, at.heading), atCamp);
  await frames(page, 6);
  const cats = await page.evaluate((c) => window.__hearthwoodWorld.companions.animals().filter((a) => a.kind === "stray" && a.species === "cat").sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)), camp);
  for (const one of cats.slice(0, 2)) {
    await page.evaluate((key) => {
      window.__hearthwoodWorld.companions.win(key);
      window.__hearthwoodWorld.companions.keep();
    }, one.key);
  }
  // Up to three: the nearest other strays, brought to life by walking Elliott over to them.
  const others = await page.evaluate((c) => window.__hearthwoodWorld.companions.straysNear(c.x, c.z, 900), camp);
  for (const other of others.sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z))) {
    const count = await page.evaluate(() => window.__hearthwoodWorld.companions.animals().filter((a) => a.kind === "following").length);
    if (count >= 3) break;
    await page.evaluate((at) => window.__hearthwoodWorld.placeWalker(at.x + 30, at.z, 0), other);
    await frames(page, 4);
    await page.evaluate((key) => {
      if (!window.__hearthwoodWorld.companions.animals().some((a) => a.key === key && a.kind === "stray")) return;
      window.__hearthwoodWorld.companions.win(key);
      window.__hearthwoodWorld.companions.keep();
    }, other.id);
  }
  const party = await page.evaluate(() => window.__hearthwoodWorld.companions.animals().filter((a) => a.kind === "following"));
  console.log(`following: ${party.map((a) => `${a.name} (${a.species})`).join(", ")}`);

  if (want("companions-walk")) {
    // Out of camp on the open meadow, walking with them: real frames, W held, then the motion held mid-stride.
    // The openest way out of camp: the least wooded over the next forty metres.
    const way = await page.evaluate((c) => {
      let best = { way: 0, wood: Infinity };
      for (let k = 0; k < 16; k++) {
        const way = (k / 16) * Math.PI * 2;
        let wood = 0;
        for (let r = 8; r <= 48; r += 4) {
          const here = window.__hearthwoodWorld.at(c.x + Math.sin(way) * r, c.z + Math.cos(way) * r);
          wood += here.woodland + (here.water > here.height ? 5 : 0);
        }
        if (wood < best.wood) best = { way, wood };
      }
      return best.way;
    }, atCamp);
    const start = { x: atCamp.x + Math.sin(way) * 8, z: atCamp.z + Math.cos(way) * 8, heading: way };
    for (const [pov, name, view] of [["third", "companions-walk", { orbit: { yaw: way + 2.0, pitch: 0.22, distance: 6.5 } }], ["first", "companions-walk-fp", { look: { yaw: way + Math.PI - 0.45, pitch: -0.22 } }]]) {
      await letMotionRun(page);
      await page.evaluate(
        ({ start, way, party }) => {
          const world = window.__hearthwoodWorld;
          world.setView("walk");
          world.setFreeCamera(null);
          world.setPointOfView("third");
          world.setOrbit({ yaw: way, pitch: 0.15, distance: 7 });
          world.placeWalker(start.x, start.z, way);
          party.forEach((a, i) => world.companions.place(a.key, start.x + (i - 1) * 1.5, start.z - 2.5, way, "stand"));
        },
        { start, way, party },
      );
      await frames(page, 5);
      await page.keyboard.down("KeyW");
      await frames(page, 120);
      await page.evaluate(() => window.__hearthwoodWorld.holdMotion(window.__hearthwoodWorld.motion()));
      await page.keyboard.up("KeyW");
      const here = await page.evaluate(() => window.__hearthwoodWorld.walker());
      // Looking back over a shoulder at them, behind in third person, through Elliott's eyes in first.
      await capture(page, name, { hour: 10.5, pov, walker: { x: here.x, z: here.z, heading: way }, ...view, keepMotion: true, chrome: pov === "first" });
    }
  }

  if (want("companions-campfire")) {
    await letMotionRun(page);
    await page.evaluate(
      ({ at, party }) => {
        const world = window.__hearthwoodWorld;
        world.setPointOfView("third");
        world.placeWalker(at.x, at.z, at.heading);
        party.forEach((a, i) => world.companions.place(a.key, at.x - 3 + i * 1.2, at.z + 3, 0, "stand"));
        world.companions.simulate(25);
      },
      { at: atCamp, party },
    );
    await holdWhenSettled(page, 1.5);
    const fire = await page.evaluate(() => window.__hearthwoodWorld.camp());
    const fy = await page.evaluate(({ x, z }) => window.__hearthwoodWorld.at(x, z).height, fire);
    const view = { x: fire.x + Math.cos(Math.PI * 1.1) * 5.5, y: fy + 2.4, z: fire.z + Math.sin(Math.PI * 1.1) * 5.5, lookX: fire.x, lookY: fy + 0.3, lookZ: fire.z };
    await capture(page, "companions-campfire", { hour: 18.4, walker: atCamp, free: view, keepMotion: true });
    await capture(page, "companions-campfire-night", { hour: 22.5, walker: atCamp, free: view, keepMotion: true });
  }

  if (want("companions-pet")) {
    // Each answering a pet: a cat's tail up and a slow blink, a dog's wag and wiggle; with the prompt to pet it.
    for (const one of [party.find((a) => a.species === "cat"), party.find((a) => a.species === "dog")]) {
      if (!one) continue;
      await letMotionRun(page);
      const spot = { x: atCamp.x + Math.sin(outward.yaw) * 12, z: atCamp.z + Math.cos(outward.yaw) * 12 };
      const heading = outward.yaw;
      const stand = facing(spot, one.species === "cat" ? 1.25 : 1.5, heading);
      await page.evaluate(
        ({ one, spot, stand, party }) => {
          const world = window.__hearthwoodWorld;
          world.placeWalker(stand.x, stand.z, stand.heading);
          world.companions.place(one.key, spot.x, spot.z, stand.heading + Math.PI, one.species === "cat" ? "sit" : "stand");
          // The others out of the way, behind Elliott.
          party.filter((a) => a.key !== one.key).forEach((a, i) => world.companions.place(a.key, stand.x - Math.sin(stand.heading) * (4 + i), stand.z - Math.cos(stand.heading) * (4 + i), stand.heading, "sit"));
          world.companions.pet(one.key);
        },
        { one, spot, stand, party },
      );
      await holdWhenSettled(page, one.species === "cat" ? 1.1 : 0.9, one.key);
      const now = await page.evaluate((key) => window.__hearthwoodWorld.companions.animals().find((a) => a.key === key), one.key);
      console.log(`  ${now.name} answering a pet: ${now.activity}, held ${now.held.toFixed(2)} s, ${Math.hypot(now.x - stand.x, now.z - stand.z).toFixed(2)} m from Elliott`);
      const side = { x: spot.x + Math.cos(heading) * 2.1, z: spot.z - Math.sin(heading) * 2.1 };
      await capture(page, `companions-pet-${one.species}`, { hour: 10.5, walker: stand, free: { x: side.x - Math.sin(heading) * 0.6, y: now.y + 0.9, z: side.z - Math.cos(heading) * 0.6, lookX: spot.x, lookY: now.y + 0.3, lookZ: spot.z }, keepMotion: true });
      await capture(page, `companions-pet-${one.species}-fp`, { hour: 10.5, pov: "first", walker: stand, look: { yaw: heading, pitch: -0.72 }, keepMotion: true, chrome: true });
    }
  }

  if (want("companions-row")) {
    await page.evaluate(() => window.__hearthwoodWorld.companions.setOpen(true));
    await capture(page, "companions-row-desktop", { hour: 10.5, walker: atCamp, orbit: facingCamp, chrome: true });
    await page.evaluate(() => window.__hearthwoodWorld.companions.setOpen(false));
  }
}
if (wantAny("companions")) await companionShots(desktop, false);
if (want("companions-naming")) {
  const page = await openWorld(PHONE_PORTRAIT);
  const { width, height } = PHONE_PORTRAIT.viewport;
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await companionShots(page, true);
  await page.context().close();
}

await browser.close();
