/**
 * A/B capture: render the SAME suite of frames against two builds of Shipwright, so a reviewer who
 * has never seen the code can say whether a change is an honest improvement.
 *
 * The whole point is that the two runs differ in exactly one thing: the code. So this script drives
 * ONLY the debug API that both builds share (`setSun`, `setCamera`, `setSea`, `setWaterType`,
 * `setPlaneSize`, `setShading`, `setWaterFx`, `setVisibility`, `freeze`) and touches nothing that
 * exists on one side only. Anything newer is called with `?.()` so an older build simply ignores it
 * and keeps its own default -- never so that the newer build gets a nicer starting position.
 *
 * Usage:
 *   node src/projects/shipwright/tools/ab-shots.mjs --port 3001 --out .shots/ab/branch
 *   node src/projects/shipwright/tools/ab-shots.mjs --port 3005 --out .shots/ab/main
 *
 * The two runs must use the same viewport, the same frozen sim time, and the same frame budget.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("port", 3001));
const OUT = path.resolve(arg("out", "src/projects/shipwright/.shots/ab/run"));
const ONLY = arg("only", "");
const WIDTH = 1600;
const HEIGHT = 900;

/** Frozen sim clock. The Gerstner sea is a closed-form function of time, so both builds render the
 *  identical wave field at the identical `t` -- the surface is not a source of A/B noise. */
const FREEZE_T = 30;

// --- The suite ---------------------------------------------------------------
// Cameras. `pos` and `target` are metres; the sun's azimuth is fixed at 135 so "sunward" really is.
const CAM = {
  // Low over the water, looking straight into the sun. The glitter road and the aureole.
  sunward: { pos: [-6, 2.7, 6], target: [4, 1.4, -4] },
  // Same eye, tilted up: the zenith and the upper dome.
  zenith: { pos: [-6, 2.7, 6], target: [2, 9.5, -2] },
  // Same eye, sun behind the camera: the anti-solar sky, and everything lit from behind us.
  antisolar: { pos: [-6, 2.7, 6], target: [-16, 4.0, 16] },
  // The raft + test hulls, three-quarter lit. Wood, painted voxels, and their shadows on the sea.
  rafts: { pos: [11, 4.2, 13], target: [-1, 0.4, -1] },
  // Close on the raft, the sun raking across it. Reads the shadow terminator on a wooden deck.
  deck: { pos: [4.5, 1.9, 4.5], target: [-0.5, 0.2, -0.5] },
  // The archipelago: rock, lichen, spruce, and the waterline. Land in a mostly-water renderer.
  islands: { pos: [-14, 4.5, 24], target: [52, 7, -188] },
  // Islands with the sun behind them -- rim light, and the sea between us and the rock.
  islandsBacklit: { pos: [40, 5.5, -120], target: [-30, 6, -230] },
  // Everything at once: buoys near, rafts mid, islands far.
  wide: { pos: [24, 8.5, 30], target: [-10, 1, -40] },
};

/** Sea states. The Gerstner surface is the same closed form in both builds, so these are shared. */
const SEA_CALM = { amplitude: 0.4, steepness: 0.1 };
const SEA_CHOP = { amplitude: 0.5, steepness: 0.12 }; // flat water hides a shoreline
const SEA_GLASS = { amplitude: 0.08, steepness: 0.04 };
const SEA_STORM = { amplitude: 1.6, steepness: 0.4 };

/** Elevation -> filename slug. `4.5` -> `04_5`, `-6` -> `m6`. */
const slug = (el) =>
  el < 0 ? `m${String(-el).replace(".", "_")}` : String(el).replace(".", "_").padStart(2, "0");

/** The sun ladder. The twilight rungs are included deliberately: "can this build do twilight at all"
 *  is a fair question, and a blind reviewer is the right person to answer it. */
const shots = [];
const add = (name, opts) => shots.push({ name, ...opts });

// A -- elevation ladder into the sun, clear sky, open water.
for (const el of [90, 70, 53, 40, 30, 22, 15, 10, 7, 4.5, 2.5, 1, 0, -2, -4, -6]) {
  add(`a-sunward-e${slug(el)}`, { cam: "sunward", el });
}
// B -- the same ladder, but looking away from the sun and up at the dome.
for (const el of [75, 30, 8, 3, 0, -6]) {
  add(`b-zenith-e${slug(el)}`, { cam: "zenith", el });
  add(`b-antisolar-e${slug(el)}`, { cam: "antisolar", el });
}
// C -- objects. Wooden rafts + painted voxel hulls + the nav buoys, across the day.
for (const el of [70, 40, 22, 10, 3, 0]) {
  add(`c-rafts-e${slug(el)}`, { cam: "rafts", el, physics: true });
  add(`c-deck-e${slug(el)}`, { cam: "deck", el, physics: true });
}
// D -- islands. Rock, lichen and spruce are the only non-water albedos in the scene.
for (const el of [70, 40, 22, 10, 3, 0]) {
  add(`d-islands-e${slug(el)}`, { cam: "islands", el, island: true, sea: SEA_CHOP });
}
for (const el of [40, 10, 3]) {
  add(`d-backlit-e${slug(el)}`, { cam: "islandsBacklit", el, island: true, sea: SEA_CHOP });
}
// E -- everything together. Buoys + rafts + islands in one frame, the holistic check.
for (const el of [70, 40, 22, 10, 3, 0, -4]) {
  add(`e-wide-e${slug(el)}`, { cam: "wide", el, physics: true, island: true, sea: SEA_CHOP });
}
// F -- sea states and water types, so the light is judged over more than one surface.
add("f-glassy-e05", { cam: "sunward", el: 5, sea: SEA_GLASS });
add("f-storm-e20", { cam: "sunward", el: 20, sea: SEA_STORM });
add("f-storm-rafts-e35", { cam: "rafts", el: 35, physics: true, sea: SEA_STORM });
add("f-clearwater-e30", { cam: "rafts", el: 30, physics: true, water: "Oceanic I" });
add("f-turbid-e30", { cam: "rafts", el: 30, physics: true, water: "Coastal 9" });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`http://localhost:${PORT}/3d-games/shipwright`, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
// The "trapped-air cells" x-ray is a diagnostic overlay that ships ON, and it drapes a glowing cyan
// lattice over every buoyant hull -- it would dominate any frame containing the raft. Both builds
// carry the identical lil-gui checkbox, so click IT rather than adding an API to one side only.
// Must happen before the panel is hidden: Playwright will not click a display:none element.
const overlayOff = await page.evaluate(() => {
  const label = [...document.querySelectorAll(".lil-gui .name")].find(
    (n) => n.textContent?.trim() === "trapped-air cells",
  );
  const box = label?.parentElement?.querySelector("input[type=checkbox]");
  if (!box || !box.checked) return false;
  box.click();
  return true;
});
if (!overlayOff) console.log("WARNING: could not turn off the trapped-air x-ray overlay");

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

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only capture tool; `OUT` is a --out flag typed by the developer running it, never external input
mkdirSync(OUT, { recursive: true });

let done = 0;
for (const shot of shots) {
  if (ONLY && !shot.name.startsWith(ONLY)) continue;
  const cam = CAM[shot.cam];
  const sea = shot.sea ?? SEA_CALM;
  await page.evaluate(
    (c) => {
      const a = window.__shipwright;
      a.resume();
      a.setPlaneSize(5000);
      a.setVisibility({
        physics: c.physics,
        island: c.island,
        seabed: false,
        pole: false,
      });
      // Newer builds only. Absent on the baseline, which keeps its own defaults -- never called to
      // give the newer build an advantage the older one cannot have.
      a.setCloudGenus?.("clear");
      a.setVisibility({ rig: false });
      a.setShading("full");
      a.setWaterFx(true);
      a.setWaterType(c.water);
      a.setSea(c.sea);
      a.setSun(c.el, 135);
      a.setCamera(c.cam.pos, c.cam.target);
      a.freeze(c.t);
    },
    {
      cam,
      el: shot.el,
      sea,
      water: shot.water ?? "Coastal 5",
      physics: shot.physics === true,
      island: shot.island === true,
      t: FREEZE_T,
    },
  );
  const before = await page.evaluate(() => window.__shipwright.frameCount());
  await page.waitForFunction((n) => window.__shipwright.frameCount() >= n + 4, before, {
    timeout: 20000,
  });
  await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
  done++;
}

if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
console.log(`captured ${done} frames -> ${OUT}`);
await browser.close();
