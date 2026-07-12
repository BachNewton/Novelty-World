// Profiles the LIVE game as it actually loads — not the benchmark's scene.
//
// WHY THIS EXISTS. `bench.mjs` flies a scripted flight through a scene it has deliberately stripped:
// the gameplay bodies are hidden (`physics.object.visible = false`), the archipelago is hidden, and it
// renders at pixelRatio 1. That makes it a good A/B instrument and a BAD model of the shipped frame.
// When the real game reads ~20 fps and the bench reads ~72, the bench is not wrong — it is answering a
// different question. This answers the shipped one: what does the frame the player actually gets cost,
// and where does it go?
//
// It measures the scene as `setupOceanScene` builds it, with nothing hidden and nothing overridden, at a
// real device pixel ratio — then subtracts one thing at a time to attribute the cost:
//
//   default        the frame the player gets
//   physics frozen the sim stops stepping (bodies still render) -> the CPU physics share
//   no islands     the archipelago hidden                       -> terrain's GPU share
//   no demos       the TEST_SHAPES buoyancy testbed hidden      -> what the DEBUG SCENE costs
//   bare           all of the above                             -> the floor: water + sky alone
//
// Real-time (wall-clock), not fixed-dt: this is the felt frame, so its FPS is the number that matters.
//
// Usage: node src/projects/shipwright/tools/profile-live.mjs [--url U] [--width W] [--height H] [--dpr N] [--seconds S]

import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const URL = args.url ?? "http://localhost:3001/3d-games/shipwright";
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const DPR = Number(args.dpr ?? 1);
const SECONDS = Number(args.seconds ?? 6);
// Pin the render scale (the GUI's "render scale" / device-pixel-ratio dial). Drop it to 0.5 and, if the
// frame does NOT get faster, the frame is not fill-bound — which is the whole diagnosis in one flag.
const RENDER_SCALE = args["render-scale"] !== undefined ? Number(args["render-scale"]) : null;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: DPR,
});

/** Sample real frame times + the per-pass GPU timer over `seconds` of the LIVE animation loop. */
const sample = async (seconds) =>
  page.evaluate(async (secs) => {
    const sw = window.__shipwright;
    const frames = [];
    const gpu = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        const g = sw.gpuTimings();
        if (g && g.total > 0) gpu.push(g);
        if (now - t0 >= secs * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Drop the first few frames: they carry the settle/compile hitches, not the steady state.
    const f = frames.slice(5).sort((a, b) => a - b);
    const med = (arr, k) => (arr.length ? arr[Math.floor(arr.length * k)] : 0);
    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
    const pick = (k) => gpu.map((x) => x[k]).sort((a, b) => a - b);
    return {
      fps: f.length ? 1000 / avg(f) : 0,
      frameP50: med(f, 0.5),
      frameP95: med(f, 0.95),
      gpu: {
        total: med(pick("total"), 0.5),
        main: med(pick("main"), 0.5),
        ssr: med(pick("ssr"), 0.5),
        capture: med(pick("capture"), 0.5),
        cloud: med(pick("cloud"), 0.5),
      },
    };
  }, seconds);

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  await page.waitForTimeout(4000); // Rapier init + the bodies settling + the PMREM bake

  if (RENDER_SCALE !== null) {
    await page.evaluate((r) => window.__shipwright.setRenderScale(r), RENDER_SCALE);
    await page.waitForTimeout(1500);
  }
  const info = await page.evaluate(() => ({ dpr: window.devicePixelRatio }));

  console.log(`\nLIVE game profile — ${URL}`);
  console.log(`viewport ${WIDTH}×${HEIGHT} · devicePixelRatio ${info.dpr}` + (RENDER_SCALE !== null ? ` · render scale FORCED to ${RENDER_SCALE}` : ""));
  console.log(`(real-time clock: this FPS is the FELT number, not a deterministic A/B)\n`);

  const rows = [];
  const run = async (label, patch) => {
    // Always start from the SHIPPED scene, then remove exactly one thing. Subtracting from a
    // progressively-stripped scene would attribute every saving to whatever happened to go last.
    await page.evaluate((p) => {
      const sw = window.__shipwright;
      const all = {};
      for (const k of sw.costKeys()) all[k] = true;
      sw.setCost({ ...all, ...p });
    }, patch);
    await page.waitForTimeout(1200);
    const s = await sample(SECONDS);
    rows.push({ label, ...s });
    return s;
  };

  // Each row removes ONE subsystem from the shipped scene. `base − row` is that subsystem's cost.
  const base = await run("— SHIPPED (nothing off) —", {});
  await run("water", { water: false });
  await run("sky dome", { skyDome: false });
  await run("sun shadows", { sunShadows: false });
  await run("archipelago (all)", { terrain: false });
  await run("↳ spruce only", { spruce: false });
  await run("nav buoys", { buoys: false });
  await run("demo bodies: DRAW", { demoBodies: false });
  await run("demo bodies: SIMULATE", { physicsStep: false });
  await run("EVERYTHING off", {
    water: false, skyDome: false, sunShadows: false, terrain: false,
    buoys: false, demoBodies: false, physicsStep: false,
  });

  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);

  // Report the GPU delta as the headline, not the wall-clock one. Wall-clock frame time in a REAL-TIME
  // loop is noisy (vsync quantisation, DVFS, the physics substep accumulator reacting to the very change
  // you are measuring), so its per-row deltas wobble by whole milliseconds. The GPU timer is measuring
  // the thing you actually removed. `bodies: SIMULATE` is the row where this inverts: it costs no GPU at
  // all, and its whole cost is in the frame column — which is the point.
  console.log(
    pad("switched OFF", 24) + padL("gpuTot", 8) + padL("ΔGPU", 8) + padL("share", 7) +
      padL("FPS", 6) + padL("frame", 8) + padL("Δframe", 9),
  );
  console.log("-".repeat(70));
  for (const r of rows) {
    const dg = r === rows[0] ? null : base.gpu.total - r.gpu.total;
    const df = r === rows[0] ? null : base.frameP50 - r.frameP50;
    const share = dg === null ? "" : `${((dg / base.gpu.total) * 100).toFixed(0)}%`;
    console.log(
      pad(r.label, 24) +
        padL(r.gpu.total.toFixed(1), 8) +
        padL(dg === null ? "" : dg.toFixed(1), 8) +
        padL(share, 7) +
        padL(r.fps.toFixed(0), 6) +
        padL(r.frameP50.toFixed(1), 8) +
        padL(df === null ? "" : df.toFixed(1), 9),
    );
  }
  const floor = rows[rows.length - 1].gpu.total;
  console.log("-".repeat(70));
  console.log(
    pad("FLOOR (everything off)", 24) + padL(floor.toFixed(1), 8) +
      "   <- what remains with an empty scene: the composer's HDR+MSAA target,",
  );
  console.log(pad("", 24) + padL("", 8) + "      the grade/output passes, and the capture pass itself.");
  console.log(
    [
      "",
      "(ΔGPU = GPU ms saved by removing JUST that thing from the SHIPPED scene — the pie slice.",
      " Slices need not sum to the total: they overlap, and the FLOOR above is paid no matter what.",
      " `bodies: SIMULATE` is CPU-only — read its Δframe, not its ΔGPU.",
      ' Every row is a switch you can flick live: Performance → "Scene cost (switch it off)".)',
    ].join("\n"),
  );
} finally {
  await browser.close();
}
