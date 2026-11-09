// Walks into each dealership and shoots it: from its door, from where its windows are seen, beside its first car with
// that car's figures up, and from that car's driver's seat; and the view through the windows held against the world
// itself, the room hidden and the island captured on entering, then the world from the same eye, at the same lens. For
// judging the rooms and the window view by eye. Headless Chromium, on a tile server of its own.
//
// Prereq: a page server. Usage:
//   node src/projects/aland-drive/tools/dealership.mjs <folder> [--size=1720x720] [--folder=<tiles>] [--sites=town-dealer,...] [--hour=13]
// ALAND_DRIVE_URL overrides the page's address.

import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const OUT = process.argv[2];
const [WIDTH, HEIGHT] = option("size", "1720x720").split("x").map(Number);
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const HOUR = Number(option("hour", "13"));
const FRAMES_TO_SETTLE = 6;

const tiles = await serveTiles(FOLDER);
const { worldOrigin } = await (await fetch(`http://localhost:${tiles.port}/world.json`)).json();
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${tiles.port}`, { width: WIDTH, height: HEIGHT, ready: () => window.__alandDrive?.mapReady() === true, cleanup: () => tiles.server.close() });
await page.evaluate((hour) => window.__alandDrive.setDay({ hour, held: true }), HOUR);

const settle = (frames = FRAMES_TO_SETTLE) =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    const frame = probe.frames() + count;
    while (probe.frames() < frame) await new Promise(requestAnimationFrame);
  }, frames);
const shoot = async (name) => {
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const doors = await page.evaluate(() => window.__alandDrive.dealership.doors());
const sites = option("sites", doors.map(({ site }) => site).join(",")).split(",");
for (const site of sites) {
  const door = doors.find((candidate) => candidate.site === site);
  if (!door) throw new Error(`no dealership at ${site}`);
  const inside = await step(`going into ${site}`, async () => {
    await page.evaluate(async ({ x, z, site }) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      probe.loadAround({ x, z });
      await new Promise(requestAnimationFrame);
      while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
      // The car stands in the door's ring, as a player's would.
      probe.startLine([x + 4, 0, z + 4, x + 8, 0, z + 8], 0);
      probe.loadAround(null);
      probe.dealership.enterAt(site);
      while (probe.dealership.state().phase !== "inside") await new Promise(requestAnimationFrame);
    }, { ...door, site });
    return page.evaluate(() => window.__alandDrive.dealership.state());
  });
  const { room, capture } = inside;
  const [viewX, , viewZ] = room.viewFrom;
  // The windows are seen from the door, turned to face the view.
  const towardView = Math.atan2(-(viewX - room.door.at[0]), -(viewZ - room.door.at[1]));
  const stand = (x, z, yaw, pitch = 0) => page.evaluate((at) => window.__alandDrive.dealership.standAt(...at), [x, z, yaw, pitch]);

  await stand(room.door.at[0], room.door.at[1], room.door.yaw, -0.08);
  await shoot(`${site}-door`);
  const counts = await page.evaluate(() => window.__alandDrive.counts());
  await stand(room.door.at[0], room.door.at[1], towardView, 0);
  await shoot(`${site}-windows`);

  const spot = room.spots[0];
  if (spot) {
    // Beside the first car, on its left, looking at it.
    const side = 3.4;
    const [c, s] = [Math.cos(spot.yaw), Math.sin(spot.yaw)];
    const [x, z] = [spot.at[0] - side * c, spot.at[2] + side * s];
    await stand(x, z, Math.atan2(-(spot.at[0] - x), -(spot.at[2] - z)), -0.15);
    await shoot(`${site}-car`);
    await page.evaluate(() => window.__alandDrive.dealership.sitAt(0));
    await shoot(`${site}-seat`);
    await page.evaluate(() => window.__alandDrive.dealership.sitAt(null));
  }

  // The window view against the world: the captured island alone from the capture's own eye, then the world from there.
  const yaw = towardView;
  await stand(viewX, viewZ, yaw, 0);
  await page.evaluate(() => window.__alandDrive.dealership.peek(true));
  await shoot(`${site}-view-captured`);
  await page.evaluate(() => {
    const probe = window.__alandDrive;
    probe.dealership.peek(false);
    probe.dealership.leave();
  });
  await settle();
  await page.evaluate((at) => window.__alandDrive.look(at), {
    east: capture.x + worldOrigin.east,
    north: -capture.z + worldOrigin.north,
    // The room's floor is the ground at its site, so the eye's height over the ground is the view's own.
    height: room.viewFrom[1],
    yaw: yaw + capture.yaw,
    pitch: 0,
  });
  await shoot(`${site}-view-world`);
  await page.evaluate(() => window.__alandDrive.setCamera("chase"));
  console.log(site, JSON.stringify({ cars: inside.cars, capture, draws: counts.drawCalls, triangles: counts.triangles, gpuMs: counts.gpuMs }));
}
const problems = reported();
if (problems) console.log(`The page reported:\n${problems}`);
await close();
