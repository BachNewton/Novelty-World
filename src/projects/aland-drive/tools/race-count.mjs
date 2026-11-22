// A whole race run in the real game, headless, and counted: what the vetting tool (`tools/race-vet.ts`) can't hold,
// since it drives the racers alone in the simulation. Here they are the game's own racers, put on the grid as a player
// would meet them, sharing the road with the traffic on its lanes and with the player's car, which the scripted driver
// trundles round at a modest pace, so on a circuit the racers come up on it and have to pass it; where that driver
// sticks at a corner and the car stands, it is put back on the road as a player's R does, and the times are said, since
// a car left standing for the rest of a race is another reading (`tools/race-vet.ts --parked`). Every few seconds the
// simulation is stepped on by hand and each racer's record read; at the end it prints, for each racer, whether it
// finished and when, and its resets with the cause of the last, each reset with when and where it came, and how many
// traffic cars were hit out of their lanes.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/race-count.mjs <race id> [--traffic=<density, 1 Åland's own>] [--player=<m/s>]
//     [--cap=<seconds>] [--watch=<x>,<z>]
// --watch prints, at every reading with a racer within 80 m of a place (scene metres, as a reset is printed), each racer
// and each of the traffic there: how fast it goes and what it is waiting for, which is how a knot is read.
// ALAND_DRIVE_URL is the page's address, with ?tiles=local:<port>, ?at= near the race's start and ?racers= for the
// field.

import { openGame } from "./game-page.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [raceId] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name, fallback) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (raceId === undefined) throw new Error("usage: race-count.mjs <race id> [--traffic=1] [--player=22] [--cap=900]");
const TRAFFIC = Number(option("traffic", "1"));
const PLAYER_MS = Number(option("player", "22"));
const CAP_S = Number(option("cap", "900"));
const WATCH = option("watch", null)?.split(",").map(Number) ?? null;
const WATCH_M = 80;
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const STEPS_A_SECOND = 120;
const READ_EVERY_S = 5;
/** The player's car has stood where it moves less than this between readings, and its driver presses R after this long of it. */
const STOOD_M = 3;
const PLAYER_PATIENCE_S = 15;

const { page, step, reported, close } = await openGame(BASE, { width: 640, height: 360 });
await step("map ready", () => page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 120_000 }));
await step("hold", () => page.evaluate(() => window.__alandDrive.hold(true)));
if (TRAFFIC > 0) await step("traffic", () => page.evaluate((density) => window.__alandDrive.traffic(density, { withPlayer: true }), TRAFFIC));
await step("start the race", () => page.evaluate((id) => window.__alandDrive.startChallenge(id), raceId));
await step("countdown", () => page.evaluate((steps) => window.__alandDrive.advance(steps), 3 * STEPS_A_SECOND + 1));
await step("the player's driver", () => page.evaluate((speed) => window.__alandDrive.driveChallenge(speed), PLAYER_MS));
const read = () =>
  page.evaluate((id) => {
    const probe = window.__alandDrive;
    return {
      racers: probe
        .computerCars()
        .filter((car) => car.id.startsWith(`${id}/`))
        .map((car) => ({ id: car.id.slice(car.id.lastIndexOf("/") + 1), resets: car.driver?.racer?.record?.resets ?? 0, cause: car.driver?.racer?.record?.lastReset ?? null, finishedS: car.driver?.racer?.run?.player?.result ?? null, alongM: car.driver?.racer?.record?.along ?? 0, position: car.position, phase: car.driver?.racer?.record?.phase ?? "", stuckS: car.driver?.racer?.record?.stuckS ?? 0 })),
      traffic: probe.trafficCounts(),
      player: probe.challenge(),
      // Every traffic car, cyclist and walker with what it is doing, and the player's own car, for a watched place.
      lanes: probe.trafficCars().map((car) => ({ id: car.id, kind: car.kind, x: car.pose.x, z: car.pose.z, speedMS: car.speedMS, on: `${car.place.connector ? "connector" : car.place.link ? "link" : "lane"} ${car.place.index}`, waiting: car.waiting, meeting: car.meeting, waitedS: car.waitedS, goingRound: car.goingRound, blockedS: car.blockedS, finished: car.finished })),
      own: probe.car().position,
    };
  }, raceId);
const near = (x, z) => WATCH !== null && Math.hypot(x - WATCH[0], z - WATCH[1]) < WATCH_M;
const watched = (seconds, now) => {
  if (!now.racers.some((racer) => near(racer.position[0], racer.position[2]))) return;
  console.log(`${seconds} s, within ${WATCH_M} m of ${WATCH.join(", ")}:`);
  for (const racer of now.racers.filter((racer) => near(racer.position[0], racer.position[2]))) console.log(`  racer ${racer.id} at ${racer.position[0].toFixed(0)}, ${racer.position[2].toFixed(0)}, ${racer.alongM.toFixed(0)} m along, ${racer.phase}, stuck ${racer.stuckS.toFixed(1)} s, ${racer.resets} resets`);
  if (near(now.own[0], now.own[2])) console.log(`  the player's car at ${now.own[0].toFixed(0)}, ${now.own[2].toFixed(0)}`);
  for (const car of now.lanes.filter((car) => near(car.x, car.z))) console.log(`  ${car.kind} ${car.id} on ${car.on} at ${car.x.toFixed(0)}, ${car.z.toFixed(0)}, ${(car.speedMS * 3.6).toFixed(0)} km/h${car.waiting ? ", waiting at a junction's line" : ""}${car.meeting ? `, meeting (${car.meeting}) for ${car.waitedS.toFixed(0)} s` : ""}${car.goingRound ? ", going round a car" : ""}${car.blockedS > 0 ? `, blocked ${car.blockedS.toFixed(0)} s` : ""}${car.finished ? ", its trip ended: standing" : ""}`);
};
let reading = await read();
let clockS = 0;
/** Each reset as it came: by which reading, why, and where the racer stood once put back. */
const resets = [];
/** The player's own: the scripted driver sticks at a corner now and then, and a player who has stood that long presses R. */
const playerResets = [];
let stoodReadings = 0;
for (; clockS < CAP_S && reading.racers.some((racer) => racer.finishedS === null); clockS += READ_EVERY_S) {
  await step(`on to ${clockS + READ_EVERY_S} s`, () => page.evaluate((steps) => window.__alandDrive.advance(steps), READ_EVERY_S * STEPS_A_SECOND));
  const before = new Map(reading.racers.map((racer) => [racer.id, racer.resets]));
  const stoodAt = reading.own;
  reading = await read();
  if (reading.racers.length === 0) throw new Error(`no racers in ${raceId}`);
  stoodReadings = !reading.player?.outcome && Math.hypot(reading.own[0] - stoodAt[0], reading.own[2] - stoodAt[2]) < STOOD_M ? stoodReadings + 1 : 0;
  if (stoodReadings * READ_EVERY_S >= PLAYER_PATIENCE_S) {
    playerResets.push(`by ${clockS + READ_EVERY_S} s at ${reading.own[0].toFixed(0)}, ${reading.own[2].toFixed(0)}`);
    await step("the player's R", () => page.keyboard.press("KeyR"));
    await step("the player's driver again", () => page.evaluate((speed) => window.__alandDrive.driveChallenge(speed), PLAYER_MS));
    stoodReadings = 0;
  }
  watched(clockS + READ_EVERY_S, reading);
  for (const racer of reading.racers) {
    if (racer.resets > (before.get(racer.id) ?? 0)) resets.push(`${racer.id} by ${clockS + READ_EVERY_S} s (${racer.cause}), ${racer.alongM.toFixed(0)} m along at ${racer.position[0].toFixed(0)}, ${racer.position[2].toFixed(0)}`);
  }
}
const problems = reported();
await close();
console.log(`${raceId}: ${reading.racers.length} racers with traffic at ${TRAFFIC} and the player at ${PLAYER_MS} m/s, ${clockS} s: ${reading.racers.filter((racer) => racer.finishedS !== null).length} finished, ${reading.racers.reduce((sum, racer) => sum + racer.resets, 0)} resets, ${reading.traffic.hit} traffic cars hit of ${reading.traffic.cars} on the lanes`);
for (const racer of reading.racers) console.log(`  ${racer.id}: ${racer.finishedS === null ? "not finished" : `finished in ${racer.finishedS.toFixed(1)} s`}, ${racer.resets} reset${racer.resets === 1 ? "" : "s"}${racer.cause ? ` (last: ${racer.cause})` : ""}`);
if (resets.length) console.log(`resets as they came:\n  ${resets.join("\n  ")}`);
if (playerResets.length) console.log(`the player's car stood for ${PLAYER_PATIENCE_S} s and was put back on the road ${playerResets.length} time${playerResets.length === 1 ? "" : "s"}:\n  ${playerResets.join("\n  ")}`);
if (problems) console.log(`page warnings:\n${problems}`);
