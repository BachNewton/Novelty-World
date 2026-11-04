// What the parked cars cost: draw calls and triangles with them and without them at showcase views or looks of
// one's own, and how many stand across the loaded tiles and on the near lists. Counts decide; the screenshots are only
// to see that nothing went wrong.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/parked-count.mjs [--folder=<tiles>] [--size=3440x1440] [--keys=1,2] [--shots=<folder>] [name:east,north,height,yaw,pitch ...]
// Positions are ETRS-TM35FIN metres, as `tools/look.mjs` takes them. ALAND_DRIVE_URL overrides the page's address.

import { openGame, settleFrames } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2").split(",").filter(Boolean);
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
  return page.evaluate(() => {
    const probe = window.__alandDrive;
    return { ...probe.counts(), parked: probe.parkedCounts() };
  });
};

const views = [...KEYS.map((key) => ({ name: `view-${key}`, go: () => page.evaluate((id) => window.__alandDrive.jumpTo(id), key) })), ...LOOKS.map(({ name, at }) => ({ name, go: () => page.evaluate((place) => window.__alandDrive.look(place), at) }))];
for (const { name, go } of views) {
  const [counts, plain] = await step(name, async () => {
    await go();
    const shown = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
    await page.evaluate(() => window.__alandDrive.showParked(false));
    const without = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-without.png` });
    await page.evaluate(() => window.__alandDrive.showParked(true));
    return [shown, without];
  });
  console.log(`${name}: ${counts.drawCalls} draws, ${counts.triangles} triangles; without parked cars ${plain.drawCalls} draws, ${plain.triangles} triangles; ${counts.parked.parked} parked, ${counts.parked.near} on the near lists, ${counts.parked.distant} on the stand-ins'`);
}
console.log(reported() || "no errors or warnings");
await close();
