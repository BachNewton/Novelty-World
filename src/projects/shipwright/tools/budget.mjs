// THE FRAME BUDGET: stack the levers, don't quote them one at a time.
//
// "LOD gets us to 43 fps and that is not a game" is the right complaint about the wrong question. No
// single lever ships this. The question is what the frame costs once the levers COMPOSE, and which of
// them are structural (they change what the renderer does) rather than a quality trade.
//
// Rows are CUMULATIVE — each one keeps everything above it. The budget lines are what matters:
//   60 fps = 16.7 ms      100 fps = 10.0 ms      144 fps = 6.9 ms
// (GPU-ms, so the vsync cap can't flatter the result. The frame also carries CPU; see the CPU column.)
//
// The levers, and which kind each one is:
//   merged scene pass  STRUCTURAL, no quality cost — BUILT (present-pass.ts + scene.ts routeMainPass)
//                      and measured here as a live A/B. The classic path rasterises the scene TWICE per
//                      frame: `renderPrePasses` draws it without the water into the capture target,
//                      then the main pass draws it all again WITH the water. Merged, the capture IS the
//                      frame (a fullscreen quad presents it) and the main pass draws only the water.
//                      The first row measures the OLD path so the delta to row two is the duplicate
//                      scene pass's real price.
//   capture MSAA       QUALITY DIAL of the merged pass: with the capture presented as the frame, opaque
//                      geometry's edge AA has to come from the capture target's own `samples` (the
//                      backbuffer's MSAA can no longer see those edges). This row prices restoring it.
//   LOD ocean          STRUCTURAL, no quality cost. Proxied here by a uniformly coarse grid at a FIXED
//                      plane size — an LOD ocean cannot beat that, so it is the honest ceiling
//                      (tools/lod-ceiling.mjs). The ocean is ~purely vertex-bound.
//   capture scale      QUALITY TRADE — and under the merged pass a BIGGER one than it was: the capture
//                      is now also the presented opaque image, so this behaves like a render scale that
//                      spares only the water. A low-end-tier knob, not a default.
//
// Usage: node src/projects/shipwright/tools/budget.mjs [dpr] [cssWidth] [cssHeight]
//
// Defaults reproduce the DEV MACHINE'S ACTUAL DISPLAY: a 3440x1440 ultrawide at 125% Windows scaling.
// That is a CSS viewport of 2752x1152 at devicePixelRatio 1.25, i.e. a 3440x1440 drawing buffer —
// 4.95 Mpx, and NATIVE PANEL RESOLUTION. Worth stating plainly, because it kills a lever: render scale
// 1.25 is not supersampling, it is 1:1. Dropping below it renders under-native and upscales, which is a
// visible softness, not a free win. The levers that remain have to be structural.
import { chromium } from "playwright";

const BASE = "http://localhost:3001/3d-games/shipwright";
const DPR = Number(process.argv[2] ?? 1.25);
const W = Number(process.argv[3] ?? 2752);
const H = Number(process.argv[4] ?? 1152);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

// ONE warm session for every row. Both dials are live now (`setQuadSize`, `setCaptureScale`), so nothing
// here reloads the page — and it should not: a reload re-JITs, re-compiles every shader and re-heats the
// GPU, which is precisely the cross-session drift that has faked a 36% "finding" in this project before.
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
});
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
await page.waitForTimeout(4000);

const measure = async (captureScale, quad, merged, captureSamples, lod = false) => {
  await page.evaluate(
    ({ q, c, m, s, l }) => {
      // LOD first: setPlaneSize/setQuadSize dispatch on it (LOD on ignores the plane size —
      // the rings set their own ~16 km reach; quad then means the near-patch density).
      window.__shipwright.setOceanLod(l);
      window.__shipwright.setPlaneSize(5000); // uniform path: the sea must still reach the horizon
      window.__shipwright.setQuadSize(q);
      window.__shipwright.setCaptureScale(c);
      window.__shipwright.setMergedPass(m);
      window.__shipwright.setCaptureSamples(s);
    },
    { q: quad, c: captureScale, m: merged, s: captureSamples, l: lod },
  );
  await page.waitForTimeout(1800);

  const r = await page.evaluate(async () => {
    const sw = window.__shipwright;
    const gpu = [];
    const frames = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((res) => {
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        const g = sw.gpuTimings();
        if (g && g.total > 0) gpu.push(g);
        if (now - t0 >= 5000) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const med = (k) => {
      const a = gpu.map((x) => x[k]).sort((x, y) => x - y);
      return a.length ? a[Math.floor(a.length / 2)] : 0;
    };
    const f = frames.slice(5).sort((a, b) => a - b);
    return {
      total: med("total"),
      main: med("main"),
      ssr: med("ssr"),
      capture: med("capture"),
      frame: f.length ? f[Math.floor(f.length / 2)] : 0,
    };
  });
  return r;
};

try {
  const rows = [];
  // The stack now builds toward the SHIPPED config: merged pass + the real LOD ocean (row 3 —
  // previously simulated with a uniform quad-40 plane), then the optional dials on top.
  rows.push({ label: "CLASSIC (2-pass)", ...(await measure(1, 4.9, false, 0)) });
  rows.push({ label: "MERGED main pass", ...(await measure(1, 4.9, true, 0)) });
  rows.push({ label: "+ LOD ocean", ...(await measure(1, 4.9, true, 0, true)) });
  rows.push({ label: "+ capture MSAA 4x", ...(await measure(1, 4.9, true, 4, true)) });
  rows.push({ label: "+ capture 0.5", ...(await measure(0.5, 4.9, true, 4, true)) });
  // Re-baseline: back to the first row's config at the END of the same warm session. If this does not
  // land on the first row, the machine drifted under us and the whole table is suspect.
  rows.push({ label: "= CLASSIC again", ...(await measure(1, 4.9, false, 0)) });

  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  const fps = (ms) => (ms > 0 ? 1000 / ms : 0);

  console.log(`\nFRAME BUDGET — ${W}x${H}, DPR ${DPR} (${((W * DPR * H * DPR) / 1e6).toFixed(1)} Mpx)\n`);
  console.log(
    pad("cumulative", 17) +
      padL("gpuTot", 8) +
      padL("GPU fps", 9) +
      padL("main", 7) +
      padL("capture", 9) +
      padL("ssr", 6) +
      padL("frame", 8) +
      padL("real fps", 10),
  );
  console.log("-".repeat(74));
  for (const r of rows) {
    console.log(
      pad(r.label, 17) +
        padL(r.total.toFixed(1), 8) +
        padL(fps(r.total).toFixed(0), 9) +
        padL(r.main.toFixed(1), 7) +
        padL(r.capture.toFixed(1), 9) +
        padL(r.ssr.toFixed(1), 6) +
        padL(r.frame.toFixed(1), 8) +
        padL(fps(r.frame).toFixed(0), 10),
    );
  }
  console.log("-".repeat(74));
  console.log(
    [
      "",
      `row 1 → row 2 is the duplicate scene pass's real price (the merged main pass is the shipped`,
      `default; row 1 measures the old path). Row 3 is the REAL camera-following LOD ocean (also`,
      `shipped-default). Row 4 prices restoring opaque-geometry AA via the capture target's own`,
      `MSAA — the backbuffer's MSAA cannot see edges baked into the capture.`,
      "",
      `budget lines:  60 fps = 16.7 ms    100 fps = 10.0 ms    144 fps = 6.9 ms`,
      `(frame/real fps include CPU and are vsync-capped at 60 in headless — read the GPU columns.)`,
    ].join("\n"),
  );
} finally {
  await browser.close();
}
