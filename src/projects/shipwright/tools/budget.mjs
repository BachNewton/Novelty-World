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
//   LOD ocean          STRUCTURAL, no quality cost. Proxied here by a uniformly coarse grid at a FIXED
//                      plane size — an LOD ocean cannot beat that, so it is the honest ceiling
//                      (tools/lod-ceiling.mjs). The ocean is ~purely vertex-bound.
//   capture scale      QUALITY TRADE, and a mild one: the capture is what the water REFRACTS. Refraction
//                      through a moving surface is already a blur, so softening its source is close to
//                      invisible. This is the cheap, today-available version of the next row.
//   merged scene pass  STRUCTURAL, no quality cost, NOT IMPLEMENTED — priced here, not measured. The
//                      scene is currently rasterised TWICE per frame: `renderPrePasses` draws it without
//                      the water into the capture target, then the main pass draws it again WITH the
//                      water. Every opaque triangle — terrain, spruce, buoys, raft, sky — is shaded
//                      twice. Draw the opaque scene ONCE into the capture (colour+depth), blit it to the
//                      framebuffer, then draw only the water on top, and the duplicate disappears. Its
//                      price is exactly the `capture` column, which is why that column is reported.
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

const measure = async (captureScale, quad) => {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: DPR,
  });
  await page.goto(`${BASE}?captureScale=${captureScale}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate((q) => {
    window.__shipwright.setPlaneSize(5000); // the sea must still reach the horizon
    window.__shipwright.setQuadSize(q);
  }, quad);
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
  await page.close();
  return r;
};

try {
  const rows = [];
  rows.push({ label: "SHIPPED today", ...(await measure(1, 4.9)) });
  rows.push({ label: "+ LOD ocean", ...(await measure(1, 40)) });
  rows.push({ label: "+ capture 0.5", ...(await measure(0.5, 40)) });
  rows.push({ label: "+ capture 0.25", ...(await measure(0.25, 40)) });

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
  const best = rows[rows.length - 1];
  console.log("-".repeat(74));
  console.log(
    [
      "",
      `MERGED SCENE PASS (not built): the scene is drawn TWICE — capture, then main. Draw the`,
      `opaque scene once and the duplicate is worth its whole 'capture' column.`,
      `  after LOD + capture 0.5 :  ${rows[2].total.toFixed(1)} ms  ->  ${(rows[2].total - rows[2].capture).toFixed(1)} ms  (${fps(rows[2].total - rows[2].capture).toFixed(0)} fps)`,
      "",
      `budget lines:  60 fps = 16.7 ms    100 fps = 10.0 ms    144 fps = 6.9 ms`,
      `(frame/real fps include CPU and are vsync-capped at 60 in headless — read the GPU columns.)`,
    ].join("\n"),
  );
} finally {
  await browser.close();
}
