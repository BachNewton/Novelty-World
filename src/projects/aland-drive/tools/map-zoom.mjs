// The world map zoomed into a place the way a player does, a wheel notch at a time over it, until the map will go no
// lower and the place's tiles have landed, on the real clock. Prints each frame over 50 ms and the shader
// programs compiled once the start has settled, which should be none: a program first built mid-drive stalls its frame.
//
// Prereq: a page server. Usage (ALAND_DRIVE_URL as in look.mjs, its local tiles served by this script):
//   node src/projects/aland-drive/tools/map-zoom.mjs [--hour=23] [--at=<x,z>] [--size=1920x1080] [--folder=<tiles>]
// --at is the place in the scene, Mariehamn's Esplanade by default.

import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "1920x1080").split("x").map(Number);
const HOUR = option("hour", "23");
const AT = option("at", "-2400,6800").split(",").map(Number);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const URL = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SLOW_MS = 50;

const tiles = await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${URL}?tiles=local:${tiles.port}&hour=${HOUR}`, {
  width: WIDTH,
  height: HEIGHT,
  ready: () => window.__alandDrive?.mapReady() === true,
  cleanup: () => tiles.server.close(),
});

const settle = (frames) =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    for (const until = probe.frames() + count; probe.frames() < until; ) await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
    for (const until = probe.frames() + count; probe.frames() < until; ) await new Promise(requestAnimationFrame);
  }, frames);

await step("settling the start", () => settle(60));
// Every frame from here is watched from the page's own loop, so a frame and what it compiled are counted together.
await page.evaluate(() => {
  const probe = window.__alandDrive;
  const frames = [];
  window.__mapZoom = frames;
  let last = performance.now();
  let programs = probe.rendererMemory().programs;
  const watch = () => {
    const now = performance.now();
    const compiled = probe.rendererMemory().programs - programs;
    programs += compiled;
    frames.push({ ms: Math.round(now - last), compiled, heightM: Math.round(probe.cameraPlace()[1]), loading: probe.stream().loading });
    last = now;
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  probe.openMap(true);
});
await step("flying to the map", () => page.waitForFunction(() => window.__alandDrive.mapShown() === 1, null, { timeout: 0, polling: "raf" }));
await step("zooming in", async () => {
  for (let height = Infinity; ; ) {
    const [x, y] = await page.evaluate(([placeX, placeZ]) => window.__alandDrive.screenOf(placeX, placeZ), AT);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -100);
    const reached = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(window.__alandDrive.cameraPlace()[1]))));
    if (reached >= height) break;
    height = reached;
  }
});
await step("landing the place", () => settle(120));

const frames = await page.evaluate(() => window.__mapZoom);
const slow = frames.filter((frame) => frame.ms > SLOW_MS);
console.log(JSON.stringify({ hour: HOUR, at: AT, frames: frames.length, [`over${SLOW_MS}ms`]: slow.length, worstMs: Math.max(...frames.map((frame) => frame.ms)), programsCompiled: frames.reduce((sum, frame) => sum + frame.compiled, 0) }));
console.log(`slowest frames: ${JSON.stringify([...slow].sort((a, b) => b.ms - a.ms).slice(0, 12))}`);
const problems = reported();
if (problems) console.log(`The page reported:\n${problems}`);
await close();
