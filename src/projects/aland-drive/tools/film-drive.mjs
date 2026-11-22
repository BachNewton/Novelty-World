// A video of a drive, for judging a road by eye as a driver meets it: the GPS routes the car from the first place to
// the second, facing the way it goes, and the scripted driver follows that route while the video's frames are drawn one
// after another, each exactly a frame's time and a frame's steps of the simulation after the last, waiting for the
// stream. So the video plays at real speed however slowly the machine renders, and two builds filmed alike show the
// same drive. The page is on the tool's clock from before it loads, so no clock the game keeps ever sees time jump:
// the weather it eases towards is the climate's own at any date. The frames are encoded with ffmpeg, which must be on
// the PATH. Every step runs through `game-page.mjs`, so a page that throws or loses part of the map ends the run
// rather than filming on.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/film-drive.mjs <out.mp4> <x,z> <x,z> [--seconds=20] [--fps=30] [--size=1280x720]
//     [--cruise=14] [--camera=chase]
// The two places are in the scene's x and z, as `tools/drive.mjs --gps` takes them; --cruise is the driver's speed in
// m/s, and --camera the view (`chase` or `cockpit`). The video ends early if the car arrives. ALAND_DRIVE_URL is the
// page's address, with ?tiles=local:<port> for the local tile server and any date, hour or weather.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGame } from "./game-page.mjs";

const STEP_HZ = 120;
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [out, from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (out === undefined || from === undefined || to === undefined) throw new Error("usage: film-drive.mjs <out.mp4> <x,z> <x,z> [--seconds=20] [--fps=30] [--size=1280x720] [--cruise=14] [--camera=chase]");
const [WIDTH, HEIGHT] = (option("size") ?? "1280x720").split("x").map(Number);
const FPS = Number(option("fps") ?? 30);
const SECONDS = Number(option("seconds") ?? 20);
const CRUISE_M_S = Number(option("cruise") ?? 14);
const CAMERA = option("camera") ?? "chase";
const PLACES = [from, to].map((place) => place.split(",").map(Number));
if (STEP_HZ % FPS !== 0) throw new Error(`--fps must divide the simulation's ${STEP_HZ} steps a second`);
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";

const { page, step, tick, reported, close } = await openGame(BASE, { width: WIDTH, height: HEIGHT, clock: Date.now() });

/** Ticks the page a frame at a time until `ready` holds there: the land lands in real time, whatever the page's clock says. */
const until = async (ready) => {
  while (!(await page.evaluate(ready))) await tick();
};
const SETTLE_FRAMES = 4;
const settled = async () => {
  await tick(SETTLE_FRAMES);
  await until(() => window.__alandDrive.stream().loading === 0);
  await tick(SETTLE_FRAMES);
};

await step("routing the drive", async () => {
  await until(() => window.__alandDrive.mapReady());
  await page.evaluate(([x, z]) => {
    window.__alandDrive.hold(true);
    window.__alandDrive.loadAround({ x, z });
  }, PLACES[0]);
  await settled();
  await page.evaluate(
    ({ places, cruise, camera }) => {
      const probe = window.__alandDrive;
      probe.setCamera(camera);
      probe.startLine(probe.routeThrough(places), cruise);
      probe.loadAround(null);
    },
    { places: PLACES, cruise: CRUISE_M_S, camera: CAMERA },
  );
  await settled();
});

// The frame meter measures the machine, which reads as nonsense on a clock that moves a frame at a time.
await step("hiding the frame meter", () =>
  page.evaluate(() => {
    for (const element of document.body.children) if (element instanceof HTMLElement && element.style.right === "0px" && element.querySelector("canvas")) element.style.display = "none";
  }),
);

const frames = mkdtempSync(join(tmpdir(), "aland-film-"));
const total = Math.round(SECONDS * FPS);
let filmed = 0;
for (; filmed < total; filmed++) {
  const arrived = await step(`frame ${filmed}`, async () => {
    if (await page.evaluate((steps) => (window.__alandDrive.routeFinished() ? true : (window.__alandDrive.advance(steps), false)), STEP_HZ / FPS)) return true;
    await page.clock.runFor(1000 / FPS);
    // The drive stands while the land ahead lands.
    await until(() => window.__alandDrive.stream().loading === 0);
    await page.screenshot({ path: join(frames, `${String(filmed).padStart(5, "0")}.png`) });
    return false;
  });
  if (arrived) break;
  if (filmed % FPS === 0) process.stdout.write(`\r${filmed / FPS} of ${SECONDS} s`);
}
const problems = reported();
await close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", out]);
rmSync(frames, { recursive: true });
console.log(`\r${out}: ${(filmed / FPS).toFixed(1)} s at ${FPS} fps${problems ? `, with page warnings:\n${problems}` : ""}`);
