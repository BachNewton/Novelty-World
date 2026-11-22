// A whole race run in the real game, headless, and counted: what the vetting tool (`tools/race-vet.ts`) can't hold,
// since it drives the racers alone in the simulation. Here they are the game's own racers, put on the grid as a player
// would meet them, sharing the road with the traffic on its lanes and with the player's car, which the scripted driver
// trundles round at a modest pace, so on a circuit the racers come up on it and have to pass it. Every few seconds the
// simulation is stepped on by hand and each racer's record read; at the end it prints, for each racer, whether it
// finished and when, and its resets with the cause of the last, and how many traffic cars were hit out of their lanes.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/race-count.mjs <race id> [--traffic=<density, 1 Åland's own>] [--player=<m/s>]
//     [--cap=<seconds>]
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
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const STEPS_A_SECOND = 120;
const READ_EVERY_S = 5;

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
        .map((car) => ({ id: car.id.slice(car.id.lastIndexOf("/") + 1), resets: car.driver?.racer?.record?.resets ?? 0, cause: car.driver?.racer?.record?.lastReset ?? null, finishedS: car.driver?.racer?.run?.player?.result ?? null })),
      traffic: probe.trafficCounts(),
      player: probe.challenge(),
    };
  }, raceId);
let reading = await read();
let clockS = 0;
for (; clockS < CAP_S && reading.racers.some((racer) => racer.finishedS === null); clockS += READ_EVERY_S) {
  await step(`on to ${clockS + READ_EVERY_S} s`, () => page.evaluate((steps) => window.__alandDrive.advance(steps), READ_EVERY_S * STEPS_A_SECOND));
  reading = await read();
  if (reading.racers.length === 0) throw new Error(`no racers in ${raceId}`);
}
const problems = reported();
await close();
console.log(`${raceId}: ${reading.racers.length} racers with traffic at ${TRAFFIC} and the player at ${PLAYER_MS} m/s, ${clockS} s: ${reading.racers.filter((racer) => racer.finishedS !== null).length} finished, ${reading.racers.reduce((sum, racer) => sum + racer.resets, 0)} resets, ${reading.traffic.hit} traffic cars hit of ${reading.traffic.cars} on the lanes`);
for (const racer of reading.racers) console.log(`  ${racer.id}: ${racer.finishedS === null ? "not finished" : `finished in ${racer.finishedS.toFixed(1)} s`}, ${racer.resets} reset${racer.resets === 1 ? "" : "s"}${racer.cause ? ` (last: ${racer.cause})` : ""}`);
if (problems) console.log(`page warnings:\n${problems}`);
