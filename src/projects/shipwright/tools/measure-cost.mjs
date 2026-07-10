// Steady-state GPU-ms for the volumetric cloud pass via __shipwright.gpuTimings(). The pass draws in
// the MAIN render, so its cost shows in `main`/`total`. Full-res, per-frame — the UN-optimised cost.
import { chromium } from "playwright";

const URL = process.env.SHIPWRIGHT_URL ?? "http://localhost:3007/3d-games/shipwright";
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });

const cfg = (on, preset) => page.evaluate((c) => {
  const a = window.__shipwright;
  a.resume();
  a.setPlaneSize(5000);
  a.setVisibility({ physics: false, player: false, seabed: false, pole: false, island: false, rig: false });
  a.setVolumetricClouds(c.on, c.preset);
  a.setSun(30, 225);
  a.setCamera([-7, 3.2, 8], [3, 6.2, -7]); // up-tilt: sky fills ~2/3 (worst case for a sky pass)
}, { on, preset });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const measure = async (on, preset) => {
  await cfg(on, preset);
  await page.waitForTimeout(3000); // warm up: the disjoint timer's first reads are stale/huge
  const main = [], total = [];
  for (let i = 0; i < 40; i++) {
    const g = await page.evaluate(() => window.__shipwright.gpuTimings());
    if (g && g.total < 100) { main.push(g.main); total.push(g.total); } // drop obvious warmup spikes
    await page.waitForTimeout(90);
  }
  return { main: median(main), total: median(total), n: total.length };
};

const off = await measure(false);
const cum = await measure(true, "cumulus");
const storm = await measure(true, "storm");

const f = (x) => x.toFixed(2);
console.log("Steady-state GPU ms (median) — up-tilt, 1920x1080, full-res, per-frame:");
console.log(`  OFF      main ${f(off.main)}  total ${f(off.total)}  (n=${off.n})`);
console.log(`  CUMULUS  main ${f(cum.main)}  total ${f(cum.total)}  -> +${f(cum.total - off.total)} ms`);
console.log(`  STORM    main ${f(storm.main)} total ${f(storm.total)}  -> +${f(storm.total - off.total)} ms`);
await browser.close();
