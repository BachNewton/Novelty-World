// What the roadside costs at the showcase's views: draw calls and triangles with the lamps, poles, signs, rails, edge posts,
// mailboxes, shelters, street furniture and town dressing and without them, and how many of each the loaded tiles hold.
// Counts decide; the screenshots are only to see that nothing went wrong.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/roadside-count.mjs [--folder=<tiles>] [--size=3440x1440] [--keys=1,2,3] [--shots=<folder>] [name:east,north,height,yaw,pitch ...]
// Positions are ETRS-TM35FIN metres, as `tools/look.mjs` takes them. ALAND_DRIVE_URL overrides the page's address.

import { openGame, settleFrames } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",").filter(Boolean);
const SHOTS = option("shots", "");
const LOOKS = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map((look) => {
  const [name, place] = look.split(":");
  const [east, north, height, yaw, pitch] = place.split(",").map(Number);
  return { name, at: { east, north, height, yaw, pitch } };
});
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;

const { server, port } = await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${port}`, { width: WIDTH, height: HEIGHT, cleanup: () => server.close() });

const settle = async () => {
  await settleFrames(page, SETTLE_FRAMES);
  return page.evaluate(() => ({ ...window.__alandDrive.counts(), roadside: window.__alandDrive.roadsideCounts() }));
};

const views = [...KEYS.map((key) => ({ name: `view-${key}`, go: () => page.keyboard.press(`Digit${key}`) })), ...LOOKS.map(({ name, at }) => ({ name, go: () => page.evaluate((place) => window.__alandDrive.look(place), at) }))];
for (const { name, go } of views) {
  const [counts, plain] = await step(name, async () => {
    await go();
    const shown = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
    await page.evaluate(() => window.__alandDrive.showRoadside(false));
    const without = await settle();
    await page.evaluate(() => window.__alandDrive.showRoadside(true));
    return [shown, without];
  });
  console.log(`${name}: ${counts.drawCalls} draws, ${counts.triangles} triangles; without the roadside ${plain.drawCalls} draws, ${plain.triangles} triangles; loaded ${JSON.stringify(counts.roadside)}`);
}
console.log(reported() || "no errors or warnings");
await close();
