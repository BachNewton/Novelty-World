// A video of the world in motion, for judging by eye what a screenshot can't show (boats under way, anything that
// moves or changes with distance): opens the game in headless Chromium at a place, takes over the page's clock, and
// renders the video's frames one after another, each exactly a frame's time later, so the video plays at real speed
// however slowly the machine renders. The frames are encoded with ffmpeg, which must be on the PATH. Every step runs
// through `game-page.mjs`, so a page that throws or loses part of the map ends the run rather than filming on.
//
// Prereq: a dev server and a tile server (`tools/serve-tiles.mjs`). Usage:
//   node src/projects/aland-drive/tools/film.mjs <out.mp4> <east,north,height,yaw,pitch> [--sea=<ISO time>] [--speed=1] [--seconds=20] [--fps=30] [--size=1280x720] [--traffic=<count> [--with-player]]
// The place is `?at=`'s five numbers; --sea is the boats' clock at the video's first frame (`tools/sea-times.ts` says
// when one passes), stepped a frame's time each frame after, or --speed times that for a time-lapse of a ship's
// slow manoeuvre: only the boats speed up, while the water and the sky keep real time. In the lane lab, --traffic=<count>
// keeps that many cars on its lanes. The player's car stands on the road where the look puts it, and traffic leaves it
// out unless --with-player, when traffic brakes for it and goes round it.
// ALAND_DRIVE_URL is the page's address, with ?tiles=local:<port> for the local tile server.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGame, settleFrames } from "./game-page.mjs";

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [out, at] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (out === undefined || at === undefined) throw new Error("usage: film.mjs <out.mp4> <east,north,height,yaw,pitch> [--sea=<ISO time>] [--seconds=20] [--fps=30] [--size=1280x720]");
const [WIDTH, HEIGHT] = (option("size") ?? "1280x720").split("x").map(Number);
const FPS = Number(option("fps") ?? 30);
const SECONDS = Number(option("seconds") ?? 20);
const SEA = option("sea");
const SPEED = Number(option("speed") ?? 1);
const TRAFFIC = option("traffic");
const WITH_PLAYER = flags.includes("--with-player");
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}at=${at}`;

const { page, step, reported, close } = await openGame(url, { width: WIDTH, height: HEIGHT });
// Everything round the place lands before the clock is taken, so the video starts on a whole view.
if (TRAFFIC !== undefined) await step("starting traffic", () => page.evaluate(({ traffic, withPlayer }) => window.__alandDrive.traffic(traffic, { withPlayer }), { traffic: Number(TRAFFIC), withPlayer: WITH_PLAYER }));
await step("loading the place", () => settleFrames(page, 10));

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
const seaFrom = SEA === undefined ? null : Date.parse(SEA) / 1000;
for (let frame = 0; frame < total; frame++) {
  await step(`frame ${frame}`, async () => {
    if (seaFrom !== null) await page.evaluate((seconds) => window.__alandDrive.holdSea(seconds), seaFrom + (frame * SPEED) / FPS);
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: join(frames, `${String(frame).padStart(5, "0")}.png`) });
  });
  if (frame % FPS === 0) process.stdout.write(`\r${frame / FPS} of ${SECONDS} s`);
}
const problems = reported();
await close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out]);
rmSync(frames, { recursive: true });
console.log(`\r${out}: ${SECONDS} s at ${FPS} fps${SPEED === 1 ? "" : `, the boats at ${SPEED}× speed`}${problems ? `, with page warnings:\n${problems}` : ""}`);
