// Runs the lane lab's traffic round a place in headless Chromium, held and stepped by hand, and prints every car that
// stood still too long: a jam the lanes or the driver caused, each with a link to look at it from above. A car waiting
// at a junction for a while is ordinary; one stopped for most of a minute is stuck.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/traffic-check.mjs <east,north> [--minutes=3] [--cars=60] [--stuck=45]
// ALAND_DRIVE_URL is the lane lab's address, with ?lane-lab&tiles=local:<port>.

import { openGame } from "./game-page.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [at] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (at === undefined) throw new Error("usage: traffic-check.mjs <east,north> [--minutes=3] [--cars=60] [--stuck=45]");
const MINUTES = Number(option("minutes") ?? 3);
const CARS = Number(option("cars") ?? 60);
const STUCK_S = Number(option("stuck") ?? 45);
const URL = process.env.ALAND_DRIVE_URL;
if (URL === undefined) throw new Error("ALAND_DRIVE_URL names the lane lab, with ?lane-lab&tiles=local:<port>");
const STEPS_A_SECOND = 120;
const ORIGIN = { east: 110000, north: 6690000 };

const { page, step, close } = await openGame(`${URL}&at=${at},120,0,-1.5`, { width: 640, height: 480 });
const result = await step(
  "driving",
  () =>
    page.evaluate(
      async ({ minutes, cars, stuckS, stepsASecond }) => {
        const probe = window.__alandDrive;
        while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
        probe.hold(true);
        probe.traffic(cars);
        const still = new Map();
        const stuck = new Map();
        const seen = new Set();
        for (let second = 0; second < minutes * 60; second++) {
          probe.advance(stepsASecond);
          const now = probe.trafficCars();
          for (const car of now) {
            seen.add(car.id);
            const time = car.speedMS < 0.3 ? (still.get(car.id) ?? 0) + 1 : 0;
            still.set(car.id, time);
            if (time >= stuckS) stuck.set(car.id, { id: car.id, x: car.pose.x, z: car.pose.z, waiting: car.waiting, seconds: time, place: `${car.place.tile} ${car.place.connector ? "connector" : "lane"} ${car.place.index}` });
          }
          // A wait between frames lets the page breathe; the clock is held, so it changes nothing.
          if (second % 10 === 0) await new Promise(requestAnimationFrame);
        }
        return { stuck: [...stuck.values()], cars: seen.size };
      },
      { minutes: MINUTES, cars: CARS, stuckS: STUCK_S, stepsASecond: STEPS_A_SECOND },
    ),
  MINUTES * 60 * 5,
);
await close();
console.log(`${result.cars} cars drove in ${MINUTES} min; ${result.stuck.length} stood still ${STUCK_S} s or more`);
const base = URL.replace(/&?tiles=[^&]*/, "").replace("?&", "?");
for (const car of result.stuck) {
  const east = Math.round(car.x + ORIGIN.east);
  const north = Math.round(ORIGIN.north - car.z);
  console.log(`  ${car.place}, ${car.waiting ? "giving way" : "queued"} ${car.seconds} s  ${base}&at=${east},${north},60,0,-1.5708`);
}
