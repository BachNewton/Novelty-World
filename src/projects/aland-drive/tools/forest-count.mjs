// What the forest, the verge and the reeds draw, counted by the GPU, at the showcase's views: trees on each list, triangles, draw calls, and any
// shader or validation error. Counts decide; the screenshots are only to see that nothing went wrong.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/forest-count.mjs [--folder=<tiles>] [--size=3440x1440] [--keys=2,4] [--shots=<folder>]
// ALAND_DRIVE_URL overrides the page's address.

import { openGame, settleFrames } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "2,4").split(",");
const SHOTS = option("shots", "");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;

const { server, port } = await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${port}`, { width: WIDTH, height: HEIGHT, cleanup: () => server.close() });

const settle = async () => {
  await settleFrames(page, SETTLE_FRAMES);
  return page.evaluate(() => {
    const probe = window.__alandDrive;
    return { ...probe.counts(), forest: probe.forestDrawn(), verge: probe.vergeDrawn(), reeds: probe.reedsDrawn(), shrubs: probe.shrubsDrawn(), granite: probe.graniteDrawn() };
  });
};

for (const key of KEYS) {
  const [counts, plain] = await step(`view ${key}`, async () => {
    await page.keyboard.press(`Digit${key}`);
    const shown = await settle();
    await page.evaluate(() => window.__alandDrive.showVerge(false));
    const without = await settle();
    await page.evaluate(() => window.__alandDrive.showVerge(true));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/view-${key}.png` });
    return [shown, without];
  });
  console.log(`view ${key}:`, JSON.stringify(counts), `without the verge: ${plain.drawCalls} draws, ${plain.triangles} triangles`);
}
console.log(reported() || "no errors or warnings");
await close();
