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
  // 06-lighting framings. `rig` frames the calibration spheres against the sea + horizon: close
  // enough that the shadow terminator on each ball is readable, low enough that the sun's glitter
  // road is in shot. `cloudy` tilts up so the deck fills the upper two thirds while the rig and the
  // horizon stay in the lower third -- you must be able to see the sky AND what it does to the sea.
  rig: { pos: [-5.5, 2.4, 5.5], target: [0.6, 1.3, -0.6] },
  cloudy: { pos: [-7, 3.4, 8], target: [3, 5.0, -7] },
  // High and wide: several km of sea, so 900 m cloud shadows read as a pattern rather than as one
  // ambiguous dark patch. The dappling hero framing.
  dapple: { pos: [-260, 180, 320], target: [140, 0, -180] },
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
  rig: false,
  // Clear sky by default. Groups 01–05 test water clarity, sea state and land — a cloud deck (which
  // now casts real shadows) would confound every one of them. Group 06-lighting/C opts in per genus.
  cloud: "clear",
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

// Group 06 — THE LIGHT ITSELF (see docs/LIGHTING.md "The 06-lighting shot group"). Deliberately NOT
// a cross-product of every axis: each sub-group answers one question. The calibration rig is in shot
// for A, B and C, so the sun:sky ratio, the shadow terminator, the sheen and the highlight roll-off
// are all legible from the image alone. Islands only in the heroes (terrain costs ~1.65 s per run).
const LIGHT_SEA = { amplitude: 0.45, steepness: 0.12 };

// A — the elevation ladder (the physics check). ONE azimuth (side: most diagnostic for form and
// shadow), clear sky. Steps are ~x1.3 in AIR MASS, not in degrees: 25->85 spans 1.1 air masses and
// nothing changes, while 4->0 spans 26. The full 0-90 range, because this is a general lighting
// model, not a Finnish one: 90 deg is the tropical zenith and the harshest frame in the suite.
// Below 0 there is NO direct beam at all -- the strongest possible test that nothing secretly
// depends on the sun existing.
const LADDER = [90, 70, 53, 40, 30, 22, 15, 10, 7, 4.5, 2.5, 1, 0, -2, -4, -6];
for (const el of LADDER) {
  const slug = el < 0 ? `m${String(-el).replace(".", "_")}` : String(el).replace(".", "_").padStart(2, "0");
  scenarios.push({
    group: "06-lighting/a-elevation",
    name: `e${slug}`,
    camera: "rig",
    rig: true,
    sea: LIGHT_SEA,
    sun: [el, 225], // side
  });
}

// B — the azimuth cross (shadows + glitter). 85, NOT 90: at the true zenith the sun's azimuth is
// undefined and the three frames would render identically.
for (const el of [85, 53, 25, 8, 2]) {
  for (const [h, az] of Object.entries(HEADINGS)) {
    scenarios.push({
      group: "06-lighting/b-azimuth",
      name: `e${String(el).padStart(2, "0")}-${h}`,
      camera: "rig",
      rig: true,
      sea: LIGHT_SEA,
      sun: [el, az],
    });
  }
}

// C — cloud states. One tau drives the sky, the beam, the cloud shadow map and the exposure, so the
// picture and the light cannot disagree. Overcast is the acid test: push tau up and the sun goes to
// zero, the shadows go with it, the dome flattens, and every object must still look right together.
const GENERA = ["cirrus", "cumulus", "stratus", "cumulonimbus"];
for (const genus of GENERA) {
  for (const el of [70, 40, 10, 2]) {
    scenarios.push({
      group: `06-lighting/c-cloud/${genus}`,
      name: `e${String(el).padStart(2, "0")}`,
      camera: "cloudy",
      rig: true,
      cloud: genus,
      sea: LIGHT_SEA,
      sun: [el, 225],
      // The sea must run to the TRUE horizon here. Fair-weather cumulus are ~900 m across, so on the
      // suite's usual 1000 m plane the whole scene sits inside a single cloud cell and "dappled"
      // light is invisible -- which is what it looked like on the first review. Physics, not a bug:
      // the frame was too small to contain the phenomenon.
      plane: 5000,
    });
  }
}

// D — heroes. The frames a human actually judges the look on, no rig, no instrument in shot.
scenarios.push({ group: "06-lighting/d-hero", name: "glitter-low-sun", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [4, 135] });
scenarios.push({ group: "06-lighting/d-hero", name: "sunset-backlit", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [0, 135] });
scenarios.push({ group: "06-lighting/d-hero", name: "low-grazing-chop", camera: "flatcam", sea: { amplitude: 1, steepness: 0.25 }, sun: [20, 135] });
scenarios.push({ group: "06-lighting/d-hero", name: "islands-sunset-backlit", camera: "archLandfall", island: true, water: BALTIC, sea: ARCH_SEA, sun: [4, 135] });
// Twilight hero: no beam at all, only scattered skylight. If anything here still looks sun-lit, the
// model is lying somewhere.
scenarios.push({ group: "06-lighting/d-hero", name: "civil-twilight", camera: "grazing", sea: { amplitude: 0.4, steepness: 0.1 }, sun: [-4, 135] });
// The tropical worst case: a near-zenith sun over the clearest water, where a 0.90-albedo sphere and
// a specular sea are the hardest test of "blacks stay black, hues stay hued".
scenarios.push({ group: "06-lighting/d-hero", name: "tropical-zenith", camera: "rig", rig: true, water: "Oceanic I", sea: LIGHT_SEA, sun: [88, 225] });
// Fair-weather cumulus over the archipelago: where the cloud shadow map earns its keep.
scenarios.push({ group: "06-lighting/d-hero", name: "dappled-islands", camera: "archGrain", island: true, water: BALTIC, cloud: "cumulus", sea: ARCH_SEA, sun: [35, 135], plane: 5000 });
// Cloud shadows sweeping open water, from high enough that several kilometres of sea are in frame.
scenarios.push({ group: "06-lighting/d-hero", name: "dappled-sea", camera: "dapple", cloud: "cumulus", sea: LIGHT_SEA, sun: [45, 225], plane: 5000 });
scenarios.push({ group: "06-lighting/d-hero", name: "squall", camera: "dapple", cloud: "cumulonimbus", sea: { amplitude: 1.4, steepness: 0.45 }, sun: [30, 225], plane: 5000 });

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
// Hide dev chrome that would otherwise sit in every captured frame: the lil-gui panel and Next's
// dev-tools indicator (a fixed button in the corner).
await page.addStyleTag({
  content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}",
});
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
    rig: s.rig ?? DEFAULTS.rig,
    cloud: s.cloud ?? DEFAULTS.cloud,
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
    api.setVisibility({ physics: false, player: false, seabed: c.seabed, pole: c.pole, island: c.island, rig: c.rig });
    api.setShading(c.shading);
    api.setWaterFx(c.waterFx);
    api.setWaterType(c.water);
    api.setCloudGenus(c.cloud);
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
