// The scripted drive along Route 1, in headless Chromium on the real GPU: the simulation is held and
// stepped by hand with the scripted driver, a fixed number of steps for each frame drawn, so the drive is
// the same every run. Prints what the drive did (contact losses, jolt, speed) and what the frames cost.
//
// Prereq: a server. Usage:
//   node src/projects/aland-drive/tools/drive.mjs [--size=3440x1440] [--steps-per-frame=4] [--shots=<folder>]
// ALAND_DRIVE_URL overrides the page's address.

import { chromium } from "playwright";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const STEPS_PER_FRAME = Number(option("steps-per-frame", "4"));
const SHOTS = option("shots", null);
const URL = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const CRUISE_M_S = 60;
const START_ALONG_M = 150;

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));

await page.goto(URL, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive !== undefined, null, { timeout: 120000 });

const gpu = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  return adapter?.info?.architecture || adapter?.info?.description || adapter?.info?.vendor;
});

const framesPassed = (count) =>
  page.evaluate(async (settle) => {
    const target = window.__alandDrive.frames() + settle;
    while (window.__alandDrive.frames() < target) await new Promise(requestAnimationFrame);
  }, count);

const drive = await page.evaluate(
  async ({ cruise, from, perFrame }) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    probe.startRoute(0, cruise, from);
    const costs = [];
    const interval = [];
    let last = performance.now();
    const budget = 200 * 120;
    let stepped = 0;
    while (!probe.routeFinished() && stepped < budget) {
      probe.advance(perFrame);
      stepped += perFrame;
      const frame = probe.frames();
      while (probe.frames() === frame) await new Promise(requestAnimationFrame);
      const now = performance.now();
      interval.push(now - last);
      last = now;
      const { gpuMs, drawCalls, triangles } = probe.counts();
      costs.push({ gpuMs, drawCalls, triangles });
    }
    return { log: probe.log(), costs, interval };
  },
  { cruise: CRUISE_M_S, from: START_ALONG_M, perFrame: STEPS_PER_FRAME },
);

const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))];
const summary = (values) => ({ median: Number(percentile(values, 0.5).toFixed(2)), p95: Number(percentile(values, 0.95).toFixed(2)), max: Number(Math.max(...values).toFixed(2)) });
const timed = drive.costs.map((cost) => cost.gpuMs).filter((value) => value !== null);

console.log(JSON.stringify({ gpu, viewport: `${WIDTH}x${HEIGHT}`, counts: await page.evaluate(() => window.__alandDrive.counts()) }));
console.log("drive:", JSON.stringify({ ...drive.log, topSpeedKmh: Number((drive.log.topSpeedMS * 3.6).toFixed(1)), kilometres: Number((drive.log.metres / 1000).toFixed(2)), seconds: drive.log.steps / 120 }));
console.log("draw calls:", JSON.stringify(summary(drive.costs.map((cost) => cost.drawCalls))), "triangles:", JSON.stringify(summary(drive.costs.map((cost) => cost.triangles))));
console.log("gpu ms:", timed.length > 0 ? JSON.stringify(summary(timed)) : "no timestamps came back", "frame interval ms:", JSON.stringify(summary(drive.interval)));

if (SHOTS !== null) {
  const shot = async (name, set) => {
    await page.evaluate(set);
    await framesPassed(8);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    console.log(`${SHOTS}/${name}.png`);
  };
  await shot("chase-route-1", () => {
    const probe = window.__alandDrive;
    probe.setCamera("chase");
    probe.startRoute(0, 40, 1200);
    probe.advance(1200);
  });
  await shot("hood-route-1", () => {
    window.__alandDrive.setCamera("hood");
  });
  // Where Route 1 meets road 40, from above the fields to its north-west.
  await shot("junction", () => window.__alandDrive.look({ east: 100222, north: 6694905, height: 9, yaw: -2.25, pitch: -0.32 }));
  // A metre above the land just off Route 1's edge, looking along it.
  const edge = await page.evaluate(() => {
    const probe = window.__alandDrive;
    probe.placeOnRoad(0, 3300);
    probe.advance(1);
    return probe.car().position;
  });
  await shot(
    "road-edge-low",
    new Function(`window.__alandDrive.look({ east: ${edge[0] + 110000 - 7}, north: ${6690000 - edge[2]}, height: 0.9, yaw: 0.1, pitch: -0.01 })`),
  );
}

if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
