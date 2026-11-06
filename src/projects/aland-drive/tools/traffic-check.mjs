// Runs the lane lab's traffic round a place in headless Chromium, held and stepped by hand, and prints every car that
// stood still too long: a jam the lanes or the driver caused, each with a link to look at it from above. A car waiting
// at a junction for a while is ordinary; one stopped for most of a minute is stuck. It also prints the places cars
// strayed furthest from their lanes as their wheels steered them round, which a tight corner can make them cut, and every
// time two cars' outlines overlapped or passed within a hand's width of each other, checked at every step traffic takes.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/traffic-check.mjs <east,north> [--minutes=3] [--cars=60] [--stuck=45] [--with-player]
// ALAND_DRIVE_URL is the lane lab's address, with ?lane-lab&tiles=local:<port>.

import { openGame } from "./game-page.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [at] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (at === undefined) throw new Error("usage: traffic-check.mjs <east,north> [--minutes=3] [--cars=60] [--stuck=45] [--with-player]");
const MINUTES = Number(option("minutes") ?? 3);
const CARS = Number(option("cars") ?? 60);
const STUCK_S = Number(option("stuck") ?? 45);
// The player's car stands where the look puts it, often on the road, and traffic rightly queues behind it; left out unless asked.
const WITH_PLAYER = flags.includes("--with-player");
const URL = process.env.ALAND_DRIVE_URL;
if (URL === undefined) throw new Error("ALAND_DRIVE_URL names the lane lab, with ?lane-lab&tiles=local:<port>");
const STEPS_A_SECOND = 120;
/** Traffic steps once every this many of the simulation's steps (`TRAFFIC_EVERY`, `render/game.ts`). */
const TRAFFIC_EVERY = 4;
/** Closer than this, outline to outline, two cars passed too close. */
const CLOSE_M = 0.15;
const ORIGIN = { east: 110000, north: 6690000 };

const { page, step, close } = await openGame(`${URL}&at=${at},120,0,-1.5`, { width: 640, height: 480 });
const result = await step(
  "driving",
  () =>
    page.evaluate(
      async ({ minutes, cars, stuckS, stepsASecond, every, closeM, withPlayer }) => {
        const probe = window.__alandDrive;
        // Two outlines on the ground (middle, yaw, half width and length, grown by `grow`): whether they overlap, by the separating axes of both.
        const corners = ({ x, z, yaw }, [wide, long]) =>
          [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([forth, side]) => [x - Math.sin(yaw) * long * forth + Math.cos(yaw) * wide * side, z - Math.cos(yaw) * long * forth - Math.sin(yaw) * wide * side]);
        const overlap = (a, b, grow) => {
          const [ca, cb] = [corners(a.pose, a.half.map((h) => h + grow)), corners(b.pose, b.half.map((h) => h + grow))];
          for (const yaw of [a.pose.yaw, b.pose.yaw]) {
            for (const [ax, az] of [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]]) {
              const sa = ca.map(([x, z]) => x * ax + z * az);
              const sb = cb.map(([x, z]) => x * ax + z * az);
              if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false;
            }
          }
          return true;
        };
        // Each pair of cars once: how near they came, and where they first did.
        const meetings = new Map();
        while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
        probe.hold(true);
        probe.traffic(cars, { withPlayer });
        const still = new Map();
        const stuck = new Map();
        const strayed = new Map();
        const seen = new Set();
        for (let second = 0; second < minutes * 60; second++) {
          for (let step = 0; step < stepsASecond; step += every) {
            probe.advance(every);
            const cars = probe.trafficCars();
            for (let a = 0; a < cars.length; a++) {
              for (let b = a + 1; b < cars.length; b++) {
                const [one, two] = [cars[a], cars[b]];
                if (Math.hypot(one.pose.x - two.pose.x, one.pose.z - two.pose.z) > 8 || !overlap(one, two, closeM / 2)) continue;
                const key = `${one.id} ${two.id}`;
                const kind = overlap(one, two, 0) ? "overlap" : "close";
                const known = meetings.get(key);
                const faced = Math.cos(one.pose.yaw - two.pose.yaw) < -0.5 ? "oncoming" : "same way";
                if (!known) meetings.set(key, { kind, faced, x: one.pose.x, z: one.pose.z, place: `${one.place.tile} ${one.place.connector ? "connector" : "lane"} ${one.place.index}` });
                else if (kind === "overlap") Object.assign(known, { kind, faced, x: one.pose.x, z: one.pose.z });
              }
            }
          }
          const now = probe.trafficCars();
          for (const car of now) {
            seen.add(car.id);
            const time = car.speedMS < 0.3 ? (still.get(car.id) ?? 0) + 1 : 0;
            still.set(car.id, time);
            const known = strayed.get(car.id);
            const way = car.place.connector ? `${probe.lanes().tile(car.place.tile)?.connectors[car.place.index].turn ?? ""} turn` : "lane";
            if (!known || car.offLaneM > known.offM) strayed.set(car.id, { offM: car.offLaneM, x: car.pose.x, z: car.pose.z, place: `${car.place.tile} ${way} ${car.place.index}` });
            if (time >= stuckS) stuck.set(car.id, { id: car.id, x: car.pose.x, z: car.pose.z, waiting: car.waiting, seconds: time, place: `${car.place.tile} ${car.place.connector ? "connector" : "lane"} ${car.place.index}` });
          }
          // A wait between frames lets the page breathe; the clock is held, so it changes nothing.
          if (second % 10 === 0) await new Promise(requestAnimationFrame);
        }
        return { stuck: [...stuck.values()], strayed: [...strayed.values()].sort((a, b) => b.offM - a.offM), cars: seen.size, meetings: [...meetings.values()] };
      },
      { minutes: MINUTES, cars: CARS, stuckS: STUCK_S, stepsASecond: STEPS_A_SECOND, every: TRAFFIC_EVERY, closeM: CLOSE_M, withPlayer: WITH_PLAYER },
    ),
  MINUTES * 60 * 5,
);
await close();
console.log(`${result.cars} cars drove in ${MINUTES} min; ${result.stuck.length} stood still ${STUCK_S} s or more`);
const base = URL.replace(/&?tiles=[^&]*/, "").replace("?&", "?");
const linkTo = ({ x, z }) => `${base}&at=${Math.round(x + ORIGIN.east)},${Math.round(ORIGIN.north - z)},60,0,-1.5708`;
for (const car of result.stuck) console.log(`  ${car.place}, ${car.waiting ? "giving way" : "queued"} ${car.seconds} s  ${linkTo(car)}`);
const offs = result.strayed.map(({ offM }) => offM).sort((a, b) => a - b);
console.log(`furthest each car strayed from its lane: median ${offs[Math.floor(offs.length / 2)]?.toFixed(2)} m, worst ${offs.at(-1)?.toFixed(2)} m`);
for (const car of result.strayed.slice(0, 5)) console.log(`  ${car.offM.toFixed(2)} m on ${car.place}  ${linkTo(car)}`);
const overlaps = result.meetings.filter(({ kind }) => kind === "overlap");
const near = result.meetings.filter(({ kind }) => kind === "close");
const by = (list) => ["oncoming", "same way"].map((faced) => `${list.filter((meeting) => meeting.faced === faced).length} ${faced}`).join(", ");
console.log(`${overlaps.length} pairs of cars overlapped (${by(overlaps)}); ${near.length} more passed within ${CLOSE_M} m (${by(near)})`);
for (const meeting of [...overlaps, ...near].slice(0, 8)) console.log(`  ${meeting.kind}, ${meeting.faced}, on ${meeting.place}  ${linkTo(meeting)}`);
