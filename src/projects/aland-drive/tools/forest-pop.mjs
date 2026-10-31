// How much the forest pops as the car moves, in numbers, from frame pairs half a second apart at speed. The car drives a
// route; at each stop, three frames:
//  the frame itself, from a still camera on the car's road, looking along it,
//  the same frame with the forest's distances measured from where the car will be half a second on (camera unmoved, so
//    only the forest's own changes show, with no parallax: this needs `window.__lodShift` in the game's frame loop, which
//    only a private patch of the game has),
//  the real next frame, the camera 27.5 m on, half a second at 55 m/s, compared with each pixel free to match within a few pixels, so
//    only what isn't explained by the view moving counts, in the band of the picture holding the distance.
//
// Prereq: a page server. Usage: node forest-pop.mjs --out=<folder> --gps=<x,z;x,z> [--size=2408x1007] [--stops=8] [--cost] [--folder=<tiles>]
// --cost skips the pictures and reads draw calls, triangles and GPU time over the stops instead.

/* eslint-disable security/detect-non-literal-fs-filename -- a folder this tool was told to write to */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "2408x1007").split("x").map(Number);
const OUT = option("out", "pop");
const GPS = option("gps", "").split(";").map((place) => place.split(",").map(Number));
const STOPS = Number(option("stops", "8"));
const COST = process.argv.includes("--cost");
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SPEED_M_S = 55;
const STEPS_PER_S = 120;
const STOP_EVERY_STEPS = 600;
const ONWARD_M = SPEED_M_S / 2;
const FRAMES = 30;
const ORIGIN = [110000, 6690000];
const CHANGED = 16;
/** A patch this big changing in one frame is a pop: growth moves an outline a pixel or two a frame. */
const POP_PX = 60;
const MATCH_PX = 5;
const BAND = [0.3, 0.52];

mkdirSync(OUT, { recursive: true });
const tiles = await serveTiles(FOLDER);
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(COST ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"])] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(error.stack ?? error.message));
await page.goto(`${PAGE}?tiles=local:${tiles.port}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive !== undefined || document.body.innerText.includes("rror"), null, { timeout: 180000 });

await page.evaluate(async ([from, to, speed]) => {
  const probe = window.__alandDrive;
  while (!probe.mapReady()) await new Promise(requestAnimationFrame);
  probe.hold(true);
  probe.loadAround({ x: from[0], z: from[1] });
  for (let frame = probe.frames() + 4; probe.frames() < frame || probe.stream().loading > 0; ) await new Promise(requestAnimationFrame);
  probe.placeNear(from[0], from[1]);
  if (!probe.setDestination(to[0], to[1])) throw new Error("no road leads there");
  const line = probe.routePoints();
  probe.setCamera("chase");
  probe.startLine(line, speed);
  probe.loadAround(null);
}, [GPS[0], GPS[1], SPEED_M_S]);

const settled = (steps) =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    if (count > 0) probe.advance(count);
    for (let frame = probe.frames() + 3; probe.frames() < frame || probe.stream().loading > 0; ) await new Promise(requestAnimationFrame);
    const car = probe.car();
    return { speed: Math.hypot(...car.velocity), rotation: car.rotation };
  }, steps);

async function pixels(path) {
  const buffer = await page.screenshot(path ? { path } : {});
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Pixels that changed, and the largest touching patch of them, which is what one whole tree appearing looks like. */
function changed(a, b) {
  const { width, height } = a;
  const marks = new Uint8Array(width * height);
  let count = 0;
  let sum = 0;
  // Below the head-up display at the top, above the mini map and the speed.
  for (let at = Math.round(0.06 * height) * width; at < Math.round(0.7 * height) * width; at++) {
    const delta = Math.max(Math.abs(a.data[at * 3] - b.data[at * 3]), Math.abs(a.data[at * 3 + 1] - b.data[at * 3 + 1]), Math.abs(a.data[at * 3 + 2] - b.data[at * 3 + 2]));
    if (delta > CHANGED) {
      marks[at] = 1;
      count++;
      sum += delta;
    }
  }
  let largest = 0;
  let pops = 0;
  const stack = [];
  for (let start = 0; start < marks.length; start++) {
    if (marks[start] !== 1) continue;
    marks[start] = 2;
    stack.push(start);
    let size = 0;
    while (stack.length > 0) {
      const at = stack.pop();
      size++;
      for (const next of [at - 1, at + 1, at - width, at + width]) {
        if (next >= 0 && next < marks.length && marks[next] === 1) {
          marks[next] = 2;
          stack.push(next);
        }
      }
    }
    largest = Math.max(largest, size);
    if (size >= POP_PX) pops++;
  }
  return { count, largest, sum, pops };
}

/** Pixels of the band of `b` with nothing close to them within a few pixels of `a`. */
function unmatched(a, b) {
  const { width, height } = a;
  let count = 0;
  for (let y = Math.round(BAND[0] * height); y < Math.round(BAND[1] * height); y++) {
    for (let x = MATCH_PX; x < width - MATCH_PX; x++) {
      const at = (y * width + x) * 3;
      let best = 255;
      for (let dy = -MATCH_PX; dy <= MATCH_PX && best > CHANGED; dy++) {
        for (let dx = -MATCH_PX; dx <= MATCH_PX; dx++) {
          const there = ((y + dy) * width + x + dx) * 3;
          const delta = Math.max(Math.abs(a.data[there] - b.data[at]), Math.abs(a.data[there + 1] - b.data[at + 1]), Math.abs(a.data[there + 2] - b.data[at + 2]));
          if (delta < best) best = delta;
        }
      }
      if (best > CHANGED) count++;
    }
  }
  return count;
}

const rows = [];
await settled(STEPS_PER_S * 8);
for (let stop = 0; stop < STOPS; stop++) {
  await settled(STOP_EVERY_STEPS);
  if (COST) {
    const reading = await page.evaluate(async () => {
      const probe = window.__alandDrive;
      const seen = [];
      for (let frame = 0; frame < 90; frame++) {
        await new Promise(requestAnimationFrame);
        const { gpuMs, drawCalls, triangles, width, height } = probe.counts();
        seen.push({ gpuMs, drawCalls, triangles, width, height });
      }
      return seen;
    });
    const gpu = reading.map((one) => one.gpuMs).filter((ms) => ms !== null).sort((a, b) => a - b);
    rows.push({ stop, gpuMedian: gpu[gpu.length >> 1], gpuP95: gpu[Math.floor(gpu.length * 0.95)], drawCalls: reading[89].drawCalls, triangles: reading[89].triangles, size: `${reading[89].width}x${reading[89].height}` });
    console.log(JSON.stringify(rows[rows.length - 1]));
    continue;
  }
  const view = await page.evaluate((onward) => {
    const { position, velocity } = window.__alandDrive.car();
    const speed = Math.hypot(velocity[0], velocity[2]);
    const way = [velocity[0] / speed, velocity[2] / speed];
    return { x: position[0], z: position[2], way, yaw: Math.atan2(-way[0], -way[1]), shift: [way[0] * onward, way[1] * onward] };
  }, ONWARD_M);
  const look = (metres) =>
    page.evaluate(({ at, origin }) => window.__alandDrive.look({ east: at.x + origin[0], north: origin[1] - at.z, height: 1.6, yaw: at.yaw, pitch: -0.02 }), { at: { ...view, x: view.x + view.way[0] * metres, z: view.z + view.way[1] * metres }, origin: ORIGIN });
  await look(0);
  await settled(0);
  const first = await pixels(`${OUT}/stop${stop}-a.png`);
  // Half a second at 60 fps, a frame at a time: a pop is a jump between two frames, where a tree that grows moves a little in each.
  let jumpPixels = 0;
  let largestJump = 0;
  let pops = 0;
  let previous = first;
  let shifted = first;
  for (let step = 1; step <= FRAMES; step++) {
    await page.evaluate((shift) => {
      window.__lodShift = shift;
    }, [(view.shift[0] * step) / FRAMES, (view.shift[1] * step) / FRAMES]);
    await settled(0);
    shifted = await pixels(step === FRAMES ? `${OUT}/stop${stop}-lod.png` : undefined);
    const jump = changed(previous, shifted);
    jumpPixels += jump.count;
    largestJump = Math.max(largestJump, jump.largest);
    pops += jump.pops;
    previous = shifted;
  }
  await page.evaluate(() => {
    window.__lodShift = undefined;
  });
  await look(ONWARD_M);
  await settled(0);
  const next = await pixels(`${OUT}/stop${stop}-b.png`);
  const lod = changed(first, shifted);
  rows.push({ stop, pops, jumpPixels, largestJump, lodPixels: lod.count, lodLargestPatch: lod.largest, unmatchedPixels: unmatched(first, next) });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
const mean = (name) => Math.round(rows.reduce((sum, row) => sum + row[name], 0) / rows.length);
const total = COST ? { gpuMedian: rows.map((row) => row.gpuMedian) } : { pops: rows.reduce((sum, row) => sum + row.pops, 0), jumpPixels: mean("jumpPixels"), largestJump: Math.max(...rows.map((row) => row.largestJump)), lodPixels: mean("lodPixels"), lodLargestPatch: Math.max(...rows.map((row) => row.lodLargestPatch)), unmatchedPixels: mean("unmatchedPixels") };
console.log("MEAN", JSON.stringify(total));
writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 1));
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 10).join("\n")}`);
await browser.close();
tiles.server.close();
