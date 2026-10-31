// Renders every scene of the drive's sound through the real graph in headless Chromium's OfflineAudioContext, and prints
// levels and spectra, failing on a clipped or broken one. It sees numbers, not how it sounds: the owner judges by ear.
// Run: node src/projects/aland-drive/audio/tools/check.mjs
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
