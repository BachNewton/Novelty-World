// Spike capture for the volumetric cloud pass. Drives __shipwright.setVolumetricClouds and shoots a
// few framings. Writes .shots/vol-spike/<preset>/<name>.png. Throwaway; delete with the spike.
//   node src/projects/shipwright/tools/vol-shots.mjs   (worktree dev server on :3007)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTDIR = join(HERE, "..", ".shots", "vol-spike");
const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3007/3d-games/shipwright";

const SHOTS = [
  { preset: "cumulus", name: "cloudy", cam: { pos: [-7, 3.2, 8], target: [3, 6.2, -7] }, sun: [30, 225] },
  { preset: "cumulus", name: "horizon", cam: { pos: [-6, 2.5, 8], target: [40, 5, -40] }, sun: [30, 225] },
  { preset: "cumulus", name: "backlit", cam: { pos: [-6, 2.5, 8], target: [40, 6, -40] }, sun: [12, 135] },
  { preset: "storm", name: "squall", cam: { pos: [-6, 3, 9], target: [4, 11, -8] }, sun: [25, 315] },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
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
for (const s of SHOTS) {
  const dir = join(OUTDIR, s.preset);
  mkdirSync(dir, { recursive: true });
  const before = await page.evaluate(() => window.__shipwright.frameCount());
  await page.evaluate((c) => {
    const api = window.__shipwright;
    api.resume();
    if (c.first) api.setPlaneSize(5000);
    api.setVisibility({ physics: false, player: false, seabed: false, pole: false, island: false, rig: false });
    api.setWaterType("Coastal 5");
    api.setSea({ amplitude: 0.45, steepness: 0.12 });
    api.setVolumetricClouds(true, c.preset);
    api.setSun(c.sun[0], c.sun[1]);
    api.setCamera(c.cam.pos, c.cam.target);
    api.freeze(30);
  }, { ...s, first });
  first = false;
  await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 2, before, { timeout: 10000 });
  await page.screenshot({ path: join(dir, `${s.name}.png`) });
  console.log("wrote", join(s.preset, `${s.name}.png`));
}
if (errors.length) console.log("page errors:\n" + errors.slice(0, 8).join("\n"));
await browser.close();
