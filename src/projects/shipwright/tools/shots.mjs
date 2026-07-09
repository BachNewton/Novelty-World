// Deterministic screenshot suite for the Shipwright ocean scene.
//
// Drives the scene's debug control surface (window.__shipwright, attached in dev by
// ../scene.ts) over Playwright to set the sun, camera, water type, sea state, and lighting,
// FREEZE the wave field on a fixed time `t`, then screenshot. Because the Gerstner surface +
// buoys are pure functions of `t`, a frozen frame shows the SAME SEA every run — so a change is
// compared frame-for-frame instead of by eye on rolling waves. The nondeterministic Rapier
// testbed bodies are hidden for capture.
//
// NB frames are NOT bit-identical between runs (the GPU differs on ~0.5% of pixels, mostly specular
// glitter), and they don't need to be: what freezing `t` buys is COMPARABILITY, not byte equality.
// These frames are graded by a reviewer reading the whole image against a written rubric.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/shipwright/tools/shots.mjs [filter] [label]
//   filter — optional substring; only "<group>/<name>" matches are captured (fast iteration,
//     e.g. `front`, `01-sun-heading`, `grazing`). Pass "" to capture the whole suite.
//   label  — optional run label (also SHOTS_LABEL env). Nests output under .shots/<label>/ so
//     an A/B pair (e.g. `before` vs `after`) sits side by side instead of overwriting.
// Writes <label>/<group>/<scenario>.png under ../.shots (gitignored, **/.shots/).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, ".."); // src/projects/shipwright
const FILTER = process.argv[2] ?? "";
const LABEL = process.argv[3] ?? process.env.SHOTS_LABEL ?? "";
const OUTDIR = LABEL ? join(PROJECT_DIR, ".shots", LABEL) : join(PROJECT_DIR, ".shots");
const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3001/3d-games/shipwright";
const VIEWPORT = { width: 1920, height: 1080 };
const FREEZE_T = 30; // fixed wave-field time → identical surface every run

// Camera framings (world metres). Heading of "mid"/"grazing" faces ~az135, so "sun front"
// (az135) puts the glitter road ahead; the sun-heading group rotates the sun, not the camera,
// to keep framing constant. Crucially, each eye sits ABOVE the wave crests for its sea state —
// a crest within ~0.1 m of the eye near-plane-clips (pale wedge), and one above it swamps the
// camera (buoys float over a void). "high" is an oblique down-look for the underwater view.
const CAMERAS = {
  grazing: { pos: [-6, 2.7, 6], target: [4, 1.6, -4] }, // low & flat; pair with calm/moderate seas
  mid: { pos: [-8, 3.2, 8], target: [4, 1.3, -4] },
  high: { pos: [-11, 12, 14], target: [2, -3, -5] }, // oblique, looks down across the shallows
  sea: { pos: [-10, 8, 10], target: [6, 2, -6] }, // across-and-down: reads roughness vs the horizon
  flatcam: { pos: [-3, 3.0, 4], target: [15, 2.6, -14] }, // very low, near-flat grazing — crest test
  // Archipelago framings. The window is centred on (0, -200); the landfall island (42,000 m²,
  // peak 12.8 m) sits at (52, -188), and skerries pepper the water around the raft at the origin.
  archGrain: { pos: [-70, 80, 110], target: [30, 0, -210] }, // high oblique: reads the glacial GRAIN
  archLandfall: { pos: [-14, 4.5, 24], target: [52, 7, -188] }, // sailing toward the big island
  archShore: { pos: [8, 2.4, -128], target: [56, 3.5, -186] }, // close in: the black lichen band
  archSkerry: { pos: [-16, 1.9, 46], target: [-64, 0.8, 6] }, // eye at sea level among the skerries
};

const DEFAULTS = {
  camera: "mid",
  water: "Coastal 5", // the turbid Baltic green default
  sea: { amplitude: 1, steepness: 0.2, wavelength: 1 },
  seabed: false,
  pole: false,
  // Off by default: groups 01–04 are frozen A/B baselines, and dropping an island into their
  // frames would invalidate every one of them. Group 05 opts in.
  island: false,
  // Deliberately DECOUPLED from the scene's 5000 m default: the tool drives its own scene instance
  // (a separate Playwright browser), so it can use a cheap 1000 m plane for fast CPU/SwiftShader
  // captures while the live render stays 5000 m. Vertex count is what's costly on SwiftShader (it's
  // free on a real GPU), and the SSR seam fix is plane-independent — only a faint finite-edge line at
  // the horizon differs between the tool's shots (1000 m) and the live look (5000 m).
  plane: 1000,
};

const scenarios = [];

// Group 1 — sun elevation × heading. Fixed mid camera; rotate the SUN azimuth around it:
// front (into sun, glitter ahead), side (90°), behind (sun at the camera's back).
const HEADINGS = { front: 135, side: 225, behind: 315 };
// Full grid: every elevation × every heading, so the lighting reads across the whole day at each
// heading. The top rung is e85, NOT e90: at the true zenith the sun's azimuth is undefined, so
// front/side/behind would render pixel-identical. Backing off 5° is effectively peak intensity
// (sin85 ≈ 0.996) but with a real sun DIRECTION, so the buoys get three distinct lighting angles
// under the harshest light — the whole point of this group at the top of the sweep.
for (const el of [0, 4, 12, 25, 85]) {
  for (const [h, az] of Object.entries(HEADINGS)) {
    scenarios.push({
      group: "01-sun-heading",
      name: `e${String(el).padStart(2, "0")}-${h}`,
      sun: [el, az],
    });
  }
}

// Group 02 — water clarity × sun elevation. EVERY Jerlov type (clearest oceanic → murkiest
// coastal) crossed with a low/mid/high sun, because sun elevation drives the downwelling that
// lights the water body — the brightness veil is what we're tuning, so it must vary here too.
// One subfolder per type; the elevation sweep sits inside it. High oblique camera + seabed +
// Secchi pole so extinction (visibility) reads alongside the veil colour.
const WATER_TYPES = [
  "Oceanic I", "Oceanic II", "Oceanic III",
  "Coastal 1", "Coastal 3", "Coastal 5", "Coastal 7", "Coastal 9",
];
// Denser near the horizon because the look changes far faster at low sun (air mass ≈ 1/sin(h)
// → reddening/dimming; the cosine projection; Fresnel glitter — all steepest low). Steps are
// roughly even in air mass: 0° sunset (AM ~38), 4° deep golden hour (~12), 12° golden→day
// transition (~5), 25° established daylight (~2.4), 90° harsh zenith (1).
const CLARITY_ELEVATIONS = [0, 4, 12, 25, 90];
WATER_TYPES.forEach((water, i) => {
  const slug = `${i + 1}-${water.toLowerCase().replace(/\s+/g, "-")}`;
  for (const el of CLARITY_ELEVATIONS) {
    scenarios.push({
      group: `02-clarity/${slug}`,
      name: `e${String(el).padStart(2, "0")}`,
      camera: "high",
      seabed: true,
      pole: true,
      water,
      sun: [el, 135],
    });
  }
});

// Group 03 — sea state: a ladder from glassy to very rough. It approximates the WMO sea-state
// scale by scaling the base spectrum's amplitude/steepness — the proper per-Hs spectra live on
// the sea-conditions branch (see docs/sea-conditions.md §4). Shot from the "sea" camera (mid
// height, across-and-down) so the roughness reads against the horizon without swamping the eye.
// Steepness climbs faster than height up the ladder: the top rungs are meant to read as
// PEAKED (trochoidal, near-breaking crests), not just taller rounded swell — so 5/6 push
// steepness hard. (Only the visual ladder; the physics testbed bodies are hidden for capture,
// so this doesn't fight the gentle-sea buoyancy constraint — see docs/sea-conditions.md §3.)
const SEA_STATES = [
  { name: "1-glassy", amplitude: 0.08, steepness: 0.04 },
  { name: "2-calm", amplitude: 0.3, steepness: 0.08 },
  { name: "3-slight", amplitude: 0.6, steepness: 0.18 },
  { name: "4-moderate", amplitude: 1.0, steepness: 0.3 },
  { name: "5-rough", amplitude: 1.5, steepness: 0.6 },
  { name: "6-very-rough", amplitude: 2.0, steepness: 0.85 },
];
for (const st of SEA_STATES) {
  scenarios.push({
    group: "03-sea-state",
    name: st.name,
    camera: "sea",
    sea: { amplitude: st.amplitude, steepness: st.steepness },
    sun: [25, 135],
  });
}

// Group 04 — beauty / exposure stress: the low-sun glitter road and a backlit sunset. Calm sea
// so the low grazing camera stays clear of the crests (also the right mood for a glassy dusk).
scenarios.push({ group: "04-beauty", name: "glitter-low-sun", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [4, 135] });
scenarios.push({ group: "04-beauty", name: "sunset-backlit", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [0, 135] });

// A very low, near-flat grazing view over moderate chop — dramatic, and a standing regression
// test for the SSR grazing/horizon seam (this framing is where the black crest edges showed worst).
scenarios.push({ group: "04-beauty", name: "low-grazing-chop", camera: "flatcam", sea: { amplitude: 1, steepness: 0.25 }, sun: [20, 135] });

// Group 05 — the procedural archipelago (roadmap #7). Judged against docs/ISLANDS.md, whose target
// is the Finnish Archipelago Sea: drowned ice-scoured bedrock, no beach anywhere, a thin crisp black
// lichen band at the waterline, many small skerries, and a shared glacial GRAIN the islands stretch
// along. Coastal 5 (dark brackish green) is the correct water and the default here — turquoise
// shallows are a Caribbean look and would be WRONG.
const ARCH_SEA = { amplitude: 0.5, steepness: 0.12 }; // calm: a Baltic summer day
const BALTIC = "Coastal 5";
scenarios.push({ group: "05-islands", name: "grain", camera: "archGrain", island: true, water: BALTIC, sea: ARCH_SEA, sun: [30, 135] });
scenarios.push({ group: "05-islands", name: "landfall", camera: "archLandfall", island: true, water: BALTIC, sea: ARCH_SEA, sun: [20, 135] });
scenarios.push({ group: "05-islands", name: "shore", camera: "archShore", island: true, water: BALTIC, sea: ARCH_SEA, sun: [25, 200] });
scenarios.push({ group: "05-islands", name: "skerries", camera: "archSkerry", island: true, water: BALTIC, sea: ARCH_SEA, sun: [12, 135] });
// Hero: low warm sun behind the archipelago, silhouettes against the glitter road.
scenarios.push({ group: "05-islands", name: "sunset-backlit", camera: "archLandfall", island: true, water: BALTIC, sea: ARCH_SEA, sun: [4, 135] });
// Diagnostic, NOT a target look: the same shore under the clearest water. docs/ISLANDS.md predicts
// the blown-out shallow rim largely disappears once bright sand is replaced by dark bedrock — this
// frame is where that prediction gets checked.
scenarios.push({ group: "05-islands", name: "shore-clearwater-diagnostic", camera: "archShore", island: true, water: "Oceanic II", sea: ARCH_SEA, sun: [25, 200] });

// ---------------------------------------------------------------------------

// Renders on the REAL GPU (ANGLE/D3D11; confirmed on an AMD Radeon 780M) by default. Set
// SHOTS_CPU=1 to fall back to the SwiftShader CPU rasteriser.
//
// This default was flipped after measuring, and the old rationale for SwiftShader turned out to be
// wrong on both counts:
//   * "SwiftShader renders darker/greener and misses the highlight washout, so it's unreliable for
//     judging lighting/material" — MEASURED FALSE. Against the GPU it differs by a mean of ~1.0-1.5
//     out of 255 (islands/landfall: mean 1.09; sun-85°-front: mean 1.46; mean frame luma 146.83 vs
//     147.03). The differences are broad but tiny, concentrated in a few specular/glitter pixels.
//   * "SwiftShader is deterministic, giving bit-identical A/B frames" — this bought us nothing. The
//     GPU is *nearly* deterministic (two runs of the same frozen frame differ on 0.54% of pixels),
//     and, decisively, WE DO NOT NEED BIT-EXACTNESS: frames are graded by a reviewer agent reading
//     the whole image against a written rubric, not by a byte diff. What the frozen wave field `t`
//     actually buys is COMPARABILITY — same sea, same camera, same sun — and that is unaffected.
// Meanwhile the GPU is ~3.7x faster (8.0 s vs 29.7 s for one scenario, end to end) and is the
// renderer we actually ship on. (Faster still for feel: iterate live on the dev server on :3001.)
const USE_GPU = process.env.SHOTS_CPU !== "1";
const browser = await chromium.launch({
  headless: true,
  args: USE_GPU
    ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
console.log(`renderer: ${USE_GPU ? "real GPU (ANGLE/D3D11)" : "SwiftShader (CPU fallback)"}`);
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });

// Hide dev overlays for clean frames: the lil-gui panel, the small Stats.js canvas, and the
// GPU-timer text panel (a fixed div starting "GPU ms"). Each is styled imperatively, so target
// them structurally rather than by class.
await page.addStyleTag({ content: ".lil-gui{display:none!important}" });
await page.evaluate(() => {
  document.querySelectorAll("canvas").forEach((c) => {
    if (c.width <= 100 && c.parentElement) c.parentElement.style.display = "none";
  });
  document.querySelectorAll("div").forEach((d) => {
    if (d.childElementCount === 0 && d.textContent?.startsWith("GPU ms")) {
      d.style.display = "none";
    }
  });
});

// Wait on the EVENT, not the clock. `isReady()` reports that the async ripple normal map has
// decoded; the sky's PMREM bake is synchronous inside setup, and the Rapier bodies are hidden for
// capture. This replaced a hardcoded 3 s sleep, which was both slower and a race waiting to happen.
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });

const selected = scenarios.filter((s) => `${s.group}/${s.name}`.includes(FILTER));
console.log(`capturing ${selected.length}/${scenarios.length} scenarios${FILTER ? ` matching "${FILTER}"` : ""}`);

let appliedPlane = null;
for (const s of selected) {
  const cam = CAMERAS[s.camera ?? DEFAULTS.camera];
  const plane = s.plane ?? DEFAULTS.plane;
  const cfg = {
    sun: s.sun,
    cam,
    water: s.water ?? DEFAULTS.water,
    sea: { ...DEFAULTS.sea, ...(s.sea ?? {}) },
    seabed: s.seabed ?? DEFAULTS.seabed,
    pole: s.pole ?? DEFAULTS.pole,
    island: s.island ?? DEFAULTS.island,
    plane,
    setPlane: plane !== appliedPlane, // rebuild the (heavy) mesh only when the size actually changes
    shading: s.shading ?? "full", // "full" | "flat" (unlit) | "wireframe" — for diagnostics
    waterFx: s.waterFx ?? true, // gate the screen-space composite (refraction/absorption/SSR)
    freezeT: FREEZE_T,
  };
  appliedPlane = plane;
  const before = await page.evaluate(() => window.__shipwright.frameCount());
  const dir = join(OUTDIR, s.group);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only screenshot tool; `dir` is built from a hardcoded scenario list under a fixed project path, never external input
  mkdirSync(dir, { recursive: true });
  await page.evaluate((c) => {
    const api = window.__shipwright;
    api.resume();
    if (c.setPlane) api.setPlaneSize(c.plane); // rebuild only when the plane size changes (see above)
    api.setVisibility({ physics: false, seabed: c.seabed, pole: c.pole, island: c.island });
    api.setShading(c.shading);
    api.setWaterFx(c.waterFx);
    api.setWaterType(c.water);
    api.setSea(c.sea);
    // Exposure is DERIVED from the scene's own light now (lighting.ts), so there is no auto/manual
    // switch to arm. `setSun` alone re-meters the frame.
    api.setSun(c.sun[0], c.sun[1]);
    api.setCamera(c.cam.pos, c.cam.target);
    api.freeze(c.freezeT);
  }, cfg);
  // Wait for the frozen state to actually reach the screen: two rendered frames, not a sleep. One
  // would do (the capture + SSR pre-passes and the main render all happen inside a single frame),
  // but two costs a millisecond and removes any doubt.
  await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 2, before, {
    timeout: 10000,
  });
  await page.screenshot({ path: join(dir, `${s.name}.png`) });
  console.log("wrote", join(s.group, `${s.name}.png`));
}

if (errors.length) console.log("page errors:\n" + errors.slice(0, 8).join("\n"));
await browser.close();
