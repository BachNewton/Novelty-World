// A video of a drive, for judging a road by eye as a driver meets it: the car is put on the road nearest the first place,
// the GPS routes it to the second, and the scripted driver follows that route while the video's frames are drawn one
// after another, each exactly a frame's time and a frame's steps of the simulation after the last, waiting for the
// stream. So the video plays at real speed however slowly the machine renders, and two builds filmed alike show the
// same drive. The frames are encoded with ffmpeg, which must be on the PATH. Every step runs through `game-page.mjs`,
// so a page that throws or loses part of the map ends the run rather than filming on.
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

const { page, step, reported, close } = await openGame(BASE, { width: WIDTH, height: HEIGHT });

// The page still runs on its own clock here, so waiting on its frames works.
await step("routing the drive", () =>
  page.evaluate(
    async ({ places, cruise, camera }) => {
      const probe = window.__alandDrive;
      const settle = async () => {
        for (let frame = probe.frames() + 4; probe.frames() < frame || probe.stream().loading > 0; ) await new Promise(requestAnimationFrame);
      };
      while (!probe.mapReady()) await new Promise(requestAnimationFrame);
      probe.hold(true);
      probe.loadAround({ x: places[0][0], z: places[0][1] });
      await settle();
      probe.placeNear(places[0][0], places[0][1]);
      if (!probe.setDestination(places[1][0], places[1][1])) throw new Error("no road leads there");
      const line = probe.routePoints();
      probe.setCamera(camera);
      probe.startLine(line, cruise);
      probe.loadAround(null);
      await settle();
    },
    { places: PLACES, cruise: CRUISE_M_S, camera: CAMERA },
  ),
);

// The frame meter measures the machine, which reads as nonsense on a clock that moves a frame at a time.
await step("hiding the frame meter", () =>
  page.evaluate(() => {
    for (const element of document.body.children) if (element instanceof HTMLElement && element.style.right === "0px" && element.querySelector("canvas")) element.style.display = "none";
  }),
);

// From here the page's time, timers and animation frames move only when told to: a frame's time per frame.
await step("taking the clock", async () => {
  await page.clock.install();
  // A moment just ahead of the page's own: its clock keeps running until paused, and can't be paused in its past.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
});
const frames = mkdtempSync(join(tmpdir(), "aland-film-"));
const total = Math.round(SECONDS * FPS);
let filmed = 0;
for (; filmed < total; filmed++) {
  const arrived = await step(`frame ${filmed}`, async () => {
    if (await page.evaluate((steps) => (window.__alandDrive.routeFinished() ? true : (window.__alandDrive.advance(steps), false)), STEP_HZ / FPS)) return true;
    await page.clock.runFor(1000 / FPS);
    // The land ahead lands in real time, whatever the page's clock says: the drive stands while it does.
    while ((await page.evaluate(() => window.__alandDrive.stream().loading)) > 0) await page.clock.runFor(1000 / FPS);
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
