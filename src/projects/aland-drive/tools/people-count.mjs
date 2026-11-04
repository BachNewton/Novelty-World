// What the people cost at the showcase's views: draw calls and triangles with them and without, and how many the loaded
// tiles hold. Counts decide; the screenshots are only to see that nothing went wrong.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/people-count.mjs [--folder=<tiles>] [--tiles-port=<port>] [--size=3440x1440] [--keys=1,2,9] [--shots=<folder>]
// --tiles-port uses a tile server already running instead of serving the folder. ALAND_DRIVE_URL overrides the page's address.

import { openGame, settleFrames } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const TILES_PORT = option("tiles-port", "");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",");
const SHOTS = option("shots", "");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;

const served = TILES_PORT ? null : await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${TILES_PORT || served.port}`, { width: WIDTH, height: HEIGHT, cleanup: () => served?.server.close() });

const settle = async () => {
  await settleFrames(page, SETTLE_FRAMES);
  return page.evaluate(() => {
    const probe = window.__alandDrive;
    return { ...probe.counts(), people: probe.peopleCounts() };
  });
};

for (const key of KEYS) {
  const [counts, plain] = await step(`view ${key}`, async () => {
    await page.evaluate((id) => window.__alandDrive.jumpTo(id), key);
    const shown = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/view-${key}.png` });
    await page.evaluate(() => window.__alandDrive.showPeople(false));
    const without = await settle();
    await page.evaluate(() => window.__alandDrive.showPeople(true));
    return [shown, without];
  });
  console.log(`view ${key}: ${counts.drawCalls} draws, ${counts.triangles} triangles; without people ${plain.drawCalls} draws, ${plain.triangles} triangles; loaded ${counts.people.figures} people, ${counts.people.triangles} triangles`);
}
console.log(reported() || "no errors or warnings");
await close();
