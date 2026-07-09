// Measure the sun:sky irradiance ratio on the REAL GPU, at every elevation, with each source
// isolated. This is the instrument that found the original bug (docs/LIGHTING.md "Probe, don't
// squint"), and it is how the overhaul is judged before a single frame is looked at.
//
// It is strictly better than the screenshot method the brief describes. The probe renders a diffuse
// card into an off-screen HalfFloat target, and three applies NO tone mapping when the destination is
// a render target (only when drawing to the canvas). So we read TRUE LINEAR radiance: no sRGB to
// undo, no ACES to invert, no exposure to divide out. See lighting-rig.ts.
//
// Prereq: dev server on :3001.
// Usage:  node src/projects/shipwright/tools/probe.mjs [genus]
//   genus - optional cloud genus (clear | cirrus | cumulus | stratus | cumulonimbus); default clear.

import { chromium } from "playwright";

const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3001/3d-games/shipwright";
const GENUS = process.argv[2] ?? "clear";

// The doc's derived targets, on a HORIZONTAL diffuse surface. Beam foreshortens by sin(h), so this
// is the orientation the acceptance table is defined on. (A sun-facing card always reads higher.)
const TARGET = {
  90: 8.5, 70: null, 53: 6.5, 40: null, 30: 3.5, 22: 2.5, 15: 1.6,
  10: 1.0, 7: 0.6, 4.5: 0.3, 2.5: null, 1: null, 0: 0, "-2": 0, "-4": 0, "-6": 0,
};
const ELEVATIONS = [90, 70, 53, 40, 30, 22, 15, 10, 7, 4.5, 2.5, 1, 0, -2, -4, -6];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });

await page.evaluate((g) => window.__shipwright.setCloudGenus(g), GENUS);

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const rows = [];
for (const elevation of ELEVATIONS) {
  const before = await page.evaluate(() => window.__shipwright.frameCount());
  await page.evaluate((el) => window.__shipwright.setSun(el, 135), elevation);
  // Wait for a real rendered frame so the PMREM bake and the cloud shadow map are current.
  await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 2, before, { timeout: 10000 });
  const m = await page.evaluate(() => window.__shipwright.measureLighting());
  rows.push({ elevation, ...m });
}

console.log(`\ncloud genus: ${GENUS}`);
console.log("Measured on the GPU, in LINEAR radiance, each source isolated. Card albedo 0.18.\n");
console.log("      |------ horizontal card ------|--- sun-facing card ---|");
console.log("elev  |   beam     sky     ratio  tgt|   beam     sky   ratio| exposure  lux");
console.log("------+------------------------------+-----------------------+---------------");
for (const r of rows) {
  const t = TARGET[String(r.elevation)];
  console.log(
    [
      String(r.elevation).padStart(5),
      lum(r.horizontalBeam).toExponential(2).padStart(9),
      lum(r.horizontalSky).toExponential(2).padStart(9),
      r.ratioHorizontal.toFixed(2).padStart(7),
      (t === null || t === undefined ? "-" : String(t)).padStart(4),
      lum(r.sunFacingBeam).toExponential(2).padStart(9),
      lum(r.sunFacingSky).toExponential(2).padStart(9),
      r.ratioSunFacing.toFixed(2).padStart(7),
      r.modelled.exposure.toFixed(2).padStart(9),
      Math.round(r.modelled.illuminanceLux).toString().padStart(7),
    ].join(" "),
  );
}

// The model predicts; the render measures. A gap between them is a bug in the wiring, not the physics.
console.log("\nmodel vs render (horizontal, ratio):");
for (const r of rows) {
  const modelled = r.modelled.skyIrradiance > 0 ? r.modelled.beamHorizontal / r.modelled.skyIrradiance : 0;
  const delta = r.ratioHorizontal > 0 ? (r.ratioHorizontal / Math.max(modelled, 1e-9) - 1) * 100 : 0;
  console.log(
    `  ${String(r.elevation).padStart(5)}: model ${modelled.toFixed(2).padStart(6)}  render ${r.ratioHorizontal.toFixed(2).padStart(6)}  (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`,
  );
}

if (errors.length) console.log("\npage errors:\n" + errors.slice(0, 8).join("\n"));
await browser.close();
