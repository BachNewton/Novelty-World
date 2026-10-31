// A few looks at the world, for checking a change by eye: opens the game in headless Chromium, moves the camera to each
// place, waits for the frames that show it, prints the frame's counts and saves a screenshot.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/look.mjs <out.png> [east north height yaw pitch] [--size=WxH]
//   node src/projects/aland-drive/tools/look.mjs --shots=<folder> [--size=WxH] <name>:<east>,<north>,<height>,<yaw>,<pitch> or <name>:<metres along Route 1> or <name>:<x1>,<y1>,<z1>,<x2>,<y2>,<z2> for a chase view along that line ...
// Positions are ETRS-TM35FIN metres. ALAND_DRIVE_URL overrides the page's address; add ?tiles=local:<port> to it for a
// local tile server (`tools/serve-tiles.mjs`), which is what a look should use rather than the real host.

import { chromium } from "playwright";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const [WIDTH, HEIGHT] = (option("size") ?? "1600x900").split("x").map(Number);
const URL = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FRAMES_TO_SETTLE = 3;
const SHOTS = option("shots");

const looks = SHOTS
  ? positional.map((look) => {
      const [name, place] = look.split(":");
      return { out: `${SHOTS}/${name}.png`, place: place.split(",").map(Number) };
    })
  : [{ out: positional[0] ?? "look.png", place: positional.slice(1).map(Number) }];

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
await page.waitForFunction(() => window.__alandDrive !== undefined, null, { timeout: 180000 }).catch(async (error) => {
  console.log(`no game: ${error.message}\n${[...new Set(problems)].slice(0, 20).join("\n")}\n${(await page.locator("body").innerText()).slice(0, 600)}`);
  await browser.close();
  process.exit(1);
});

for (const { out, place } of looks) {
  if (place.length === 5) {
    const [east, north, height, yaw, pitch] = place;
    await page.evaluate((at) => window.__alandDrive.look(at), { east, north, height, yaw, pitch });
  }
  // One number is a chase view, that far along the start tile's main road.
  if (place.length === 1) {
    await page.evaluate((along) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      probe.setCamera("chase");
      probe.startRoute(0, 40, along);
      probe.advance(600);
    }, place[0]);
  }
  // Six numbers are a chase view along a line of two scene points (x, y, z).
  if (place.length === 6) {
    await page.evaluate(async (points) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      probe.loadAround({ x: points[0], z: points[2] });
      await new Promise(requestAnimationFrame);
      while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
      probe.setCamera("chase");
      probe.startLine(points, 12);
      probe.loadAround(null);
      probe.advance(240);
    }, place);
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
  await page.screenshot({ path: out });
  console.log(out, JSON.stringify(report));
}
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
