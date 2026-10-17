// Screenshots of Hearthwood's endless world, for judging its look without a browser open: camp through the
// day, walking views in each region at morning, golden hour and night, a range seen from afar with a pass
// in it, an aerial view, a top-down map of a few kilometres drawn from the world itself, the phone's
// touch controls on the target phone (a Pixel 8 Pro in Chrome, portrait and landscape), and camp through
// Elliott's own eyes, with its hints (the `fp-` shots). Prints what each
// frame drew (triangles, draw calls) and how long frames took (SHOTS_UNCAPPED=1 for the frame's own time).
//
// Drives the world's probe (window.__hearthwoodWorld, see ../components/valley/world-probe.tsx) over
// Playwright and waits on its events (ready, streamed in, frames drawn), never a sleep. Every shot holds
// the hour and the motion clock, so two runs differ only where the art does.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/world-shots.mjs [label] [--seed=<seed>] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;
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
  await page.goto(`${BASE}${SEED ? `?seed=${encodeURIComponent(SEED)}` : ""}`, { waitUntil: "load" });
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
async function capture(page, name, { hour, view = "walk", pov = "third", orbit = null, look = null, walker = null, free = null, chrome = false, haze = 1 }) {
  await page.evaluate(
    ({ hour, view, pov, orbit, look, walker, free, motion, chrome, haze }) => {
      const world = window.__hearthwoodWorld;
      world.holdHour(hour);
      world.setHaze(haze);
      world.holdMotion(motion);
      world.setView(view);
      world.setPointOfView(pov);
      world.setFreeCamera(free);
      if (orbit) world.setOrbit(orbit);
      if (look) world.setLook(look);
      if (walker) world.placeWalker(walker.x, walker.z, walker.heading);
      document.documentElement.toggleAttribute("data-shot-chrome", chrome);
    },
    { hour, view, pov, orbit, look, walker, free, motion: MOTION_AT, chrome, haze },
  );
  // The camera eases after the walker, and the world streams in round wherever it ends up: give the
  // camera frames to arrive, then wait for the streaming to settle, then read a settled frame.
  await frames(page, 40);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(page, 4);
  const drawn = await page.evaluate(() => window.__hearthwoodWorld.drawn());
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  const times = drawn.frameTimes.slice(-30).sort((a, b) => a - b);
  console.log(
    `wrote ${path}  tris ${drawn.triangles}  calls ${drawn.calls}  points ${drawn.points}  buffer ${drawn.width}x${drawn.height}@${drawn.pixelRatio}  median frame ${times[Math.floor(times.length / 2)]?.toFixed(1)} ms`,
  );
}

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

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
  ["camp-golden", { hour: 17.4, walker: atCamp, orbit: facingCamp }],
  ["camp-dusk", { hour: 19.1, walker: atCamp, orbit: facingCamp }],
  ["camp-night", { hour: 22.5, walker: atCamp, orbit: facingCamp }],
  ["camp-out-morning", { hour: 8.3, walker: atCamp, orbit: outward }],
  ["camp-out-golden", { hour: 17.4, walker: atCamp, orbit: outward }],
  ["camp-night-sky", { hour: 23, walker: atCamp, orbit: { ...outward, pitch: -0.1, distance: 6 } }],
  ["aerial-golden", { hour: 17.4, free: { x: camp.x - 260, y: 180, z: camp.z - 260, lookX: camp.x + 200, lookY: 20, lookZ: camp.z + 200 } }],
];
// Through Elliott's eyes: at camp facing the fire, looking out of camp, walking out, and the hints.
const towardsOut = { x: atCamp.x + Math.sin(outward.yaw) * 24, z: atCamp.z + Math.cos(outward.yaw) * 24, heading: outward.yaw };
shots.push(
  ["fp-golden-camp", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 } }],
  ["fp-golden-out", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: outward.yaw, pitch: 0 } }],
  ["fp-morning-walk", { hour: 8.3, pov: "first", walker: towardsOut, look: { yaw: outward.yaw, pitch: 0.04 } }],
  ["fp-night-camp", { hour: 22.5, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.15 } }],
  ["fp-hints", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true }],
  ["tp-hints", { hour: 17.4, walker: atCamp, orbit: facingCamp, chrome: true }],
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
  for (const [moment, hour] of [["morning", 8.3], ["golden", 17.4], ["night", 22.5]]) {
    await capture(desktop, `region-${region}-${moment}`, { hour, walker, orbit: { yaw: spot.yaw, pitch: 0.1, distance: 7.5 } });
  }
}

if (want("range")) {
  const { peak, view } = await findRange(desktop);
  console.log(`range: peak ${peak.height.toFixed(0)} m at ${peak.x}, ${peak.z}; viewing from ${view.x.toFixed(0)}, ${view.z.toFixed(0)}`);
  for (const [moment, hour] of [["morning", 9], ["golden", 17.4]]) {
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

async function phoneShots(device, name) {
  if (!want(name)) return;
  const page = await openWorld(device);
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = device.viewport;
  // A tap on the right half makes touch the last input used, without walking, so its hints show.
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await capture(page, `${name}-hints`, { hour: 17.4, walker: atCamp, orbit: facingCamp, chrome: true });
  const thumb = { x: width * 0.22, y: height * 0.78 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [thumb] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: thumb.x + 14, y: thumb.y - 40 }] });
  await capture(page, `${name}-stick`, { hour: 17.4, chrome: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await capture(page, `${name}-night`, { hour: 22.5, walker: atCamp, orbit: facingCamp });
  await page.context().close();
}
await phoneShots(PHONE_PORTRAIT, "phone-portrait");

// The target phone through Elliott's eyes: the touch hints and the view button.
async function firstPersonPhoneShots(device, name) {
  if (!want(name)) return;
  const page = await openWorld(device);
  const { width, height } = device.viewport;
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await capture(page, `${name}-hints`, { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true });
  await page.context().close();
}
await firstPersonPhoneShots(PHONE_PORTRAIT, "fp-phone-portrait");
await firstPersonPhoneShots(PHONE_LANDSCAPE, "fp-phone-landscape");
await phoneShots(PHONE_LANDSCAPE, "phone-landscape");

await browser.close();
