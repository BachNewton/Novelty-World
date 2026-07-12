// What is the ACTUAL ceiling of an LOD ocean?
//
// The tempting experiment — drop plane size to 100 m and coarsen the quads — answers a different
// question. A 100 m plane takes the sea off most of the SCREEN, so it removes the water's FILL and
// SHADING cost as well as its vertices. An LOD ocean cannot do that: it still has to reach the horizon.
// All it can do is make the FAR water coarser. So it wins the vertex half and keeps the fill half.
//
// This holds the plane at its default 5000 m (so screen coverage, fill, SSR and the capture pass are all
// unchanged) and varies ONLY tessellation density. That isolates exactly the cost an LOD ocean can take.
//
//   default 4.9 m  -> what we ship
//   coarse  40 m   -> the vertex cost driven to ~zero, water still covering the screen
//                     == the CEILING of a perfect LOD ocean (it cannot beat a uniformly coarse grid)
//   water off      -> the floor: every water cost gone. LOD can never reach this.
//
// ANSWER (2026-07-12, 1920x1080): the ocean is almost PURELY vertex-bound. At quad 40 the `main` pass
// costs 3.9 ms — the SAME as with no ocean at all — so the water's per-pixel fill is ~0 and every
// millisecond of it is vertices. LOD ceiling: 7.6 ms of a 15.4 ms frame at DPR 1, 8.9 of 23.7 at DPR 1.5.
// The win is a roughly FIXED number of ms at any resolution (vertex work does not scale with pixels,
// fill does), so LOD's *share* of the frame shrinks as the render scale rises.
//
// Two things it cannot touch, and they are the floor of "there is a sea": the scene-capture pass (~3 ms,
// pinned across every quad size — which is also the control that says this measurement is honest, since
// it draws the scene WITHOUT the water and must not move) and the SSR march. Note SSR *does* fall with
// quad size (2.5 -> 0.8), because the SSR pass re-renders the ocean mesh: the vertex bill is paid twice.
//
// Usage: node src/projects/shipwright/tools/lod-ceiling.mjs [dpr]
import { chromium } from "playwright";

const URL = "http://localhost:3001/3d-games/shipwright";
const DPR = Number(process.argv[2] ?? 1);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: DPR,
});

const sample = (secs) =>
  page.evaluate(async (s) => {
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
        if (now - t0 >= s * 1000) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const med = (k) => {
      const a = gpu.map((x) => x[k]).sort((x, y) => x - y);
      return a.length ? a[Math.floor(a.length / 2)] : 0;
    };
    const f = frames.slice(5);
    return {
      fps: f.length ? 1000 / (f.reduce((a, b) => a + b, 0) / f.length) : 0,
      total: med("total"),
      main: med("main"),
      ssr: med("ssr"),
      capture: med("capture"),
    };
  }, secs);

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  await page.waitForTimeout(4000);

  const rows = [];
  const run = async (label, quad, water = true) => {
    await page.evaluate(
      ({ q, w }) => {
        const sw = window.__shipwright;
        const all = {};
        for (const k of sw.costKeys()) all[k] = true;
        sw.setCost({ ...all, water: w });
        sw.setPlaneSize(5000); // FIXED. The sea must still reach the horizon.
        sw.setQuadSize(q);
      },
      { q: quad, w: water },
    );
    await page.waitForTimeout(1800);
    rows.push({ label, ...(await sample(5)) });
  };

  for (const q of [4.9, 10, 20, 40]) await run(`quad ${q} m`, q);
  await run("water OFF", 4.9, false);

  const base = rows[0];
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(`\nLOD-OCEAN CEILING — plane FIXED at 5000 m, 1920x1080, DPR ${DPR}\n`);
  console.log(pad("config", 14) + padL("gpuTot", 8) + padL("main", 8) + padL("ssr", 7) + padL("capture", 9) + padL("ΔGPU", 8));
  console.log("-".repeat(54));
  for (const r of rows) {
    console.log(
      pad(r.label, 14) +
        padL(r.total.toFixed(1), 8) +
        padL(r.main.toFixed(1), 8) +
        padL(r.ssr.toFixed(1), 7) +
        padL(r.capture.toFixed(1), 9) +
        padL(r === base ? "" : (base.total - r.total).toFixed(1), 8),
    );
  }
  const coarse = rows.find((r) => r.label === "quad 40 m");
  const off = rows.find((r) => r.label === "water OFF");
  console.log(
    [
      "",
      `LOD ceiling  = ${(base.total - coarse.total).toFixed(1)} ms  (all vertex cost, water still full-screen)`,
      `water floor  = ${(base.total - off.total).toFixed(1)} ms  (everything the water costs — LOD cannot reach this)`,
      `irreducible  = ${(coarse.total - off.total).toFixed(1)} ms  (the water's FILL + shading + SSR + capture:`,
      "                        what is left when the geometry is free. Only a cheaper",
      "                        per-PIXEL water touches this — not LOD.)",
    ].join("\n"),
  );
} finally {
  await browser.close();
}
