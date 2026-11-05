// When the boats under way pass a place: every vessel that comes within a radius of it in the hours ahead, with when it
// comes in, when it's nearest, and when it lies still there (a ferry at its quay). For picking a moment to look, and for
// a link that shows it: each time is a moment of the world's clock (`sea/clock.ts`), printed as `?sea=` takes it, so
// `?at=<the place>&sea=<a minute before>` opens there just before the boat comes.
//
// Usage: npx tsx src/projects/aland-drive/tools/sea-times.ts <east> <north> [--radius=1500] [--hours=6] [--from=<ISO time>]
// East and north are ETRS-TM35FIN metres, as `?at=` takes them.

import { LANES } from "../sea/lanes";
import { sailings } from "../sea/timetable";

const WORLD_ORIGIN = { east: 110000, north: 6690000 };
const STEP_S = 10;

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const [east, north] = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map(Number);
const option = (name: string) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!Number.isFinite(east) || !Number.isFinite(north)) throw new Error("usage: sea-times.ts <east> <north> [--radius=1500] [--hours=6] [--from=<ISO time>]");
const radius = Number(option("radius") ?? 1500);
const hours = Number(option("hours") ?? 6);
const from = Date.parse(option("from") ?? new Date().toISOString()) / 1000;
const [x, z] = [east - WORLD_ORIGIN.east, WORLD_ORIGIN.north - north];

const clock = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16)}Z`;

const passes: { start: number; text: string }[] = [];
for (const { model, voyage } of sailings(LANES)) {
  let inside: { start: number; nearest: number; nearestAt: number; stillFor: number } | null = null;
  for (let t = from; t <= from + hours * 3600; t += STEP_S) {
    const pose = voyage.poseAt(t);
    const distance = pose.shown ? Math.hypot(pose.x - x, pose.z - z) : Infinity;
    if (distance <= radius) {
      inside ??= { start: t, nearest: distance, nearestAt: t, stillFor: 0 };
      if (distance < inside.nearest) Object.assign(inside, { nearest: distance, nearestAt: t });
      if (pose.speedMs === 0) inside.stillFor += STEP_S;
    } else if (inside) {
      const still = inside.stillFor >= 120 ? `, lies still ${Math.round(inside.stillFor / 60)} min` : "";
      passes.push({ start: inside.start, text: `${clock(inside.start)} to ${clock(t)}: ${model} (${voyage.name}), nearest ${Math.round(inside.nearest)} m at ${clock(inside.nearestAt)}${still}` });
      inside = null;
    }
  }
  if (inside) passes.push({ start: inside.start, text: `${clock(inside.start)} on: ${model} (${voyage.name}), still within ${radius} m when the window ends` });
}
for (const { text } of passes.sort((a, b) => a.start - b.start)) console.log(text);
if (passes.length === 0) console.log(`nothing comes within ${radius} m in ${hours} h`);
