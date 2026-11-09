// A race against the racers, watched headless: opens the game at the race's start, starts the race through the probe,
// steps the simulation by hand with the scripted driver at the wheel of the player's car, and shoots the chase view every
// five seconds, printing the player's place, lap and speed each time: the quickest way to see a racer drive without
// racing it. The player's own car is driven slowly on purpose, so the racer passes it in view.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/race-look.mjs <race id> [<folder for the shots>] [<seconds>]
// ALAND_DRIVE_URL is the page's address, with ?tiles=local:<port>, ?at= near the race's start, and ?racers= and
// ?difficulty= for the field (`racers/CLAUDE.md`).

import { mkdirSync } from "node:fs";
import { openGame, settleFrames } from "./game-page.mjs";

const [raceId = "kastelholm", out = "src/projects/aland-drive/.data/race-vet/racer-look", secondsS = "60"] = process.argv.slice(2);
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3161/games/3d-games/aland-drive";
const SECONDS = Number(secondsS);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the folder the caller named for the shots
mkdirSync(out, { recursive: true });
const { page, step, close } = await openGame(BASE, { width: 1280, height: 720 });
await step("map ready", () => page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 120_000 }));
await step("hold", () => page.evaluate(() => window.__alandDrive.hold(true)));
await step("start the race", () => page.evaluate((id) => window.__alandDrive.startChallenge(id), raceId));
await step("chase view", () => page.evaluate(() => window.__alandDrive.setCamera("chase")));
const read = () => page.evaluate(() => {
  const probe = window.__alandDrive;
  const run = probe.challenge();
  const car = probe.car();
  return { phase: run?.phase, clockS: run?.clockS, lap: run?.lap, place: run?.place, racers: run?.racers, gates: run?.gates, outcome: run?.outcome, speedKmh: Math.hypot(...car.velocity) * 3.6 };
});
console.log("on the grid:", JSON.stringify(await read()));
// Through the countdown, then the race, the player driven by the scripted driver along the route at a modest pace.
await step("countdown", () => page.evaluate(() => window.__alandDrive.advance(3 * 120 + 1)));
await step("drive", () => page.evaluate(() => window.__alandDrive.driveChallenge(22)));
for (let second = 0; second < SECONDS; second += 5) {
  await step(`advance to ${second + 5} s`, () => page.evaluate(() => window.__alandDrive.advance(5 * 120)));
  await settleFrames(page, 3);
  const reading = await read();
  console.log(`${second + 5} s: ${JSON.stringify(reading)}`);
  await page.screenshot({ path: `${out}/${raceId}-${String(second + 5).padStart(3, "0")}.png` });
  if (reading.outcome) break;
}
await close();
