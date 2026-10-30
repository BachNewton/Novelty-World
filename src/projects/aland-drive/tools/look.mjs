// One look at the world, for checking a change by eye: opens the game in headless Chromium, moves the
// camera, waits for the frames that show it, prints the frame's counts and saves a screenshot.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/look.mjs <out.png> [east north height yaw pitch] [--size=WxH]
// Positions are ETRS-TM35FIN metres. ALAND_DRIVE_URL overrides the page's address; add ?tiles=local:<port> to it for a
// local tile server (`tools/serve-tiles.mjs`), which is what a look should use rather than the real host.

import { chromium } from "playwright";

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const [OUT = "look.png", ...PLACE] = positional;
const [WIDTH, HEIGHT] = (process.argv.find((arg) => arg.startsWith("--size="))?.slice(7) ?? "1600x900").split("x").map(Number);
const URL = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FRAMES_TO_SETTLE = 3;

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

if (PLACE.length === 5) {
  const [east, north, height, yaw, pitch] = PLACE.map(Number);
  await page.evaluate((place) => window.__alandDrive.look(place), { east, north, height, yaw, pitch });
}
await page.evaluate(async (settle) => {
  const probe = window.__alandDrive;
  const framesPass = async (count) => {
    const target = probe.frames() + count;
    while (probe.frames() < target) await new Promise(requestAnimationFrame);
  };
  await framesPass(settle);
  while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
  await framesPass(settle);
}, FRAMES_TO_SETTLE);

const report = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  return { counts: window.__alandDrive.counts(), gpu: adapter?.info?.description || adapter?.info?.vendor };
});
await page.screenshot({ path: OUT });
console.log(OUT, JSON.stringify(report));
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
