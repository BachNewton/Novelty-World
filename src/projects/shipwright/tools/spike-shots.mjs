// Throwaway spike harness for the relief-cloud experiment. Captures a few cumulus framings TWICE —
// relief on (genus default height) and off (setCloudHeight(0) => the old flat plane) — so the two sit
// side by side under .shots/relief-spike/{on,off}/. Drives the worktree dev server (port 3005).
//
// Usage:  node src/projects/shipwright/tools/spike-shots.mjs
// Not committed — delete with the spike.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "..");
const OUTDIR = join(PROJECT_DIR, ".shots", "relief-spike");
const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3005/3d-games/shipwright";
const VIEWPORT = { width: 1920, height: 1080 };
const FREEZE_T = 30;

// The framings that actually test "3-D vs flat texture", in world metres.
const FRAMINGS = [
  // The user's complaint: a low eye looking ACROSS toward the horizon, where the deck compresses.
  { name: "horizon", camera: { pos: [-6, 2.5, 8], target: [40, 5, -40] }, sun: [30, 225] },
  // Up-tilt: sky fills the upper two thirds — reads tops and sun-facing vs shadowed sides.
  { name: "cloudy", camera: { pos: [-7, 3.2, 8], target: [3, 6.2, -7] }, sun: [30, 225] },
  // High oblique down-look: the relief silhouette from above, the clearest proof of concept.
  { name: "overview", camera: { pos: [-260, 340, 340], target: [40, 20, -120] }, sun: [35, 135] },
  // Backlit low sun: the silver-lining test — does a 3-D edge catch the light a flat sheet can't?
  { name: "backlit", camera: { pos: [-6, 2.5, 8], target: [40, 6, -40] }, sun: [12, 135] },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
await page.addStyleTag({ content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}" });
await page.evaluate(() => {
  document.querySelectorAll("canvas").forEach((c) => {
    if (c.width <= 100 && c.parentElement) c.parentElement.style.display = "none";
  });
});
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });

let first = true;
for (const f of FRAMINGS) {
  for (const relief of [true, false]) {
    const label = relief ? "on" : "off";
    const dir = join(OUTDIR, label);
    mkdirSync(dir, { recursive: true });
    const before = await page.evaluate(() => window.__shipwright.frameCount());
    await page.evaluate((c) => {
      const api = window.__shipwright;
      api.resume();
      if (c.first) api.setPlaneSize(5000); // cumulus cells are ~650 m — the scene must run to the horizon
      api.setVisibility({ physics: false, player: false, seabed: false, pole: false, island: false, rig: false });
      api.setWaterType("Coastal 5");
      api.setSea({ amplitude: 0.45, steepness: 0.12 });
      api.setCloudGenus("cumulus"); // resets height to the genus default (700)
      if (!c.relief) api.setCloudHeight(0); // relief off => the old flat plane
      api.setSun(c.sun[0], c.sun[1]);
      api.setCamera(c.cam.pos, c.cam.target);
      api.freeze(30);
    }, { cam: f.camera, sun: f.sun, relief, first });
    first = false;
    await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 2, before, { timeout: 10000 });
    await page.screenshot({ path: join(dir, `${f.name}.png`) });
    console.log("wrote", join(label, `${f.name}.png`));
  }
}

if (errors.length) console.log("page errors:\n" + errors.slice(0, 8).join("\n"));
await browser.close();
