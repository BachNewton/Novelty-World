// Deterministic GPU render-cost benchmark for the Shipwright ocean.
//
// The COMPANION to tools/shots.mjs. Shots answer "how does it LOOK" (frozen, bit-identical
// pixels — SwiftShader is fine). This answers "how much does it COST" — milliseconds under
// load on a REAL GPU. It drives window.__shipwright.runBenchmark, which flies a scripted,
// fixed-timestep camera path through the scene's known stressors (see ../benchmark.ts), and
// samples per-pass GPU time (EXT_disjoint_timer_query) every frame.
//
// TWO MODES, ONE FLIGHT (same scripted camera path — only the clock differs):
//   • HEADLESS (default) → FIXED-DT, deterministic. The sea + camera are pure functions of time, so
//     every run renders a byte-identical sequence → an A/B diff reflects only the render tweak, not
//     timing noise. This is the trustworthy COST instrument. GPU-ms is the source of truth (it's the
//     fill/SSR bottleneck AND vsync-independent); CPU-ms is secondary.
//   • --headed → REAL-TIME, wall-clock. The flight advances by the real frame delta, so it plays at
//     natural speed in a visible window — the LOOK & FEEL instrument. Its FPS is the felt-smoothness
//     signal, NOT a deterministic A/B number, so don't compare headed numbers to headless ones.
//
// MUST run on a real GPU: GpuTimer reports n/a under SwiftShader, so we launch ANGLE/D3D11 and ABORT
// if the timer is unavailable (rather than emit garbage). Confirmed on an AMD 780M.
//
// DEV vs PROD + HOT RELOAD: GPU-ms is build-mode-independent (identical GLSL either way), so a dev
// server is fine for GPU-cost iteration — PROVIDED no file edit lands mid-run (Fast Refresh can
// remount the scene and wreck the run; we guard with a timeout that fails loud). For clean CPU-ms or
// a "final" number, point --url at a production build (next build && next start). NOTE: the benchmark
// must hit a server running THIS checkout's code, not an unrelated dev server.
//
// COST-CENTRE MODES (--mode, orthogonal to the clock above): a frame has two cost centres — GPU
// (render passes) and CPU (physics step). --mode picks which to exercise:
//   visuals (default) → render only, physics frozen — isolate GPU render cost (what most runs want).
//   physics           → step a benchmark-owned Rapier world (BENCH_SHAPES) with the ocean HIDDEN —
//                       isolate CPU physics cost (the `phys` column is the whole signal, GPU ~0).
//   both              → render AND step — the true combined gameplay frame.
// The physics world is separate from the live scene's raft + sailor and reset to a known spawn, so
// physics/both stay deterministic in headless mode.
//
// PHYSICS LOAD (--bodies N, physics/both only): swap the curated demo set for a fresh grid of N
// buoyant hulls (cycled from the air-enclosing demo shapes — boat/hulls/buckets/crown, the builds
// that actually exercise our per-voxel flood-fill buoyancy). Sweep N = 4/8/16/32/64 to trace the
// object-count scaling curve (the `phys` column vs N). Omit for the default demo scene.
//
// Prereq: a server serving this build + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/shipwright/tools/bench.mjs [--url U] [--mode visuals|physics|both]
//   Cost centre:   [--mode visuals|physics|both] [--bodies N]
//   GPU levers:    [--render-scale R] [--reflection-res R] [--ssr off] [--ssr-cutoff C (E5)]
//                  [--ssr-steps N (E4)] [--capture-scale R (E7)] [--msaa off (E9)]
//                  [--quad-size M (E8 tess)] [--shading full|flat|wireframe] [--water NAME]
//   Lighting/scene:[--grade off] [--composer-samples N] [--shadows off] [--shadow-cache off]
//                  [--clouds NAME] [--cloud-shadow off] [--terrain on] [--buoys off] [--sky-dome off]
//   Physics probes:[--collision off] [--drag off] [--sample-iters N]  (cost-isolation; alter dynamics)
//   Diagnostics:   [--gpu-timer off] [--bare-probe]       (isolate render-call / timer overhead)
//   Run:           [--url U] [--label L] [--width 1600] [--height 900] [--headed] [--hold SEC] [--timeout MS]
// Reports (stdout): per-segment FPS + per-pass GPU ms; a CPU seam split (ocean/capt/ssr/main/phys);
//   a physics split (buoyancy/solver, physics/both); and a render census (draw calls + scene-graph
//   node count — watch this, not just draw calls: hidden nodes still cost updateMatrixWorld).
// Writes  <label>/<host>-<sha>-<slug>.json under ../.bench (gitignored, **/.bench/).

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, ".."); // src/projects/shipwright

// --- args ------------------------------------------------------------------
const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    // A bare flag (`--headed`) or one followed by another flag takes no value → boolean true.
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[a.slice(2)] = "true";
    } else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
};
const args = parseArgs(process.argv.slice(2));

const BASE_URL =
  args.url ?? process.env.SHIPWRIGHT_URL ?? "http://localhost:3001/3d-games/shipwright";
const LABEL = args.label ?? process.env.BENCH_LABEL ?? "";
const HEADED = args.headed !== undefined; // headed → real-time watch; headless (default) → fixed-dt measure
const TIMEOUT = Number(args.timeout ?? 120000); // headed real-time flight (~35 s + end-hold); generous for both
// End-hold: SECONDS to hold the final frame before the window closes (real-time watch only). Passed
// into the run, so page.evaluate keeps awaiting (window stays open) during the hold — no separate
// post-run wait. Longer is nice when watching live; irrelevant headless.
const HOLD_SECONDS = Number(args.hold ?? (HEADED ? 2 : 0));
// Default viewport 1600×900 — standard 16:9, shorter than a 1080p display so the browser chrome
// (the VERTICAL space, which is what actually overflowed) fits and a headed window shows the whole
// scene. Override with --width / --height.
const VIEWPORT = { width: Number(args.width ?? 1600), height: Number(args.height ?? 900) };

// Only the knobs the user set are sent; the scene keeps its defaults for the rest.
const config = {};
if (args["render-scale"] !== undefined) config.renderScale = Number(args["render-scale"]);
if (args["reflection-res"] !== undefined) config.reflectionRes = Number(args["reflection-res"]);
// --ssr off (or false) disables SSR entirely (env-map fallback + the march pass is skipped) — E6, to
// measure SSR's share of the frame. Any other value (or omitting the flag) leaves SSR on.
if (args.ssr !== undefined) config.ssrEnabled = !(args.ssr === "off" || args.ssr === "false");
// --ssr-cutoff C sets the SSR Fresnel cutoff (E5, uSsrMinFresnel, default 0.05): raising it discards
// more near-head-on pixels before the march. Sweep 0.02/0.05/0.1/0.2 to trace the grazing SSR cost.
if (args["ssr-cutoff"] !== undefined) config.ssrMinFresnel = Number(args["ssr-cutoff"]);
// --collision off (or false) disables Rapier contact generation on the bench bodies (collision groups)
// — mass/inertia/buoyancy + the broad-phase AABBs stay, only narrow-phase + solver contacts drop — to
// measure collision-resolution's share of the physics step (physics/both modes). Any other value keeps
// collision on. NOTE: the bench hulls are laid out non-overlapping, so expect a SMALL delta — see the
// isolation logic in docs/perf-experiments (collision cost here is broad-phase, which this doesn't cut).
if (args.collision !== undefined) config.collisionEnabled = !(args.collision === "off" || args.collision === "false");
// --drag off skips the per-voxel drag term + its 2 sampleParticle water-velocity evals — isolates the
// drag/velocity-sampling share of the buoyancy loop (physics/both). A cost probe (alters dynamics).
if (args.drag !== undefined) config.dragEnabled = !(args.drag === "off" || args.drag === "false");
if (args.water !== undefined) config.water = args.water;
// --shading full|flat|wireframe isolates the main pass's GPU cost: full = PBR+composite, flat = unlit
// fill (same geometry → shading MATH = full−flat), wireframe = no fill (fill = flat−wireframe).
if (args.shading !== undefined) config.shading = args.shading;
// --water-fx off gates the screen-space composite (refraction+depth+SSR sampling), leaving PBR-lit water
// — full−(fx off) = the composite's GPU share; (fx off)−flat = the PBR lighting share.
if (args["water-fx"] !== undefined) config.waterFx = !(args["water-fx"] === "off" || args["water-fx"] === "false");
// --quad-size M sets the ocean tessellation quad edge in metres (E8): larger = coarser plane (fewer
// vertices). segments = planeSize / quadSize, clamped [8, 2048]. Isolates the plane's VERTEX cost from
// the fixed per-render-call submission overhead — e.g. --quad-size 625 collapses ~1 M verts to ~8²·2.
if (args["quad-size"] !== undefined) config.quadSize = Number(args["quad-size"]);
// --gpu-timer off disables the GpuTimer's TIME_ELAPSED queries (still measures wall-clock CPU) — to
// check whether the timer's own command-buffer fences inflate the per-render CPU submit. GPU-ms → 0.
if (args["gpu-timer"] !== undefined) config.gpuTimer = !(args["gpu-timer"] === "off" || args["gpu-timer"] === "false");
// --bare-probe renders an empty scene per frame to read the irreducible per-call renderer.render()
// floor (the `bare` column). Adds one render/frame, so only for diagnostics.
if (args["bare-probe"] !== undefined) config.bareProbe = true;
if (args.mode !== undefined) config.mode = args.mode; // visuals | physics | both (default visuals)
if (args.bodies !== undefined) config.bodies = Number(args.bodies); // physics-load body count (scaling sweep)

// --- Lighting-overhaul + scene-content cost axes (2026-07-12) ---------------------------------
// The cost model in docs/ predates BOTH the lighting overhaul and the islands. A re-baseline found the
// GPU frame at 16.5 ms where the docs record 9.5, with the main pass DOUBLED — so these knobs exist to
// attribute that. Every one is a SUBTRACTION probe (the --shading / --water-fx methodology): run with
// the feature off, diff against the default. None is a quality setting.
const offFlag = (v) => !(v === "off" || v === "false" || v === "0");
// --grade off: drop the post-tonemap display grade. This ALSO drops the EffectComposer it drags in
// (the hook routes through a composer whenever bloom OR grade is on), so the scene renders straight to
// the framebuffer instead of into a HalfFloat + MSAA target that is then resolved and blitted.
if (args.grade !== undefined) config.grade = offFlag(args.grade);
// --shadows off: no sun shadow map at all (castShadow + shadowMap.enabled cleared).
if (args.shadows !== undefined) config.shadows = offFlag(args.shadows);
// --shadow-cache off: restore three's stock behaviour of redrawing the shadow map inside EVERY
// renderer.render() — i.e. 3× per frame here (capture → SSR → main). The scene now caches it to once
// per frame; this prices what that fix saved.
if (args["shadow-cache"] !== undefined) config.shadowCache = offFlag(args["shadow-cache"]);
// --cloud-shadow off: kill the cloud-shadow term (the 512² pass + one map fetch per LIT FRAGMENT in
// the global lights_fragment_begin override). Only meaningful WITH --clouds: a clear sky pays nothing.
if (args["cloud-shadow"] !== undefined) config.cloudShadow = offFlag(args["cloud-shadow"]);
// --clouds NAME: pin a cloud genus ("Stratocumulus", "Nimbostratus", …). The flight is CLEAR by
// default, so the overcast frame — a real gameplay condition — has never been measured.
if (args.clouds !== undefined) config.clouds = args.clouds;
// --terrain on: show the archipelago in EVERY segment. The bench has always hidden it (to keep the
// legacy segments comparable), so the islands have had zero cost attribution since they shipped.
if (args.terrain !== undefined) config.terrain = offFlag(args.terrain);
// --buoys off: hide the nav buoys (their meshes + lantern point-lights).
if (args.buoys !== undefined) config.buoys = offFlag(args.buoys);
// --buoy-lights resident: keep the six lantern PointLights in the scene graph in DAYLIGHT, when they are
// switched off — the behaviour that made six unlit lamps the most expensive thing in the GPU frame.
// Restores it so the fix can be priced as an interleaved A/B in one warm session.
if (args["buoy-lights"] !== undefined) config.buoyLightsResident = args["buoy-lights"] === "resident";
// --sky-dome off: hide the sky dome mesh. Env map + sun light stay, so lighting is unchanged and only
// the dome's own per-fragment cost drops — a clean subtraction.
if (args["sky-dome"] !== undefined) config.skyDome = offFlag(args["sky-dome"]);
// --ssr-steps N (E4): the SSR march's per-pixel dependent-fetch count (default 20, max 48). Now a
// uniform-break loop, so it sweeps at runtime instead of needing a rebuild per value.
if (args["ssr-steps"] !== undefined) config.ssrSteps = Number(args["ssr-steps"]);
// --sample-iters N: Newton iterations inverting the Gerstner displacement (default 4) — the inner cost
// of the frame's #1 CPU system (buoyancy calls it per voxel, per void cell, per substep). 0 = skip the
// inversion. A FIDELITY probe: fewer iterations = a less exact waterline.
if (args["sample-iters"] !== undefined) config.sampleIters = Number(args["sample-iters"]);

// Mount-time knobs. These are baked when the scene mounts (the WebGL context's MSAA, the capture
// target, the composer target), long before runBenchmark is called — so they travel as URL params, not
// as runtime config. Recorded in `config` too, so they land in the JSON + the filename slug.
const urlParams = new URLSearchParams();
if (args.msaa !== undefined) {
  config.msaa = offFlag(args.msaa); // E9 — MSAA on the DEFAULT framebuffer (WebGL context `antialias`)
  urlParams.set("msaa", config.msaa ? "on" : "off");
}
if (args["capture-scale"] !== undefined) {
  config.captureScale = Number(args["capture-scale"]); // E7 — the scene-capture colour+depth target
  urlParams.set("captureScale", String(config.captureScale));
}
if (args["composer-samples"] !== undefined) {
  // MSAA samples on the COMPOSER's HalfFloat target. Splits --grade off's saving into "the MSAA
  // resolve of an HDR target" (which the project's own bloom numbers priced at ~2.5 ms on the 780M)
  // vs "the extra fullscreen passes".
  config.composerSamples = Number(args["composer-samples"]);
  urlParams.set("composerSamples", String(config.composerSamples));
}
if (HEADED) config.realtime = true; // headed = real-time (natural-speed) watch mode
if (HOLD_SECONDS > 0) config.endHoldSeconds = HOLD_SECONDS;

// The mount-time knobs (MSAA / capture scale / composer samples) ride on the URL — the scene bakes them
// when it mounts, well before runBenchmark is reachable.
const URL = urlParams.size > 0 ? `${BASE_URL}?${urlParams.toString()}` : BASE_URL;

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: PROJECT_DIR }).toString().trim();
  } catch {
    return "unknown";
  }
};
const SHA = git("rev-parse --short HEAD");
const BRANCH = git("rev-parse --abbrev-ref HEAD");

// --- stats -----------------------------------------------------------------
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const percentile = (sortedAsc, p) => {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
};
const round = (x, n = 2) => Number(x.toFixed(n));
// p50/p95/p99 of a per-frame value derived by `pick(frame)` (a pass ms, or the GPU total).
const passStats = (frames, pick) => {
  const s = frames.map(pick).sort((a, b) => a - b);
  return { p50: round(percentile(s, 0.5)), p95: round(percentile(s, 0.95)), p99: round(percentile(s, 0.99)) };
};

// Frames: [{ cpuMs, capture, ssr, main }]. GPU total is the fill/SSR bottleneck; a frame's
// real cost is max(CPU prep, GPU total) since the two pipeline. FPS derives from that.
const summarise = (frames) => {
  const frameMs = frames.map((f) => Math.max(f.cpuMs, f.cloud + f.capture + f.ssr + f.main));
  const frameSorted = [...frameMs].sort((a, b) => a - b);
  const median = percentile(frameSorted, 0.5);
  const spikeThreshold = median * 2; // a frame taking >2× the median frame is a hitch
  const spikes = frameMs.filter((ms) => ms > spikeThreshold);
  return {
    frames: frames.length,
    fps: {
      avg: round(1000 / mean(frameMs), 1), // throughput average
      min: round(1000 / Math.max(...frameMs), 1), // slowest frame
      max: round(1000 / Math.min(...frameMs), 1), // fastest frame
      onePctLow: round(1000 / percentile(frameSorted, 0.99), 1), // 99th-pct frame time (the "1% low")
    },
    ms: {
      frame: { p50: round(median), p95: round(percentile(frameSorted, 0.95)), p99: round(percentile(frameSorted, 0.99)) },
      total: passStats(frames, (f) => f.cloud + f.capture + f.ssr + f.main),
      cloud: passStats(frames, (f) => f.cloud),
      capture: passStats(frames, (f) => f.capture),
      ssr: passStats(frames, (f) => f.ssr),
      main: passStats(frames, (f) => f.main),
      cpu: passStats(frames, (f) => f.cpuMs),
      physics: passStats(frames, (f) => f.physicsMs), // CPU physics-step ms (0 in visuals mode)
      buoyancy: passStats(frames, (f) => f.buoyancyMs ?? 0), // per-voxel buoyancy share of the step (thread 5)
      solver: passStats(frames, (f) => f.solverMs ?? 0), // Rapier world.step() share of the step
      // CPU seam-timer split of the render-prep (thread 1). All CPU *submission* ms (wall-clock),
      // NOT GPU execution. `cpuMs` (above) = onFrame only, so it EXCLUDES mainCpu (the 2nd full draw);
      // cpuTotal = cpuMs + mainCpu is the true per-frame CPU serial time. `??`-guarded for old JSON.
      ocean: passStats(frames, (f) => f.oceanMs ?? 0),
      // Split out of `ocean` (which silently folded in the buoys) — and `daylight` was previously not
      // run by the bench AT ALL, so the whole lighting overhaul's per-frame CPU went unmeasured.
      buoys: passStats(frames, (f) => f.buoysMs ?? 0),
      daylight: passStats(frames, (f) => f.daylightMs ?? 0),
      captureCpu: passStats(frames, (f) => f.captureCpuMs ?? 0),
      ssrCpu: passStats(frames, (f) => f.ssrCpuMs ?? 0),
      mainCpu: passStats(frames, (f) => f.mainCpuMs ?? 0),
      cpuTotal: passStats(frames, (f) => f.cpuMs + (f.mainCpuMs ?? 0)),
      bare: passStats(frames, (f) => f.bareMs ?? 0), // irreducible per-call renderer.render() floor (--bare-probe)
    },
    spikes: {
      count: spikes.length,
      thresholdMs: round(spikeThreshold),
      worstMs: spikes.length > 0 ? round(Math.max(...spikes)) : 0,
    },
  };
};

// --- run -------------------------------------------------------------------
// Real GPU via ANGLE/D3D11 (NOT SwiftShader — GpuTimer needs a real GPU). Confirmed on AMD 780M.
const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    // Headed watch: pin the window top-left so it can't open off-screen / get lost behind others.
    ...(HEADED ? ["--window-position=0,0"] : []),
  ],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

let result;
try {
  // "domcontentloaded", NOT "networkidle": the Next *dev* server keeps an HMR websocket open, so the
  // network never fully idles (slow/flaky wait). We wait for the app to boot via waitForFunction(
  // __shipwright) below anyway, which is the real readiness signal — networkidle was redundant.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // Headed watch: raise + focus the window so the run is visible immediately (Windows can otherwise
  // open it behind the active window). CDP Page.bringToFront activates the tab and raises the OS window.
  if (HEADED) await page.bringToFront();
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
  // Let the ripple texture load, Rapier init, physics settle, and the sky env-map bake.
  await page.waitForTimeout(3500);

  const hasGpu = await page.evaluate(() => window.__shipwright.hasGpuTimer());
  if (!hasGpu) {
    console.error(
      "ERROR: GpuTimer (EXT_disjoint_timer_query_webgl2) is unavailable — the GPU-ms metric\n" +
        "needs a real GPU. This launches ANGLE/D3D11; if you still see this, the browser fell\n" +
        "back to SwiftShader (no GPU) or the extension is blocked. Run on a machine with a GPU.",
    );
    await browser.close();
    process.exit(1);
  }

  // Headed watch: raise the window once more right before the flight, in case focus drifted during
  // the settle wait, so the run is on-screen and focused the moment it starts.
  if (HEADED) await page.bringToFront();
  // The flight runs inside the page's animation loop; runBenchmark resolves when it finishes.
  // A remount (hot reload) stops that loop → the promise never resolves → this timeout fires.
  result = await Promise.race([
    page.evaluate((cfg) => window.__shipwright.runBenchmark(cfg), config),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), TIMEOUT),
    ),
  ]);
} catch (err) {
  const why = err instanceof Error && err.message === "timeout" ? "timeout" : String(err);
  console.error(
    `ERROR: benchmark run did not complete (${why}).\n` +
      "If it timed out, the page likely reloaded mid-run (Fast Refresh / hot reload remounts the\n" +
      "scene). Point --url at a production build (next build && next start) or ensure no file edits\n" +
      "land during the run.",
  );
  if (errors.length) console.error("page errors:\n" + errors.slice(0, 8).join("\n"));
  await browser.close();
  process.exit(1);
}
await browser.close();

// --- report ----------------------------------------------------------------
const bySeg = new Map();
for (const s of result.samples) {
  if (!bySeg.has(s.seg)) bySeg.set(s.seg, []);
  bySeg.get(s.seg).push(s);
}

// Hardware label — the GPU (from the page's WebGL) + host CPU/OS/RAM (from Node). The GPU renderer
// string is the identifier that matters for cross-GPU comparison; the rest gives context (and the
// CPU matters for the physics/CPU-side numbers). This is WHY runs are worth comparing across boxes.
const hardware = {
  gpu: result.gpu.renderer,
  gpuVendor: result.gpu.vendor,
  cpu: os.cpus()[0]?.model ?? "unknown",
  cores: os.cpus().length,
  ramGB: Math.round(os.totalmem() / 1e9),
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  host: os.hostname(),
};

const report = {
  meta: {
    tool: "bench.mjs",
    sha: SHA,
    branch: BRANCH,
    url: URL,
    generatedAt: new Date().toISOString(),
    clock: result.realtime ? "real-time (headed)" : "fixed-dt (headless)",
    testMode: result.mode, // visuals | physics | both — which cost centre was exercised
    bodies: result.bodies, // physics bodies under load (0 in visuals mode)
    hardware,
    fixedDt: result.fixedDt,
    renderInfo: result.renderInfo, // main-pass draw calls + triangles + scene-graph size (thread 1 diag)
    gpuAvailable: result.gpuAvailable,
    render: result.render, // { width, height, pixelRatio, reflectionRes } — res dominates cost
    config,
    note: result.realtime
      ? "REAL-TIME (headed) run: numbers are felt-smoothness at wall-clock speed, NOT the deterministic A/B cost — don't compare to a headless run."
      : "FIXED-DT (headless) deterministic flight — the trustworthy A/B cost. GPU-ms is build-mode-independent (same GLSL); CPU-ms reflects the served build (dev inflates it).",
  },
  overall: summarise(result.samples),
  segments: result.segments.map((s) => ({
    name: s.name,
    description: s.description,
    measuredSeconds: s.measuredSeconds,
    ...summarise(bySeg.get(s.name) ?? []),
  })),
};

const slug =
  [
    config.renderScale !== undefined ? `rs${config.renderScale}` : null,
    config.reflectionRes !== undefined ? `rr${config.reflectionRes}` : null,
    config.water !== undefined ? config.water.toLowerCase().replace(/\s+/g, "-") : null,
    config.shading !== undefined && config.shading !== "full" ? config.shading : null,
    config.waterFx === false ? "fxoff" : null,
    config.ssrEnabled === false ? "ssr-off" : null,
    config.ssrMinFresnel !== undefined ? `cut${config.ssrMinFresnel}` : null,
    config.collisionEnabled === false ? "collision-off" : null,
    config.dragEnabled === false ? "drag-off" : null,
    config.quadSize !== undefined ? `q${config.quadSize}` : null,
    config.grade === false ? "grade-off" : null,
    config.shadows === false ? "shadows-off" : null,
    config.shadowCache === false ? "shadowcache-off" : null,
    config.cloudShadow === false ? "cloudshadow-off" : null,
    config.clouds !== undefined ? `cl-${config.clouds.toLowerCase().replace(/\s+/g, "-")}` : null,
    config.terrain === true ? "terrain" : null,
    config.buoys === false ? "buoys-off" : null,
    config.buoyLightsResident === true ? "buoylights-resident" : null,
    config.skyDome === false ? "skydome-off" : null,
    config.ssrSteps !== undefined ? `steps${config.ssrSteps}` : null,
    config.sampleIters !== undefined ? `iters${config.sampleIters}` : null,
    config.msaa === false ? "msaa-off" : null,
    config.captureScale !== undefined ? `cap${config.captureScale}` : null,
    config.composerSamples !== undefined ? `cs${config.composerSamples}` : null,
  ]
    .filter(Boolean)
    .join("-") || "default";
const OUTDIR = LABEL ? join(PROJECT_DIR, ".bench", LABEL) : join(PROJECT_DIR, ".bench");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only benchmark tool; the path is built from a hardcoded project dir + a slug derived from our own CLI args, never external input
mkdirSync(OUTDIR, { recursive: true });
// Prefix the filename with the host so runs from different machines/GPUs don't overwrite each other.
const hostSlug =
  os.hostname().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "host";
const outPath = join(OUTDIR, `${hostSlug}-${SHA}-${slug}.json`);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- see above; same controlled path
writeFileSync(outPath, JSON.stringify(report, null, 2));

// --- stdout summary --------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const r = report.meta.render;
console.log(`\nShipwright render-cost benchmark  (${SHA} on ${BRANCH})`);
console.log(`hardware: ${hardware.gpu}`);
console.log(`          ${hardware.cpu} (${hardware.cores} cores) · ${hardware.ramGB} GB · ${hardware.os} · ${hardware.host}`);
const testLabel = report.meta.bodies > 0 ? `${report.meta.testMode} (${report.meta.bodies} bodies)` : report.meta.testMode;
console.log(`clock: ${report.meta.clock}   test: ${testLabel}   render: ${r.width}×${r.height} (pixelRatio ${r.pixelRatio}, SSR ${r.reflectionRes}×)`);
console.log(`config: ${Object.keys(config).length ? JSON.stringify(config) : "scene defaults"}   url: ${URL}`);
const ri = result.renderInfo;
if (ri) console.log(`render census (main pass): ${ri.calls} draw calls · ${ri.triangles.toLocaleString()} tris · ${ri.sceneObjects} scene objects (${ri.visibleMeshes} visible meshes)`);
console.log(
  "\n" +
    pad("segment", 16) +
    padL("avgFPS", 8) +
    padL("1%low", 8) +
    padL("cloud50", 8) +
    padL("capt50", 8) +
    padL("ssr50", 8) +
    padL("main50", 8) +
    padL("tot50", 8) +
    padL("phys50", 8) +
    padL("tot95", 8) +
    padL("spikes", 8),
);
const row = (name, st) =>
  pad(name, 16) +
  padL(st.fps.avg, 8) +
  padL(st.fps.onePctLow, 8) +
  padL(st.ms.cloud.p50, 8) +
  padL(st.ms.capture.p50, 8) +
  padL(st.ms.ssr.p50, 8) +
  padL(st.ms.main.p50, 8) +
  padL(st.ms.total.p50, 8) +
  padL(st.ms.physics.p50, 8) +
  padL(st.ms.total.p95, 8) +
  padL(st.spikes.count, 8);
for (const seg of report.segments) console.log(row(seg.name, seg));
console.log("-".repeat(72));
console.log(row("OVERALL", report.overall));
console.log("\n(FPS from max(cpu incl. physics, gpu-total). ms = GPU per pass; phys = CPU physics step. 1%low = 99th-pct frame.)");

// --- CPU seam-timer split (thread 1) ---------------------------------------
// The render-prep breakdown: where the CPU frame time actually goes. All p50 CPU SUBMISSION ms.
// onFrm = cpuMs (ocean+capt+ssr+phys+misc, EXCLUDING the main render); main = the 2nd full-scene
// draw's submit (previously uncounted); total = onFrm + main (true per-frame CPU serial time).
console.log(
  "\nCPU seam split (p50 ms):\n" +
    pad("segment", 16) +
    padL("ocean", 7) +
    padL("buoys", 7) +
    padL("daylt", 7) +
    padL("capt", 7) +
    padL("ssr", 7) +
    padL("main", 7) +
    padL("phys", 7) +
    padL("onFrm", 7) +
    padL("total", 7),
);
const cpuRow = (name, st) =>
  pad(name, 16) +
  padL(st.ms.ocean.p50, 7) +
  padL(st.ms.buoys.p50, 7) +
  padL(st.ms.daylight.p50, 7) +
  padL(st.ms.captureCpu.p50, 7) +
  padL(st.ms.ssrCpu.p50, 7) +
  padL(st.ms.mainCpu.p50, 7) +
  padL(st.ms.physics.p50, 7) +
  padL(st.ms.cpu.p50, 7) +
  padL(st.ms.cpuTotal.p50, 7);
for (const seg of report.segments) console.log(cpuRow(seg.name, seg));
console.log("-".repeat(79));
console.log(cpuRow("OVERALL", report.overall));
console.log(
  "(ocean=Gerstner uniform update · buoys=nav-buoy particle-ride · daylt=daylight.update (shadow-frustum\n" +
    " re-anchor + cloud scroll) · capt/ssr/main=per-pass CPU submit · onFrm excludes main · total=onFrm+main)",
);
if (report.overall.ms.bare.p50 > 0) {
  console.log(
    `bare renderer.render() floor (empty scene, --bare-probe): p50 ${report.overall.ms.bare.p50} ms ` +
      `— the IRREDUCIBLE per-call cost (no draws, no target switch). 3 real calls/frame => ~${round(report.overall.ms.bare.p50 * 3, 1)} ms floor.`,
  );
}
// Physics-step split (thread 5) — only when a physics world ran (phys > 0).
if (report.overall.ms.physics.p50 > 0) {
  console.log(
    "\nPhysics step split (p50 ms, summed over substeps):\n" +
      pad("segment", 16) + padL("buoyancy", 10) + padL("solver", 10) + padL("phys", 10) + padL("other", 10),
  );
  const physRow = (name, st) => {
    const other = round(Math.max(0, st.ms.physics.p50 - st.ms.buoyancy.p50 - st.ms.solver.p50), 2);
    return pad(name, 16) + padL(st.ms.buoyancy.p50, 10) + padL(st.ms.solver.p50, 10) + padL(st.ms.physics.p50, 10) + padL(other, 10);
  };
  for (const seg of report.segments) console.log(physRow(seg.name, seg));
  console.log("-".repeat(72));
  console.log(physRow("OVERALL", report.overall));
  console.log("(buoyancy=per-voxel flood-fill+trapped-air force loop · solver=Rapier world.step · other=clamp+snapshot+interp)");
}
// The per-pass `ssr50` is the DEDICATED march pass ONLY — it does NOT include the cost SSR adds inside
// the `main` pass (sampling the reflection texture + occupancy), so it UNDER-reports SSR's true weight.
// For SSR's real frame share, diff a `--ssr off` run against the default (E6 measured ~37%, vs the ~25%
// this column implies). Don't read the isolated ssr50 as "SSR's total cost".
console.log("(ssr50 = the isolated SSR PASS; SSR's TRUE frame share is larger — use `--ssr off` to measure it. See docs/perf-experiments.md E6.)");
console.log(`wrote ${outPath}`);
if (errors.length) console.log("page errors:\n" + errors.slice(0, 8).join("\n"));
