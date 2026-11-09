// What traffic costs in the drive: draw calls and triangles with cars, cyclists and walkers and without them at showcase views
// or looks of one's own, and how many ride round the car and how many of those the camera sees. Each view is jumped to,
// which fills the lanes afresh, then the simulation is stepped by hand so traffic has moved off its slots. Counts
// decide; the screenshots are only to see that nothing went wrong. Traffic needs tiles with lanes: elsewhere there is none.
//
// --times=<month>@<hour>,... counts each view at each of those times of the game's year and day instead of the page's own
// (`traffic/rhythm.ts`): `--times=7@8,7@3,1@8` is a July morning's peak, a July night and a January morning.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/traffic-count.mjs [--folder=<tiles>] [--size=3440x1440] [--keys=1,2] [--seconds=30] [--times=7@8,1@3] [--shots=<folder>] [name:east,north,height,yaw,pitch ...]
// Positions are ETRS-TM35FIN metres, as `tools/look.mjs` takes them. ALAND_DRIVE_URL overrides the page's address.

import { openGame, settleFrames } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2").split(",").filter(Boolean);
const SECONDS = Number(option("seconds", "30"));
const SHOTS = option("shots", "");
const TIMES = option("times", "").split(",").filter(Boolean).map((time) => {
  const [month, hour] = time.split("@").map(Number);
  return { name: `${month}@${hour}`, month, hour };
});
const LOOKS = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map((look) => {
  const [name, place] = look.split(":");
  const [east, north, height, yaw, pitch] = place.split(",").map(Number);
  return { name, at: { east, north, height, yaw, pitch } };
});
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;
const STEPS_PER_S = 120;

const { server, port } = await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${port}`, { width: WIDTH, height: HEIGHT, cleanup: () => server.close() });

const settle = async () => {
  await settleFrames(page, SETTLE_FRAMES);
  return page.evaluate(() => {
    const probe = window.__alandDrive;
    const vehicles = probe.trafficCars();
    const seen = vehicles.filter((vehicle) => probe.trafficSeen(vehicle));
    const of = (list, kind) => list.filter((vehicle) => vehicle.kind === kind).length;
    return { ...probe.counts(), cars: of(vehicles, "car"), bikes: of(vehicles, "bike"), walkers: of(vehicles, "walker"), carsSeen: of(seen, "car"), bikesSeen: of(seen, "bike") };
  });
};
const traffic = (density) => page.evaluate((to) => {
  window.__alandDrive.traffic(to);
  window.__alandDrive.cyclists(to);
  window.__alandDrive.walkers(to);
}, density);

const places = [...KEYS.map((key) => ({ name: `view-${key}`, go: () => page.evaluate((id) => window.__alandDrive.jumpTo(id), key) })), ...LOOKS.map(({ name, at }) => ({ name, go: () => page.evaluate((place) => window.__alandDrive.look(place), at) }))];
// The time is set before each jump, which fills the lanes afresh for it.
const views = TIMES.length === 0 ? places : places.flatMap((place) => TIMES.map(({ name, month, hour }) => ({
  name: `${place.name} ${name}`,
  go: async () => {
    await page.evaluate((change) => window.__alandDrive.setDay(change), { calendar: { month, day: 2 }, hour, held: true });
    await place.go();
  },
})));
for (const { name, go } of views) {
  const [counts, plain] = await step(name, async () => {
    await go();
    await page.evaluate((steps) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      probe.advance(steps);
    }, SECONDS * STEPS_PER_S);
    const shown = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
    await traffic(0);
    const without = await settle();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-without.png` });
    await traffic(1);
    await page.evaluate(() => window.__alandDrive.hold(false));
    return [shown, without];
  });
  console.log(`${name}: ${counts.drawCalls} draws, ${counts.triangles} triangles; without traffic ${plain.drawCalls} draws, ${plain.triangles} triangles; ${counts.cars} cars, ${counts.bikes} cyclists and ${counts.walkers} walkers round the car, ${counts.carsSeen} and ${counts.bikesSeen} in sight`);
}
console.log(reported() || "no errors or warnings");
await close();
