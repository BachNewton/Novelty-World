// Screenshots of Hearthwood's valley, for judging its look without a browser open: the walker's view at
// morning, golden hour, dusk and night, the whole valley from above and from over its rim, and the phone's
// touch controls on the target phone (a Pixel 8 Pro in Chrome, portrait and landscape), and the same valley
// through the witch's own eyes, with its hints. Prints what each
// frame drew (triangles, draw calls) and how long frames took (SHOTS_UNCAPPED=1 for the frame's own time).
//
// Drives the valley's probe (window.__hearthwoodValley, see ../components/valley/valley-probe.tsx) over
// Playwright and waits on its events (ready, frames drawn), never a sleep. Every shot holds the hour and
// the motion clock, so two runs differ only where the art does.
//
// Prereq: a dev server (npm run dev, or `npx next dev --port <port>` in a worktree) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/valley-shots.mjs [label] [--seed=<seed>] [--only=<name,...>]
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? null;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTDIR = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const MOTION_AT = 12;

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
  console.error(`The valley threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
}

async function openValley(device) {
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
    content: "nextjs-portal{display:none!important} html:not([data-shot-chrome]) [data-testid=hearthwood-valley] > :not(div:first-child){visibility:hidden!important}",
  });
  await page.waitForFunction(() => window.__hearthwoodValley?.isReady() === true, null, { timeout: 120000 });
  return page;
}

async function frames(page, count) {
  const start = await page.evaluate(() => window.__hearthwoodValley.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodValley.frameCount() >= n, start + count, { timeout: 60000 });
}

// The shots through the day and of the places are from behind her, in third person; the `fp-` ones are
// through her eyes, with `look` the way she looks.
async function capture(page, name, { hour, view = "walk", pov = "third", orbit = null, look = null, walker = null, chrome = false }) {
  await page.evaluate(
    ({ hour, view, pov, orbit, look, walker, motion, chrome }) => {
      const valley = window.__hearthwoodValley;
      valley.holdHour(hour);
      valley.holdMotion(motion);
      valley.setView(view);
      valley.setPointOfView(pov);
      if (orbit) valley.setOrbit(orbit);
      if (look) valley.setLook(look);
      if (walker) valley.placeWalker(walker.x, walker.z, walker.heading);
      document.documentElement.toggleAttribute("data-shot-chrome", chrome);
    },
    { hour, view, pov, orbit, look, walker, motion: MOTION_AT, chrome },
  );
  // The camera eases after the walker, so give it frames to arrive; then read a settled frame.
  await frames(page, 40);
  const drawn = await page.evaluate(() => window.__hearthwoodValley.drawn());
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  const times = drawn.frameTimes.slice(-30).sort((a, b) => a - b);
  console.log(
    `wrote ${path}  tris ${drawn.triangles}  calls ${drawn.calls}  points ${drawn.points}  buffer ${drawn.width}x${drawn.height}@${drawn.pixelRatio}  median frame ${times[Math.floor(times.length / 2)]?.toFixed(1)} ms`,
  );
}

const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

const desktop = await openValley(DESKTOP);
const camp = await desktop.evaluate(() => window.__hearthwoodValley.camp());
const places = await desktop.evaluate(() => window.__hearthwoodValley.places());
const atCamp = { x: camp.x + 3.4, z: camp.z + 1.5, heading: Math.atan2(-3.4, -1.5) };
const facingCamp = { yaw: Math.atan2(-3.4, -1.5), pitch: 0.28, distance: 7 };
const outward = { yaw: Math.atan2(-camp.x, -camp.z) + Math.PI, pitch: 0.18, distance: 7.5 };

const shots = [
  ["walk-morning", { hour: 8.3, walker: atCamp, orbit: facingCamp }],
  ["walk-golden", { hour: 17.4, walker: atCamp, orbit: facingCamp }],
  ["walk-dusk", { hour: 19.1, walker: atCamp, orbit: facingCamp }],
  ["walk-night", { hour: 22.5, walker: atCamp, orbit: facingCamp }],
  ["walk-golden-out", { hour: 17.4, walker: atCamp, orbit: outward }],
  ["walk-morning-out", { hour: 8.3, walker: atCamp, orbit: outward }],
  ["walk-night-sky", { hour: 23, walker: atCamp, orbit: { ...outward, pitch: -0.1, distance: 6 } }],
  ["above-noon", { hour: 12.5, view: "above" }],
  ["above-golden", { hour: 17.4, view: "above" }],
  ["aerial-golden", { hour: 17.4, view: "aerial" }],
  ["aerial-night", { hour: 22.5, view: "aerial" }],
];
for (const place of places) {
  // At the falls, stand where the trail ends and look at them; on the hilltop, stand by the cairn and look back
  // over the valley; at the circle, walk up to it from camp.
  const toward = Math.atan2(place.x - camp.x, place.z - camp.z);
  const stand =
    place.kind === "waterfall"
      ? { x: place.visitX, z: place.visitZ, heading: Math.atan2(place.x - place.visitX, place.z - place.visitZ) }
      : place.kind === "hilltop"
        ? { x: place.x - Math.sin(toward) * 3, z: place.z - Math.cos(toward) * 3, heading: toward + Math.PI }
        : { x: place.x - Math.sin(toward) * 14, z: place.z - Math.cos(toward) * 14, heading: toward };
  const yaw = place.kind === "hilltop" ? toward + Math.PI : stand.heading;
  const pitch = place.kind === "waterfall" ? -0.05 : 0.12;
  shots.push([`place-${place.kind}`, { hour: 16.6, walker: stand, orbit: { yaw, pitch, distance: 7 } }]);
}
// Through her eyes: at camp facing the fire, looking out of camp, walking out towards the forest, and
// the hints with the pointer free.
const outYaw = outward.yaw;
const towardsForest = { x: atCamp.x + Math.sin(outYaw) * 24, z: atCamp.z + Math.cos(outYaw) * 24, heading: outYaw };
shots.push(
  ["fp-golden-camp", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 } }],
  ["fp-golden-out", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: outYaw, pitch: 0 } }],
  ["fp-golden-forest", { hour: 17.4, pov: "first", walker: towardsForest, look: { yaw: outYaw, pitch: 0.04 } }],
  ["fp-morning-forest", { hour: 8.3, pov: "first", walker: towardsForest, look: { yaw: outYaw, pitch: 0.04 } }],
  ["fp-night-camp", { hour: 22.5, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.15 } }],
  ["fp-hints", { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true }],
  ["tp-hints", { hour: 17.4, walker: atCamp, orbit: facingCamp, chrome: true }],
);
for (const [name, shot] of shots) if (want(name)) await capture(desktop, name, shot);

async function phoneShots(device, name) {
  if (!want(name)) return;
  const page = await openValley(device);
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

// The target phone through her eyes: the touch hints and the view button, upright.
async function firstPersonPhoneShots(device, name) {
  if (!want(name)) return;
  const page = await openValley(device);
  const { width, height } = device.viewport;
  await page.touchscreen.tap(width * 0.8, height * 0.4);
  await capture(page, `${name}-hints`, { hour: 17.4, pov: "first", walker: atCamp, look: { yaw: facingCamp.yaw, pitch: -0.2 }, chrome: true });
  await page.context().close();
}
await firstPersonPhoneShots(PHONE_PORTRAIT, "fp-phone-portrait");
await firstPersonPhoneShots(PHONE_LANDSCAPE, "fp-phone-landscape");
await phoneShots(PHONE_LANDSCAPE, "phone-landscape");

await browser.close();
