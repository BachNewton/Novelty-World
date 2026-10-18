// Comparison shots for two pairs of Hearthwood's shadow features that might do the same job twice:
// soft shadows against overcast softening (`shadow-softening`), and far shading against the sun's shadows
// (`distant-shade`). Each scene is shot four times from the same camera, hour, date, weather and motion clock,
// with the pair both off, each alone, and both on (every other feature at its default), and the mean absolute
// per-pixel difference (0-255) between the shots is printed.
//
// Drives the world's probe (window.__hearthwoodWorld) over Playwright and waits on its events, never a sleep.
//
// Prereq: a dev server (npm run dev) and `npx playwright install chromium` (one-time).
// Usage:  node src/projects/hearthwood/tools/overlap-shadow-shots.mjs [--only=<prefix,...>]
// Writes to src/projects/hearthwood/.shots/overlaps/<pair>/ (gitignored). HEARTHWOOD_URL overrides the page's address.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const OUTROOT = join(HERE, "..", ".shots", "overlaps");
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";
const want = (name) => ONLY === null || ONLY.some((o) => name.startsWith(o));

const PAIRS = {
  "shadow-softening": ["softShadows", "overcastShadows"],
  "distant-shade": ["farShading", "sunShadows"],
};

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", async (error) => {
  console.error(`The world threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
page.on("console", (m) => {
  if (m.type() === "error") console.error(`page ${m.type()}:`, m.text().slice(0, 2000));
});
await page.goto(`${BASE}?date=mabon`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-testid=hearthwood-world] > :not(div:first-child){visibility:hidden!important}" });
await page.waitForFunction(() => window.__hearthwoodWorld?.isReady() === true, null, { timeout: 300000 });
await page.evaluate(() => window.__hearthwoodWorld.holdMotion(12));

async function frames(count) {
  const start = await page.evaluate(() => window.__hearthwoodWorld.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodWorld.frameCount() >= n, start + count, { timeout: 120000 });
}

async function settle() {
  await frames(40);
  await page.waitForFunction(() => window.__hearthwoodWorld.settled(), null, { timeout: 300000 });
  await frames(4);
}

async function pixels(path) {
  return (await sharp(path).removeAlpha().raw().toBuffer());
}

function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Under part cloud the scene may sit in a cloud's shadow, where neither softening has a shadow to work on. The clouds
// drift with the motion clock, so this steps it until the middle of the frame is brightest: the sun out on the subject.
async function sunThroughCloud() {
  let best = { motion: 12, light: -1 };
  for (let motion = 12; motion <= 612; motion += 25) {
    await page.evaluate((m) => window.__hearthwoodWorld.holdMotion(m), motion);
    await frames(6);
    const shot = await page.screenshot({ type: "png", clip: { x: 400, y: 300, width: 800, height: 500 } });
    const { data } = await sharp(shot).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (const v of data) sum += v;
    const light = sum / data.length;
    if (light > best.light) best = { motion, light };
  }
  await page.evaluate((m) => window.__hearthwoodWorld.holdMotion(m), best.motion);
  console.log(`  sun through cloud at motion ${best.motion} (light ${best.light.toFixed(1)})`);
}

async function scene(pair, name, setup, arg = null) {
  if (!want(name)) return;
  const [a, b] = PAIRS[pair];
  const outdir = join(OUTROOT, pair);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
  mkdirSync(outdir, { recursive: true });
  await page.evaluate(setup, arg);
  await page.evaluate(() => window.__hearthwoodWorld.holdMotion(12));
  if (arg?.sunThroughCloud) await sunThroughCloud();
  const shots = { off: [false, false], [a]: [true, false], [b]: [false, true], both: [true, true] };
  const paths = {};
  for (const [label, [onA, onB]] of Object.entries(shots)) {
    await page.evaluate(({ a, b, onA, onB }) => {
      const world = window.__hearthwoodWorld;
      world.setFeature(a, onA);
      world.setFeature(b, onB);
    }, { a, b, onA, onB });
    await settle();
    paths[label] = join(outdir, `${name}__${label}.png`);
    await page.screenshot({ path: paths[label] });
  }
  const px = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([k, p]) => [k, await pixels(p)])));
  const info = await page.evaluate(() => ({ hour: window.__hearthwoodWorld.hour(), weather: window.__hearthwoodWorld.weather().held, motion: window.__hearthwoodWorld.motion(), camera: window.__hearthwoodWorld.camera() }));
  console.log(`${pair}/${name}  hour ${info.hour.toFixed(2)}  weather ${info.weather}  motion ${info.motion}  camera ${info.camera.x.toFixed(0)},${info.camera.y.toFixed(0)},${info.camera.z.toFixed(0)}`);
  console.log(`  off vs ${a}: ${meanDiff(px.off, px[a]).toFixed(3)}   off vs ${b}: ${meanDiff(px.off, px[b]).toFixed(3)}   ${a} vs both: ${meanDiff(px[a], px.both).toFixed(3)}   ${b} vs both: ${meanDiff(px[b], px.both).toFixed(3)}`);
  for (const p of Object.values(paths)) console.log(`  ${p}`);
  // Back to the defaults for the next scene.
  await page.evaluate(({ a, b }) => {
    window.__hearthwoodWorld.setFeature(a, true);
    window.__hearthwoodWorld.setFeature(b, true);
  }, { a, b });
}

const camp = await page.evaluate(() => window.__hearthwoodWorld.camp());

// Installs `__sunlit(x, z, hour)` in the page: whether the land at a spot sees the sun at that hour, marching
// towards it over the land for 8 km, so no scene sits in a mountain's shadow (camp does in the afternoon).
await page.evaluate(() => {
  window.__sunlit = (x, z, hour) => {
    const world = window.__hearthwoodWorld;
    world.holdHour(hour);
    const d = world.sky().key.direction;
    if (d.y <= 0.02) return false;
    const flat = Math.hypot(d.x, d.z);
    const y0 = world.at(x, z).height + 2;
    for (let s = 25; s < 8000; s += 25) {
      const px = x + (d.x / flat) * s;
      const pz = z + (d.z / flat) * s;
      if (world.at(px, pz).height > y0 + (d.y / flat) * s) return false;
    }
    return true;
  };
});

// A spot near camp in the sun at both hours, by its woods' density.
const find = (lo, hi, hours) =>
  page.evaluate(({ camp, lo, hi, hours }) => {
    const world = window.__hearthwoodWorld;
    for (let r = 100; r < 4000; r += 20) {
      for (let k = 0; k < 36; k++) {
        const t = (k / 36) * Math.PI * 2;
        const x = camp.x + Math.cos(t) * r;
        const z = camp.z + Math.sin(t) * r;
        const here = world.at(x, z);
        if (here.woodland < lo || here.woodland > hi || here.water > here.height - 0.5 || here.mountainous > 0.3) continue;
        const n = world.at(x + 4, z);
        const e = world.at(x, z + 4);
        if (Math.abs(n.height - here.height) > 1 || Math.abs(e.height - here.height) > 1) continue;
        if (hours.every((h) => window.__sunlit(x, z, h))) return { x, z, y: here.height };
      }
    }
    return null;
  }, { camp, lo, hi, hours });

const edge = await find(0.2, 0.4, [14, 15]);
const wood = await find(0.6, 1, [14, 15]);
const open = await find(0.08, 0.18, [15]);
console.log("edge", JSON.stringify(edge), "wood", JSON.stringify(wood), "open", JSON.stringify(open));

// Elliott on the spot, the camera on the sun's side and a little across, looking down past them, so their shadow
// and the trees' fall away across the frame.
const groundLook = ({ hour, weather, spot, raise, back }) => {
  const world = window.__hearthwoodWorld;
  world.holdHour(hour);
  world.holdWeather(weather);
  world.setFreeCamera(null);
  world.setView("walk");
  world.setPointOfView("third");
  world.placeWalker(spot.x, spot.z, 0);
  const d = world.sky().key.direction;
  const flat = Math.hypot(d.x, d.z) || 1;
  const ax = d.x / flat;
  const az = d.z / flat;
  const sx = -az;
  const sz = ax;
  const cx = spot.x + ax * back + sx * back * 0.5;
  const cz = spot.z + az * back + sz * back * 0.5;
  const cy = world.at(cx, cz).height + raise;
  world.setFreeCamera({ x: cx, y: cy, z: cz, lookX: spot.x - ax * 5, lookY: world.at(spot.x, spot.z).height, lookZ: spot.z - az * 5 });
};

// Elliott's own shadow up close: crisp at their feet, softer up to their hat.
const feetLook = ({ hour, weather, spot }) => {
  const world = window.__hearthwoodWorld;
  world.holdHour(hour);
  world.holdWeather(weather);
  world.setFreeCamera(null);
  world.setView("walk");
  world.setPointOfView("third");
  world.placeWalker(spot.x, spot.z, 0);
  const d = world.sky().key.direction;
  const flat = Math.hypot(d.x, d.z) || 1;
  const ax = d.x / flat;
  const az = d.z / flat;
  const y = world.at(spot.x, spot.z).height;
  // Beside Elliott, a little on the sun's side, looking along their shadow.
  world.setFreeCamera({ x: spot.x + ax * 1.5 - az * 3, y: y + 2.2, z: spot.z + az * 1.5 + ax * 3, lookX: spot.x - ax * 2.2, lookY: y, lookZ: spot.z - az * 2.2 });
};

for (const weather of ["clear", "cloudy"]) {
  const sunThroughCloud = weather === "cloudy";
  if (edge) await scene("shadow-softening", `wood-edge-afternoon-${weather}`, groundLook, { hour: 15, weather, spot: edge, raise: 7, back: 12, sunThroughCloud });
  if (open) await scene("shadow-softening", `elliott-shadow-afternoon-${weather}`, feetLook, { hour: 15, weather, spot: open, sunThroughCloud });
  if (wood) await scene("shadow-softening", `wood-floor-afternoon-${weather}`, groundLook, { hour: 14, weather, spot: wood, raise: 3.5, back: 7, sunThroughCloud });
}

// The land from high up at golden hour, across the light.
const ridge = await page.evaluate(() => {
  const world = window.__hearthwoodWorld;
  let best = null;
  for (let x = -2500; x <= 2500; x += 125) {
    for (let z = -2500; z <= 2500; z += 125) {
      const h = world.at(x, z).height;
      if (!best || h > best.y) best = { x, z, y: h };
    }
  }
  return best;
});
const ridgeLook = ({ ridge, turn, hour, above, dip }) => {
  const world = window.__hearthwoodWorld;
  world.holdHour(hour);
  world.holdWeather("clear");
  const d = world.sky().key.direction;
  const a = Math.atan2(d.z, d.x) + turn;
  world.setFreeCamera({ x: ridge.x, y: ridge.y + above, z: ridge.z, lookX: ridge.x + Math.cos(a) * 1000, lookY: ridge.y + above - dip, lookZ: ridge.z + Math.sin(a) * 1000 });
};
await scene("distant-shade", "ridge-across-golden", ridgeLook, { ridge, turn: Math.PI / 2, hour: 17.2, above: 30, dip: 140 });

// A sunlit knoll standing over the land round it, open enough to see out, looking across the light at high ground a
// few kilometres off.
const view = await page.evaluate(({ camp }) => {
  const world = window.__hearthwoodWorld;
  world.holdHour(17.2);
  const d = world.sky().key.direction;
  const sunA = Math.atan2(d.z, d.x);
  let best = null;
  for (let r = 200; r < 6000; r += 100) {
    for (let k = 0; k < 32; k++) {
      const t = (k / 32) * Math.PI * 2;
      const x = camp.x + Math.cos(t) * r;
      const z = camp.z + Math.sin(t) * r;
      const here = world.at(x, z);
      if (here.woodland > 0.3 || here.water > here.height - 0.5 || here.mountainous > 0.4) continue;
      let ring = -Infinity;
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        ring = Math.max(ring, world.at(x + Math.cos(a) * 150, z + Math.sin(a) * 150).height);
      }
      if (ring > here.height + 3) continue;
      if (!window.__sunlit(x, z, 17.2)) continue;
      for (const side of [1, -1]) {
        for (const off of [-0.4, -0.2, 0, 0.2, 0.4]) {
          const b = sunA + side * (Math.PI / 2 + off);
          for (let dd = 2500; dd <= 8000; dd += 500) {
            const h = world.at(x + Math.cos(b) * dd, z + Math.sin(b) * dd).height;
            const score = (h - here.height) / dd + (here.height - ring) / 1000;
            if (h - here.height > 400 && (!best || score > best.score)) best = { x, z, y: here.height, b, d: dd, h, score };
          }
        }
      }
    }
    if (best && r > 1500) return best;
  }
  return best;
}, { camp });
console.log("view", JSON.stringify(view));
if (view) {
  await scene("distant-shade", "knoll-to-range-golden", ({ view }) => {
    const world = window.__hearthwoodWorld;
    world.holdHour(17.2);
    world.holdWeather("clear");
    world.setFreeCamera({ x: view.x, y: view.y + 20, z: view.z, lookX: view.x + Math.cos(view.b) * view.d, lookY: view.y + (view.h - view.y) * 0.15, lookZ: view.z + Math.sin(view.b) * view.d });
  }, { view });
}

await browser.close();
