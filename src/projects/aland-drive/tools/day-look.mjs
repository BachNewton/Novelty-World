// The game's day by eye: each showcase view in the chase camera at each date and hour asked for, with the hour held,
// saved as <view>-<date>-<hour>[-<terrain light>].png, and the frame's counts printed. A terrain light (`?terrain-light=`,
// `render/terrain-light.ts`) is set as the page loads, so each one asked for is its own page.
//
// Prereq: a dev server, and a tile server (`tools/serve-tiles.mjs`) named in ALAND_DRIVE_URL's `?tiles=local:<port>`.
// Views are split by semicolons. A view is a showcase spot's key, or <name>:<east>,<north>,<height>,<bearing>,<pitch> for the free camera there, in
// ETRS-TM35FIN metres and degrees (bearing clockwise from grid north, pitch up from level).
//   node src/projects/aland-drive/tools/day-look.mjs --out=<folder> --views="5;8" --days=2026-06-21@12,2026-06-21@23.5 [--lights=baked,relit] [--size=WxH]

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openGame, UNCAPPED_ARGS } from "./game-page.mjs";

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = option("out");
if (!OUT) throw new Error("--out=<folder> is required");
const [WIDTH, HEIGHT] = (option("size") ?? "1600x900").split("x").map(Number);
const VIEWS = (option("views") ?? "5").split(";");
const DAYS = (option("days") ?? "2026-06-21@12").split(",").map((day) => {
  const [date, hour] = day.split("@");
  return { date, hour: Number(hour) };
});
const LIGHTS = option("lights")?.split(",") ?? [null];
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const FRAMES_TO_SETTLE = 3;

mkdirSync(OUT, { recursive: true });

for (const light of LIGHTS) {
  const url = new URL(BASE);
  if (light !== null) url.searchParams.set("terrain-light", light);
  const { page, step, reported, close } = await openGame(url.toString(), { width: WIDTH, height: HEIGHT, args: UNCAPPED_ARGS });
  for (const view of VIEWS) {
    await step(`view ${view}`, () =>
      page.evaluate(async (wanted) => {
        const probe = window.__alandDrive;
        const place = wanted.split(":")[1];
        if (place === undefined) {
          probe.hold(true);
          await probe.jumpTo(wanted);
          probe.setCamera("chase");
          probe.advance(120);
          return;
        }
        const [east, north, height, bearingDeg, pitchDeg] = place.split(",").map(Number);
        probe.look({ east, north, height, yaw: (-bearingDeg * Math.PI) / 180, pitch: (pitchDeg * Math.PI) / 180 });
      }, view),
    );
    for (const { date, hour } of DAYS) {
      const counts = await step(`${view} at ${date} ${hour}`, () =>
        page.evaluate(
          async ({ date: text, hour: at, settle }) => {
            const probe = window.__alandDrive;
            const [year, month, day] = text.split("-").map(Number);
            probe.setDay({ date: { year, month, day }, hour: at, held: true });
            const framesPass = async (count) => {
              const target = probe.frames() + count;
              while (probe.frames() < target) {
                probe.counts();
                await new Promise(requestAnimationFrame);
              }
            };
            await framesPass(settle);
            while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
            await framesPass(settle);
            return { counts: probe.counts(), day: probe.day() };
          },
          { date, hour, settle: FRAMES_TO_SETTLE },
        ),
      );
      const name = `${view.split(":")[0]}-${date}-${String(hour).replace(".", "_")}${light === null ? "" : `-${light}`}.png`;
      await page.screenshot({ path: join(OUT, name) });
      const { drawCalls, triangles, gpuMs } = counts.counts;
      console.log(name, JSON.stringify({ drawCalls, triangles, gpuMs, sun: counts.day.sun, night: counts.day.night }));
    }
  }
  const problems = reported();
  if (problems) console.log(`The page reported:\n${problems}`);
  await close();
}
