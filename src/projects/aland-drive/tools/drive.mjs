// The scripted drives across the tiles, in headless Chromium on the real GPU, each on a fresh server of its own so the
// bytes it counts are the drive's. Prints what each drive did, what its frames cost and what it downloaded.
//
// The route is the game's own: the car is put on the road nearest the first place, and the GPS sets a route through the
// rest in the scene's x and z (two places is exactly picking a destination on the world map).
//
// Prereq: a page server (the dev server is fine). Usage:
//   node src/projects/aland-drive/tools/drive.mjs --gps=<x,z;x,z;...> [--clock] [--kbps=<limit>] [--return]
//     [--size=3440x1440] [--steps-per-frame=8] [--cruise=<m/s>]
//
// --clock drives on the wall clock at real speed, so the frames and the stream race as they do for a player: it's what
// says whether loading stalled or the car outran it. Without it the simulation is held and stepped by hand, a fixed
// number of steps for each frame, waiting for the stream, so the drive and its bytes are the same every run.
// --return drives the route again in the same browser, to measure what the browser's cache saves. ALAND_DRIVE_URL
// overrides the page's address; the tile server is this script's own, whatever that address says.

import { chromium } from "playwright";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const flag = (name) => process.argv.includes(`--${name}`);
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const STEPS_PER_FRAME = Number(option("steps-per-frame", "8"));
const GPS = option("gps", "").split(";").map((place) => place.split(",").map(Number));
if (GPS.length < 2) throw new Error("--gps needs at least two places");
const CLOCK = flag("clock");
const KBPS = option("kbps", null);
const AGAIN = flag("return");
const CRUISE_M_S = Number(option("cruise", "60"));
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";

const tiles = await serveTiles(FOLDER, KBPS === null ? null : Number(KBPS));
// On the clock the frame rate stays capped, as a player's is: uncapped, frames outrun the GPU by seconds of queued work,
// and a texture copy then blocks the main thread until that drains, a stall no player meets.
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(CLOCK ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"])],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => {
  problems.push(`thrown: ${error.stack ?? error.message}`);
  console.log(`thrown: ${error.stack ?? error.message}`);
});

const loadStartedAt = Date.now();
await page.goto(`${PAGE}?tiles=local:${tiles.port}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive !== undefined, null, { timeout: 120000 });

const firstLoadSeconds = (Date.now() - loadStartedAt) / 1000;
const gpu = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  return { vendor: adapter?.info?.vendor, architecture: adapter?.info?.architecture, description: adapter?.info?.description };
});
const startingBytes = tiles.counts().served;
const counts = () => fetch(`http://localhost:${tiles.port}/__counts`).then((response) => response.json());

// The map's network arrives after the drive starts. Then the first place loads and the car goes on the road there.
const points = await page.evaluate(
  async (places) => {
    const probe = window.__alandDrive;
    while (!probe.mapReady()) await new Promise(requestAnimationFrame);
    probe.hold(true);
    probe.loadAround({ x: places[0][0], z: places[0][1] });
    for (let frame = probe.frames() + 4; probe.frames() < frame || probe.stream().loading > 0; ) await new Promise(requestAnimationFrame);
    probe.placeNear(places[0][0], places[0][1]);
    if (places.length > 2) return probe.routeThrough(places);
    if (!probe.setDestination(places[1][0], places[1][1])) throw new Error("no road leads there");
    return probe.routePoints();
  },
  GPS,
);
const ROUTE = `${(points.length / 3) | 0} points`;

/** Drives the route once, returning the log and each frame's cost. */
const driveOnce = () =>
  page.evaluate(
    async ({ line, cruise, perFrame, clock, limitSeconds }) => {
      const probe = window.__alandDrive;
      const nextFrame = async () => {
        const frame = probe.frames();
        for (let waited = 0; probe.frames() === frame; waited++) {
          if (waited > 2000) throw new Error(`the game stopped drawing, at ${JSON.stringify(probe.log())}`);
          await new Promise(requestAnimationFrame);
        }
      };
      const idle = async () => {
        await nextFrame();
        while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
        await nextFrame();
      };
      probe.hold(true);
      probe.setCamera("chase");
      probe.loadAround({ x: line[0], z: line[2] });
      await idle();
      const before = probe.stream();
      probe.startLine(line, cruise);
      probe.loadAround(null);
      await idle();
      const costs = [];
      const worst = [];
      const memory = [];
      const budgetSteps = 120 * 3600;
      let stepped = 0;
      let last = performance.now();
      probe.hold(!clock);
      const startedAt = performance.now();
      const giveUpAt = startedAt + limitSeconds * 1000;
      while (!probe.routeFinished() && stepped < budgetSteps && (!clock || performance.now() < giveUpAt)) {
        if (!clock) {
          probe.advance(perFrame);
          stepped += perFrame;
          while (probe.stream().loading > 0) {
            await new Promise(requestAnimationFrame);
            last = performance.now();
          }
        }
        await nextFrame();
        const now = performance.now();
        const interval = now - last;
        last = now;
        const { gpuMs, drawCalls, triangles } = probe.counts();
        costs.push({ interval, gpuMs, drawCalls, triangles });
        if (costs.length % 300 === 0) memory.push(probe.memory());
        if (interval > 25) worst.push({ interval: Number(interval.toFixed(1)), at: probe.log().metres | 0, loading: probe.stream().loading });
      }
      const after = probe.stream();
      // Summed up here: a long drive's frames are too many to send back through the page's bridge.
      const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
      const summary = (pick) => {
        const values = Float64Array.from(costs.map(pick).filter((value) => value !== null)).sort();
        if (values.length === 0) return null;
        const at = (share) => Number(percentile(values, share).toFixed(2));
        return { median: at(0.5), p95: at(0.95), p99: at(0.99), p999: at(0.999), max: at(1) };
      };
      const frames = { count: costs.length, drawCalls: summary((cost) => cost.drawCalls), triangles: summary((cost) => cost.triangles), gpuMs: summary((cost) => cost.gpuMs), interval: summary((cost) => cost.interval) };
      const memoryRange = (name) => ({ first: Number(memory[0]?.[name].toFixed(0)), peak: Number(Math.max(...memory.map((sample) => sample[name])).toFixed(0)), last: Number(memory[memory.length - 1]?.[name].toFixed(0)) });
      const held = { jsMB: memoryRange("jsMB"), meshMB: memoryRange("meshMB"), texturesMB: memory[0]?.texturesMB };
      return { held, finished: probe.routeFinished(), car: probe.car().position, log: probe.log(), frames, worst: worst.sort((a, b) => b.interval - a.interval).slice(0, 8), loads: after.loads - before.loads, unloads: after.unloads - before.unloads, stream: after, wallSeconds: (performance.now() - startedAt) / 1000 };
    },
    { line: points, cruise: CRUISE_M_S, perFrame: STEPS_PER_FRAME, clock: CLOCK, limitSeconds: Number(option("limit-seconds", "1500")) },
  );

const report = (label, drive, served) => {
  const km = drive.log.metres / 1000;
  const hours = drive.log.steps / 120 / 3600;
  console.log(`${label}:`, JSON.stringify({ finished: drive.finished, car: drive.car.map(Math.round), route: ROUTE, clock: CLOCK, kbps: KBPS, km: Number(km.toFixed(2)), minutes: Number((hours * 60).toFixed(1)), loads: drive.loads, unloads: drive.unloads, topSpeedKmh: Number((drive.log.topSpeedMS * 3.6).toFixed(1)), contactLosses: drive.log.contactLosses, airborneSteps: drive.log.airborneSteps, worstJoltG: Number(drive.log.worstJoltG.toFixed(2)), furthestOffRoadM: Number(drive.log.furthestOffRoadM.toFixed(1)), respawns: drive.log.respawns, farGroundSteps: drive.log.farGroundSteps }));
  console.log(`  download: ${JSON.stringify({ servedMB: Number((served.bytes / 1e6).toFixed(2)), requests: served.requests, mbPerKm: Number((served.bytes / 1e6 / km).toFixed(3)), mbPerHour: Number((served.bytes / 1e6 / hours).toFixed(0)) })}`);
  console.log(`  draw calls ${JSON.stringify(drive.frames.drawCalls)} triangles ${JSON.stringify(drive.frames.triangles)}`);
  console.log(`  gpu ms ${JSON.stringify(drive.frames.gpuMs)} frame interval ms ${JSON.stringify(drive.frames.interval)} (${drive.frames.count} frames, ${drive.wallSeconds.toFixed(0)} s)`);
  console.log(`  longest frames ${JSON.stringify(drive.worst)}`);
  console.log(`  held ${JSON.stringify(drive.held)}`);
};

console.log(JSON.stringify({ gpu, viewport: `${WIDTH}x${HEIGHT}`, drawnAt: await page.evaluate(() => { const { width, height } = window.__alandDrive.counts(); return `${width}x${height}`; }), startupMB: Number((startingBytes / 1e6).toFixed(2)), firstLoadSeconds }));

const first = await counts();
const watching = setInterval(() => {
  page.evaluate(() => JSON.stringify({ metres: window.__alandDrive?.log().metres | 0, frames: window.__alandDrive?.frames(), loaded: window.__alandDrive?.stream().loaded })).then(console.log, (error) => console.log(`no answer: ${error.message}`));
}, 60_000);
const drive = await driveOnce();
clearInterval(watching);
const second = await counts();
report("drive", drive, { bytes: second.served - first.served, requests: second.requests - first.requests });

if (AGAIN) {
  const back = await driveOnce();
  const third = await counts();
  report("return", back, { bytes: third.served - second.served, requests: third.requests - second.requests });
}

if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
tiles.server.close();
