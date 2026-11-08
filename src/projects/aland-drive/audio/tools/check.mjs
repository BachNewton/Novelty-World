// Renders every scene of the drive's sound through the real graph in headless Chromium's OfflineAudioContext, and prints
// levels and spectra, failing on a clipped or broken one. It sees numbers, not how it sounds: the owner judges by ear.
// Run: node src/projects/aland-drive/audio/tools/check.mjs, inside the machine's budget (npm run slot -- browser -- node ...).
//   --engines   the engine study instead: each car's engine alone, at idle and held at 30, 60 and 90% of its redline,
//               on and off load: level, centroid, the share that is steady tones, how much it changes frame to frame,
//               how far the timbre moves on and off load, and whether its resonances stay put as the revs double.
//   --cost      what each car's engine costs, old and new: the nodes its voice adds, its loops' bytes and seconds,
//               and the parameter changes it schedules a frame over a pull through the gears.
//   --old       the study through the audition's old voices; --inside, heard from the cockpit; --car <id>, one car.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");

const bundled = await build({
  entryPoints: [path.join(here, "render-page.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "check",
  platform: "browser",
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
});

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (error) => console.error("page error:", error.message));
await page.setContent("<!doctype html><title>check</title>");
await page.addScriptTag({ content: bundled.outputFiles[0].text });
const flag = (name) => process.argv.includes(name);
const car = process.argv.includes("--car") ? process.argv[process.argv.indexOf("--car") + 1] : undefined;

if (flag("--cost")) {
  const { results, shotsKb } = await page.evaluate(() => globalThis.check.cost());
  await browser.close();
  console.log("car".padEnd(11), "nodes (old)", "loops KB (old)", "loop s", "steered/frame (old)");
  for (const row of results) {
    const old = (value) => (value === null ? "" : `(${value})`);
    console.log(row.id.padEnd(11), `${row.nodes} ${old(row.oldNodes)}`.padEnd(11), `${row.loopKb} ${old(row.oldLoopKb)}`.padEnd(14), String(row.loopSeconds).padEnd(6), `${row.steeredPerFrame} ${old(row.oldSteeredPerFrame)}`);
  }
  console.log(`one-shots, shared by every car: ${shotsKb} KB`);
  process.exit(0);
}

if (flag("--engines")) {
  const options = { old: flag("--old"), inside: flag("--inside"), ids: car === undefined ? undefined : [car] };
  const study = await page.evaluate((options) => globalThis.check.study(options), options);
  await browser.close();
  console.log(`engine study${options.old ? ", old voices" : ""}${options.inside ? ", inside" : ""}`);
  console.log("held".padEnd(20), "  rms", "centroid", "tonal%", "flux%");
  for (const { id, rows, onOff, envelope } of study) {
    for (const [name, row] of Object.entries(rows)) console.log(`${id} ${name}`.padEnd(20), String(row.rmsDb).padStart(5), String(row.centroidHz).padStart(8), String(row.tonalPct).padStart(6), String(row.fluxPct).padStart(5));
    console.log(`${id} on vs off:`, onOff.map(({ share, levelDb, centroidHz, shape }) => `${share * 100}%: ${levelDb} dB, centroid ${centroidHz > 0 ? "+" : ""}${centroidHz} Hz, shape r=${shape}`).join("; "));
    console.log(`${id} envelope as revs double: stays put r=${envelope.fixed}, slides with revs r=${envelope.sliding}`);
  }
  process.exit(0);
}

const results = await page.evaluate(() => globalThis.check.renderAll());
await browser.close();

const CLIP_DB = -0.1;
let failed = 0;
console.log("scene".padEnd(26), "peak", "  rms", "centroid", "strongest", "bands<200/800/3k/8k/+", "revs/gears");
for (const { name, left, right, whole, highestRpm, gears, shifts } of results) {
  const peak = Math.max(left.peakDb, right.peakDb, whole);
  const bad = peak > CLIP_DB || left.broken > 0;
  if (bad) failed++;
  const revs = highestRpm === null ? "" : `${highestRpm} gears ${gears} shifts ${shifts}`;
  console.log(name.padEnd(26), String(peak).padStart(5), String(left.rmsDb).padStart(6), String(left.centroidHz).padStart(6), String(left.strongestHz).padStart(7), left.bandsPct.join("/").padEnd(18), revs, bad ? "FAIL" : "");
}
if (failed > 0) throw new Error(`${failed} scenes clipped or broke`);
