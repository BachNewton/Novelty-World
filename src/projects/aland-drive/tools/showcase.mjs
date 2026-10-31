// Jumps to all ten showcase spots through the probe, screenshots each and prints what its frame cost: the repeatable
// view set for art and performance checks. Headless Chromium, on a tile server of its own.
//
// Prereq: a page server. Usage:
//   node src/projects/aland-drive/tools/showcase.mjs <folder> [--size=3440x1440] [--folder=<tiles>]
// ALAND_DRIVE_URL overrides the page's address.

import { chromium } from "playwright";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const OUT = process.argv[2];
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FRAMES_TO_SETTLE = 12;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const tiles = await serveTiles(option("folder", "src/projects/aland-drive/.data/tiles"));
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.log(`thrown: ${error.stack ?? error.message}`));
await page.goto(`${PAGE}?tiles=local:${tiles.port}`);
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 180000 });

for (const key of KEYS) {
  await page.evaluate(async ([key, settle]) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    await probe.jumpTo(key);
    const frame = probe.frames() + settle;
    while (probe.frames() < frame) await new Promise(requestAnimationFrame);
  }, [key, FRAMES_TO_SETTLE]);
  await page.screenshot({ path: `${OUT}/showcase-${key}.png` });
  console.log(key, JSON.stringify(await page.evaluate(() => ({ ...window.__alandDrive.counts(), car: window.__alandDrive.car().position.map(Math.round), log: window.__alandDrive.log().farGroundSteps }))));
}

await browser.close();
tiles.server.close();
