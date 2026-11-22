// A race filmed from behind one of its racers, for judging by eye what the vetting tool's counts can't say: whether a
// racer drives like a driver. Opens the game in headless Chromium, starts the race through the probe with the player's
// car trundling along at the back, and follows one racer with the free camera, a chase view of its own: each frame the
// simulation moves a frame's time by hand, the camera is put behind where the racer now is, and the frame is shot, so
// the video plays at real speed however slowly the machine renders. Nothing of the HUD is in it, which is the player's
// car's. The frames are encoded with ffmpeg, which must be on the PATH.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/race-film.mjs <out.mp4> <race id> [--racer=<grid place, 1 the pole>]
//     [--from=<seconds after the lights>] [--seconds=45] [--fps=30] [--size=960x540] [--player=<m/s>]
//     [--traffic=<density, 1 Åland's own; none without it>]
// ALAND_DRIVE_URL is the page's address, with ?tiles=local:<port>, ?at= near the race's start and ?racers= for the
// field. It prints the racer's resets as it goes, from its record. The same shot of two builds, each on its own dev
// server, is a before and after.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGame, settleFrames } from "./game-page.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [out, raceId] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name, fallback) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (out === undefined || raceId === undefined) throw new Error("usage: race-film.mjs <out.mp4> <race id> [--racer=1] [--from=0] [--seconds=45] [--fps=30] [--size=960x540] [--player=22]");
const [WIDTH, HEIGHT] = option("size", "960x540").split("x").map(Number);
const FPS = Number(option("fps", "30"));
const SECONDS = Number(option("seconds", "45"));
const FROM_S = Number(option("from", "0"));
const RACER = Number(option("racer", "1"));
const PLAYER_MS = Number(option("player", "22"));
const TRAFFIC = Number(option("traffic", "0"));
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const STEPS_A_SECOND = 120;
const COUNTDOWN_S = 3;
/** The camera rides this far behind the racer and this far above the ground, looking down this much, and turns to its way this share a frame. */
const BEHIND_M = 9.5;
const ABOVE_M = 3.4;
const PITCH = -0.2;
const TURN_SHARE = 0.12;
if (STEPS_A_SECOND % FPS !== 0) throw new Error(`--fps must divide ${STEPS_A_SECOND}, the simulation's steps a second`);

// The world's origin on the map, from the tiles the page is served: the camera is placed by map coordinates.
const tilesPort = new URL(BASE).searchParams.get("tiles")?.match(/^local:(\d+)$/)?.[1];
if (tilesPort === undefined) throw new Error("ALAND_DRIVE_URL must name the local tile server: ?tiles=local:<port>");
const { worldOrigin: origin } = await (await fetch(`http://localhost:${tilesPort}/world.json`)).json();

const { page, step, reported, close } = await openGame(BASE, { width: WIDTH, height: HEIGHT });
await step("map ready", () => page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 120_000 }));
await step("hold", () => page.evaluate(() => window.__alandDrive.hold(true)));
if (TRAFFIC > 0) await step("traffic", () => page.evaluate((density) => window.__alandDrive.traffic(density, { withPlayer: true }), TRAFFIC));
await step("start the race", () => page.evaluate((id) => window.__alandDrive.startChallenge(id), raceId));
// Only the game's canvas shows: the HUD is the player's car's, and the frame meter measures the machine.
await step("hiding the HUD", () =>
  page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")];
    const game = canvases.reduce((largest, canvas) => (canvas.width * canvas.height > largest.width * largest.height ? canvas : largest));
    for (let element = game; element; element = element.parentElement) element.setAttribute("data-film-keep", "");
    const style = document.createElement("style");
    style.textContent = "body *:not([data-film-keep]) { visibility: hidden !important; }";
    document.head.append(style);
  }),
);
const wanted = await step("the racer", () =>
  page.evaluate(
    ({ id, place }) => {
      const probe = window.__alandDrive;
      const racers = probe.computerCars().filter((car) => car.id.startsWith(`${id}/`) && car.id.includes("/grid-"));
      const racer = racers.find((car) => car.id.endsWith(`/grid-${place - 1}`));
      if (!racer) throw new Error(`no racer on grid place ${place}: ${racers.map((car) => car.id).join(", ") || "no racers at all"}`);
      const [x, y, z, w] = probe.car().rotation;
      // Every car on the grid faces the way the player's does.
      return { id: racer.id, heading: Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) };
    },
    { id: raceId, place: RACER },
  ),
);
// Through the countdown, the player's car driven at a modest pace by the scripted driver, and on to where the film starts.
await step("countdown", () => page.evaluate((steps) => window.__alandDrive.advance(steps), COUNTDOWN_S * STEPS_A_SECOND + 1));
await step("the player's driver", () => page.evaluate((speed) => window.__alandDrive.driveChallenge(speed), PLAYER_MS));
for (let skipped = 0; skipped < FROM_S; skipped += 5) await step(`on to ${Math.min(FROM_S, skipped + 5)} s`, () => page.evaluate((steps) => window.__alandDrive.advance(steps), Math.round(Math.min(5, FROM_S - skipped) * STEPS_A_SECOND)));

const frames = mkdtempSync(join(tmpdir(), "aland-race-film-"));
const total = Math.round(SECONDS * FPS);
let heading = wanted.heading;
let last = null;
let resets = 0;
for (let frame = 0; frame < total; frame++) {
  await step(`frame ${frame}`, async () => {
    const read = await page.evaluate(
      ({ id, steps }) => {
        const probe = window.__alandDrive;
        probe.advance(steps);
        const racer = probe.computerCars().find((car) => car.id === id);
        if (!racer) throw new Error(`the racer ${id} has left the world`);
        return { position: racer.position, resets: racer.driver?.racer?.record?.resets ?? 0, cause: racer.driver?.racer?.record?.lastReset ?? null };
      },
      { id: wanted.id, steps: STEPS_A_SECOND / FPS },
    );
    const [x, , z] = read.position;
    // The way it is going, from how it moved; a car standing still, or put somewhere, keeps the way it had.
    if (last && Math.hypot(x - last.x, z - last.z) > 0.05 && Math.hypot(x - last.x, z - last.z) < 5) {
      const going = Math.atan2(-(x - last.x), -(z - last.z));
      heading += Math.atan2(Math.sin(going - heading), Math.cos(going - heading)) * TURN_SHARE;
    }
    last = { x, z };
    if (read.resets !== resets) {
      resets = read.resets;
      process.stdout.write(`\n${(FROM_S + frame / FPS).toFixed(1)} s: reset ${resets} (${read.cause})\n`);
    }
    // The probe takes a place on the map, in metres east and north: the scene's x is east of the world's origin and its z south of it.
    await page.evaluate((at) => window.__alandDrive.look(at), { east: origin.east + x + BEHIND_M * Math.sin(heading), north: origin.north - (z + BEHIND_M * Math.cos(heading)), height: ABOVE_M, yaw: heading, pitch: PITCH });
    await settleFrames(page, 1);
    await page.screenshot({ path: join(frames, `${String(frame).padStart(5, "0")}.png`) });
  });
  if (frame % FPS === 0) process.stdout.write(`\r${frame / FPS} of ${SECONDS} s`);
}
const problems = reported();
await close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", out]);
rmSync(frames, { recursive: true });
console.log(`\r${out}: ${raceId} from behind grid place ${RACER}, ${SECONDS} s from ${FROM_S} s at ${FPS} fps, ${resets} reset${resets === 1 ? "" : "s"}${problems ? `, with page warnings:\n${problems}` : ""}`);
