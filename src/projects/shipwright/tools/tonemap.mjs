// The tonemap x bloom 2x2 (docs/LIGHTING.md, decision 3). Captures the four combinations on the hero
// frames AND measures the GPU cost of each, in one warm session, on the real GPU.
//
// The two levers attack the same problem -- bright, CORRECTLY WARM highlights clipping to flat white
// because they exceed the tonemap's white point -- so they may be redundant. This runs the experiment
// instead of arguing about it.
//
// Prereq: dev server on :3001.
// Usage:  node src/projects/shipwright/tools/tonemap.mjs [label]
// Writes  .shots/<label>/07-tonemap/<aces|agx>-<bloom-off|bloom-on>/<scene>.png
//   and prints a GPU-ms table (median of N frames per cell, measured with EXT_disjoint_timer_query).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "..");
const LABEL = process.argv[2] ?? "tonemap";
const OUTDIR = join(PROJECT_DIR, ".shots", LABEL, "07-tonemap");
const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3001/3d-games/shipwright";
const VIEWPORT = { width: 1920, height: 1080 };
const FREEZE_T = 30;

// GPU-ms samples per cell, after a warm-up. The GpuTimer's readback lags a frame or two, and the APU
// ramps its clocks, so discard the first few and take a median of the rest (docs/PERFORMANCE.md).
const WARMUP_FRAMES = 30;
const SAMPLE_FRAMES = 60;

const CAMERAS = {
  grazing: { pos: [-6, 2.7, 6], target: [4, 1.6, -4] },
  flatcam: { pos: [-3, 3.0, 4], target: [15, 2.6, -14] },
  archLandfall: { pos: [-14, 4.5, 24], target: [52, 7, -188] },
  rig: { pos: [-5.5, 2.4, 5.5], target: [0.6, 1.3, -0.6] },
};

// The frames where a blown warm highlight is the whole point: the low-sun glitter road, the sunset
// disc, the backlit archipelago -- plus the tropical zenith, where OVERDONE bloom would show first as
// a hazy, milky, low-contrast frame with lifted blacks.
const SCENES = [
  { name: "glitter-low-sun", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [4, 135], water: "Coastal 5" },
  { name: "sunset-backlit", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [0, 135], water: "Coastal 5" },
  { name: "low-grazing-chop", camera: "flatcam", sea: { amplitude: 1, steepness: 0.25 }, sun: [20, 135], water: "Coastal 5" },
  { name: "islands-sunset-backlit", camera: "archLandfall", island: true, sea: { amplitude: 0.5, steepness: 0.12 }, sun: [4, 135], water: "Coastal 5" },
  { name: "tropical-zenith", camera: "rig", rig: true, sea: { amplitude: 0.45, steepness: 0.12 }, sun: [88, 225], water: "Oceanic I" },
];

const CELLS = [
  { tonemap: "ACES", bloom: false },
  { tonemap: "ACES", bloom: true },
  { tonemap: "AgX", bloom: false },
  { tonemap: "AgX", bloom: true },
];

const slug = (cell) => `${cell.tonemap.toLowerCase()}-${cell.bloom ? "bloom-on" : "bloom-off"}`;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });
await page.addStyleTag({
  content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}",
});
await page.evaluate(() => {
  document.querySelectorAll("canvas").forEach((c) => {
    if (c.width <= 100 && c.parentElement) c.parentElement.style.display = "none";
  });
  document.querySelectorAll("div").forEach((d) => {
    if (d.childElementCount === 0 && d.textContent?.startsWith("GPU ms")) d.style.display = "none";
  });
});

if (!(await page.evaluate(() => window.__shipwright.hasGpuTimer()))) {
  console.error("ABORT: no EXT_disjoint_timer_query — GPU-ms would be garbage. Need a real GPU.");
  await browser.close();
  process.exit(1);
}

const applyScene = async (scene) => {
  await page.evaluate(
    (c) => {
      const api = window.__shipwright;
      api.resume();
      api.setPlaneSize(1000);
      api.setVisibility({ physics: false, seabed: false, pole: false, island: c.island === true, rig: c.rig === true });
      api.setShading("full");
      api.setWaterFx(true);
      api.setWaterType(c.water);
      api.setCloudGenus("clear");
      api.setSea(c.sea);
      api.setSun(c.sun[0], c.sun[1]);
      api.setCamera(CAMS[c.camera].pos, CAMS[c.camera].target);
      api.freeze(c.freezeT);
    },
    { ...scene, freezeT: FREEZE_T },
  );
};

// Hand the camera table to the page once, so applyScene can name framings.
await page.evaluate((cams) => {
  window.CAMS = cams;
}, CAMERAS);

/** Median GPU total (capture + ssr + main) over SAMPLE_FRAMES, after WARMUP_FRAMES settle. */
const measureGpuMs = async () => {
  return page.evaluate(
    async ({ warmup, samples }) => {
      const api = window.__shipwright;
      const waitFrames = (n) =>
        new Promise((resolve) => {
          const start = api.frameCount();
          const tick = () => (api.frameCount() >= start + n ? resolve() : requestAnimationFrame(tick));
          tick();
        });
      await waitFrames(warmup);
      const readings = [];
      for (let i = 0; i < samples; i++) {
        await waitFrames(1);
        const g = api.gpuTimings();
        if (g.total > 0) readings.push(g);
      }
      if (readings.length === 0) return null;
      const med = (key) => {
        const v = readings.map((r) => r[key]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      return { n: readings.length, cloud: med("cloud"), capture: med("capture"), ssr: med("ssr"), main: med("main"), total: med("total") };
    },
    { warmup: WARMUP_FRAMES, samples: SAMPLE_FRAMES },
  );
};

const rows = [];
for (const cell of CELLS) {
  await page.evaluate(
    (c) => {
      window.__shipwright.setToneMapping(c.tonemap);
      window.__shipwright.setBloom(c.bloom);
    },
    cell,
  );

  for (const scene of SCENES) {
    await applyScene(scene);
    const before = await page.evaluate(() => window.__shipwright.frameCount());
    await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 3, before, { timeout: 15000 });
    const dir = join(OUTDIR, slug(cell));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool; the path is built from a hardcoded scene list under a fixed project directory
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${scene.name}.png`) });
  }

  // Cost is measured on ONE scene, unfrozen, so the 2x2's four numbers are directly comparable.
  await applyScene(SCENES[2]); // low-grazing-chop: the grazing SSR worst case
  await page.evaluate(() => window.__shipwright.resume());
  const gpu = await measureGpuMs();
  rows.push({ ...cell, gpu });
  console.log(`captured ${slug(cell)}  ${gpu ? `total ${gpu.total.toFixed(2)} ms` : "(no gpu timing)"}`);
}

const base = rows.find((r) => r.tonemap === "ACES" && !r.bloom);
console.log("\n=== tonemap x bloom, GPU ms (median, low-grazing-chop, real GPU) ===\n");
console.log("cell                 cloud  capture     ssr    main   total   vs ACES/bloom-off");
for (const r of rows) {
  if (!r.gpu) continue;
  const delta = base?.gpu ? r.gpu.total - base.gpu.total : 0;
  console.log(
    [
      slug(r).padEnd(20),
      r.gpu.cloud.toFixed(2).padStart(5),
      r.gpu.capture.toFixed(2).padStart(8),
      r.gpu.ssr.toFixed(2).padStart(7),
      r.gpu.main.toFixed(2).padStart(7),
      r.gpu.total.toFixed(2).padStart(7),
      `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ms`.padStart(18),
    ].join(" "),
  );
}
console.log(`\nframes: ${join(OUTDIR)}`);
if (errors.length) console.log("page errors:\n" + errors.slice(0, 8).join("\n"));
await browser.close();
