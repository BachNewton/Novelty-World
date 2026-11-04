// Jumps to all ten showcase spots through the probe, screenshots each and prints what its frame cost: the repeatable
// view set for art and performance checks. Headless Chromium, on a tile server of its own.
//
// Prereq: a page server. Usage:
//   node src/projects/aland-drive/tools/showcase.mjs <folder> [--size=3440x1440] [--folder=<tiles>] [--keys=9,0]
// ALAND_DRIVE_URL overrides the page's address.

import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const OUT = process.argv[2];
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FRAMES_TO_SETTLE = 12;
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",");

const tiles = await serveTiles(option("folder", "src/projects/aland-drive/.data/tiles"));
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${tiles.port}`, { width: WIDTH, height: HEIGHT, ready: () => window.__alandDrive?.mapReady() === true, cleanup: () => tiles.server.close() });

for (const key of KEYS) {
  const counts = await step(`showcase ${key}`, async () => {
    await page.evaluate(async ([key, settle]) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      await probe.jumpTo(key);
      const frame = probe.frames() + settle;
      while (probe.frames() < frame) await new Promise(requestAnimationFrame);
    }, [key, FRAMES_TO_SETTLE]);
    await page.screenshot({ path: `${OUT}/showcase-${key}.png` });
    return page.evaluate(() => ({ ...window.__alandDrive.counts(), walls: window.__alandDrive.stoneWallsDrawn(), car: window.__alandDrive.car().position.map(Math.round), log: window.__alandDrive.log().farGroundSteps }));
  });
  console.log(key, JSON.stringify(counts));
}
const problems = reported();
if (problems) console.log(`The page reported:\n${problems}`);
await close();
