/**
 * The material calibration suite: probes of MEASURED reflectance, at three depths, across the whole
 * range of light and weather the game can produce.
 *
 * This is the instrument the lighting model is judged with, so it is built to be run against TWO
 * builds and diffed. It drives only `setSun / setCamera / setSea / setWaterType / setPlaneSize /
 * setShading / setWaterFx / setVisibility / freeze` plus the rig's own `setRigMaterials` — nothing
 * that exists on one side only. Anything newer (clouds, turbidity) goes through `?.()` so an older
 * build silently keeps its own default rather than being handed a nicer starting position.
 *
 *   node src/projects/shipwright/tools/material-shots.mjs --port 3001 --out .shots/mat/new
 *   node src/projects/shipwright/tools/material-shots.mjs --port 3005 --out .shots/mat/old
 *
 * Every frame contains all three depth rows: floating clear of the crests, straddling the waterline,
 * and submerged. A rig that photographs those separately can never show the seam where the
 * above-water shading meets the underwater absorption, and that seam is the thing most likely to be
 * quietly wrong. Print `--order` to get the left-to-right material list for a reviewer's prompt.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const PORT = Number(arg("port", 3001));
const OUT = path.resolve(arg("out", "src/projects/shipwright/.shots/mat/run"));
const ONLY = arg("only", "");
const WIDTH = 1600;
const HEIGHT = 900;
const FREEZE_T = 30;

// Two probe sets, so no frame is so wide that a ball becomes a smudge. The reference set carries the
// on-set trio (grey ball, chrome ball) and the physical brackets; the world set carries the surfaces
// the game is actually built out of.
const REFERENCE_SET = [
  "charcoal",
  "grey-ball-18",
  "grey-50-srgb",
  "snow",
  "chrome-ball",
  "aluminium",
  "gold",
  "copper",
];
const WORLD_SET = [
  "gelcoat",
  "matte-white",
  "sailcloth",
  "oak",
  "driftwood",
  "rubber",
  "rusted-iron",
  "wet-granite",
];

// Elevated and close enough that the waterline row is cut cleanly by the sea and the submerged row is
// still legible. `wide` frames the whole grid; `raking` drops the eye to sea level so the specular
// lobes and the Fresnel rim do the talking.
const CAM = {
  wide: { pos: [0, 6.4, 17.5], target: [0, -0.5, 0] },
  raking: { pos: [-11, 1.9, 12], target: [2, -0.2, -1] },
  // Square-on to the rig, eye at probe height. The ONLY geometry in which a specular lobe can land on
  // a probe's visible cap -- every other camera here looks at the probes from the sun's own side, so
  // their lit faces point away. A blind reviewer reported "the gloss gelcoat and the matte white are
  // indistinguishable"; they were right about the FRAMES and wrong about the material, because no frame
  // in the suite could show a highlight. The instrument has to be able to see the thing it measures.
  frontlit: { pos: [0, 2.6, 12], target: [0, 0.9, -3.4] },
  overhead: { pos: [0, 12, 8], target: [0, -1, 0] },
  // The navigation marks: a low eye down the channel, the way a helmsman sees them.
  marks: { pos: [-6, 2.4, 6], target: [4, 1.6, -4] },
  marksClose: { pos: [1.5, 2.2, 1.5], target: [-3, 1.6, -4] },
};

const SEA_CALM = { amplitude: 0.35, steepness: 0.08 };
const SEA_CHOP = { amplitude: 0.9, steepness: 0.28 };
const SEA_STORM = { amplitude: 1.6, steepness: 0.4 };

const slug = (el) =>
  el < 0 ? `m${String(-el).replace(".", "_")}` : String(el).replace(".", "_").padStart(2, "0");

const shots = [];
const add = (name, opts) => shots.push({ name, ...opts });

// A -- the reference set down the whole elevation ladder, including twilight. The grey ball reads the
// key; the chrome ball reads the sky; charcoal and snow bracket the tonemapper.
for (const el of [90, 70, 53, 40, 30, 22, 15, 10, 7, 4.5, 2.5, 1, 0, -2, -4, -6]) {
  add(`a-ref-e${slug(el)}`, { set: REFERENCE_SET, cam: "wide", el });
}
// B -- the world set down the same ladder. Wood, paint, cloth, rust, wet rock.
for (const el of [70, 40, 22, 10, 3, 0, -4]) {
  add(`b-world-e${slug(el)}`, { set: WORLD_SET, cam: "wide", el });
}
// C -- the sun walked around the compass at a fixed height. Nothing here may change brightness with
// the sun's COMPASS heading; only with its elevation.
for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
  add(`c-azimuth-a${String(az).padStart(3, "0")}`, {
    set: REFERENCE_SET,
    cam: "wide",
    el: 22,
    az,
  });
}
// D -- grazing light on the specular materials. The Fresnel rim and the clearcoat lobe.
for (const el of [40, 15, 5, 1]) {
  add(`d-raking-e${slug(el)}`, { set: WORLD_SET, cam: "raking", el });
  add(`d-raking-ref-e${slug(el)}`, { set: REFERENCE_SET, cam: "raking", el });
}
// D2 -- FRONT-LIT. Sun behind the camera (azimuth 315 against the suite's 135), so the specular lobes
// are on the probes' visible caps: the clearcoat's hard little highlight against the matte paint's
// broad one, the metals' mirror glint, the chrome ball's image of the sun.
for (const el of [50, 30, 15, 5]) {
  add(`d2-frontlit-world-e${slug(el)}`, { set: WORLD_SET, cam: "frontlit", el, az: 315 });
  add(`d2-frontlit-ref-e${slug(el)}`, { set: REFERENCE_SET, cam: "frontlit", el, az: 315 });
}
// The gloss/matte pair alone, big in frame. If these two ever look the same, the clearcoat is gone.
add("d2-gloss-vs-matte-e30", {
  set: ["gelcoat", "matte-white"],
  cam: "frontlit",
  el: 30,
  az: 315,
});

// E -- WATER CLARITY, the axis this rig exists for as much as the light does.
//
// A Jerlov water type is two independent claims at once: the BODY COLOUR the column converges to, and
// the DEPTH at which you stop seeing through it. Neither can be judged against a flat-painted buoy.
// A probe of known albedo at a known depth under a known attenuation coefficient is the only honest
// test of the Beer-Lambert column -- a 0.85 snow sphere 1.8 m down in Oceanic I and the same sphere in
// Coastal 9 must differ by exactly what `a` and `b` say, and the same sphere STRADDLING the surface
// shows the above-water and below-water halves of one object side by side.
//
// Every Jerlov type the game ships, at three sun elevations (the column's colour depends on the
// spectrum entering it, so a clear noon and a red sunset light the same water differently), from two
// eyes: `overhead` looks down THROUGH the column, `raking` reads the surface's own colour and its
// Fresnel reflectance.
const WATER_TYPES = [
  "Oceanic I",
  "Oceanic II",
  "Oceanic III",
  "Coastal 1",
  "Coastal 3",
  "Coastal 5",
  "Coastal 7",
  "Coastal 9",
];
for (const water of WATER_TYPES) {
  const tag = water.toLowerCase().replace(/\s+/g, "-");
  for (const el of [60, 20, 4]) {
    // Down the column: the submerged row's spheres are the depth gauge.
    add(`e-water-${tag}-e${slug(el)}`, { set: REFERENCE_SET, cam: "overhead", el, water });
  }
  // The surface itself: body colour, Fresnel, and the glitter road over the same water.
  add(`e-water-${tag}-raking`, { set: REFERENCE_SET, cam: "raking", el: 12, water });
  // And the game's own surfaces under that water, at the elevation the sea is usually played at.
  add(`e-water-${tag}-world`, { set: WORLD_SET, cam: "overhead", el: 40, water });
}
// F -- sea state. At a storm the crests wash over the floating row, which is a legitimate thing to
// photograph: it is where the three depths stop being three separate cases.
for (const [tag, sea] of [
  ["calm", SEA_CALM],
  ["chop", SEA_CHOP],
  ["storm", SEA_STORM],
]) {
  add(`f-sea-${tag}-e30`, { set: REFERENCE_SET, cam: "wide", el: 30, sea });
  add(`f-sea-${tag}-e05`, { set: REFERENCE_SET, cam: "raking", el: 5, sea });
}
// G -- cloud. Newer builds only; on an older one `setCloudGenus` is absent and every G frame is
// simply a duplicate of the clear-sky case, which is itself the honest answer to "can it do cloud".
for (const genus of ["clear", "cirrus", "cumulus", "stratus", "cumulonimbus"]) {
  for (const el of [60, 20, 5]) {
    add(`g-cloud-${genus}-e${slug(el)}`, { set: REFERENCE_SET, cam: "wide", el, cloud: genus });
  }
}
// I -- LIT NAVIGATION MARKS. The only emitter in this world that is not the sun, so this is where
// "nothing may assume exactly one light" is either true or visibly false. The lanterns are switched by
// a photocell on the model's own illuminance (~50 lx), so they are dark by day and lit through dusk on
// their own; the `marksForced` frames override that to photograph a lamp against a sky that is not
// black. Every rhythm's period divides the frozen clock, so a single frame shows every lamp lit.
for (const el of [0, -2, -4, -6, -9, -12]) {
  add(`i-marks-e${slug(el)}`, { set: REFERENCE_SET, cam: "marks", el, rig: false, buoys: true });
}
// Close on the port (red) and starboard (green) laterals: does a signal green read as a BLUE-green,
// and does a lamp light the hull beneath it?
for (const el of [-4, -9]) {
  add(`i-marks-close-e${slug(el)}`, { set: REFERENCE_SET, cam: "marksClose", el, rig: false, buoys: true });
}
// The lamps forced on in daylight and at sunset: a 3 NM lantern must be nearly invisible against a
// bright sky, which is exactly why real ones do not bother switching on.
for (const el of [30, 0]) {
  add(`i-marks-forced-e${slug(el)}`, {
    set: REFERENCE_SET,
    cam: "marks",
    el,
    rig: false,
    buoys: true,
    forceLamps: true,
  });
}
// A lamp under a thunderhead. The cloud shadow must NOT dim it -- the lantern is below the deck.
add("i-marks-storm-em4", {
  set: REFERENCE_SET,
  cam: "marks",
  el: -4,
  rig: false,
  buoys: true,
  cloud: "cumulonimbus",
});
// And the marks beside the calibration probes, so a reviewer can see the lamp and the grey ball in one
// frame and say whether the lamp's brightness is credible against a surface of known reflectance.
add("i-marks-with-rig-em4", { set: REFERENCE_SET, cam: "wide", el: -4, rig: true, buoys: true });

// H -- the rig against the archipelago, so the probes and the terrain are judged in one frame. If the
// grey ball and the granite disagree about the light, one of them is lying.
for (const el of [40, 15, 3]) {
  add(`h-islands-e${slug(el)}`, {
    set: WORLD_SET,
    cam: "wide",
    el,
    island: true,
    sea: { amplitude: 0.5, steepness: 0.12 },
  });
}

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

const hasRig = await page.evaluate(() => typeof window.__shipwright.setRigMaterials === "function");
if (!hasRig) {
  console.error("This build has no material rig. Apply the rig patch before capturing.");
  await browser.close();
  process.exit(1);
}

if (has("order")) {
  for (const [label, set] of [["reference", REFERENCE_SET], ["world", WORLD_SET]]) {
    const order = await page.evaluate((s) => {
      window.__shipwright.setRigMaterials(s);
      return window.__shipwright.rigMaterials();
    }, set);
    console.log(`${label} set, left to right: ${order.join(", ")}`);
  }
  await browser.close();
  process.exit(0);
}

// Hide the FPS/GPU panels and the Next dev overlay, exactly as the other capture tools do.
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
  await page.evaluate(
    (c) => {
      const a = window.__shipwright;
      a.resume();
      a.setPlaneSize(5000);
      a.setRigMaterials(c.set);
      a.setBuoyLights?.(c.forceLamps);
      // The seabed is a finite plane; switching it on puts a tan slab across the horizon. The
      // submerged row does not need it -- it IS the depth the water column is measured against.
      // The nav buoys stand at the world origin, right where the rig does, and they are the
      // flat-painted reference this rig exists to replace.
      a.setVisibility({
        physics: false,
        player: false,
        seabed: false,
        pole: false,
        buoys: c.buoys,
        island: c.island,
        rig: c.rig,
      });
      a.setShading("full");
      a.setWaterFx(true);
      a.setWaterType(c.water);
      a.setSea(c.sea);
      a.setCloudGenus?.(c.cloud);
      a.setSun(c.el, c.az);
      a.setCamera(c.cam.pos, c.cam.target);
      a.freeze(c.t);
    },
    {
      set: shot.set,
      cam: CAM[shot.cam],
      el: shot.el,
      az: shot.az ?? 135,
      sea: shot.sea ?? SEA_CALM,
      water: shot.water ?? "Coastal 5",
      cloud: shot.cloud ?? "clear",
      island: shot.island === true,
      buoys: shot.buoys === true,
      rig: shot.rig !== false,
      forceLamps: shot.forceLamps === true,
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
