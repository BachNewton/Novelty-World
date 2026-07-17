// Phase-2 verification: does the terrain worker bundle + run under the dev server,
// does the island land async, and is it pixel-identical to the sync path?
import { chromium } from "playwright";

const BASE = "http://localhost:3001/3d-games/shipwright";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

const shootIsland = async (url) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "warning" || m.type() === "error") warnings.push(m.text());
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  const tApi = Date.now() - t0;
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  const tReady = Date.now() - t0;
  const stats = await page.evaluate(() => window.__shipwright.terrainStats());
  await page.addStyleTag({
    content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}",
  });
  // Hide the live Stats/GPU-timer overlays — they animate, so they would diff between
  // shots (the same trap verify-merged-pass.mjs's control caught once).
  await page.evaluate(() => {
    document.querySelectorAll("canvas").forEach((c) => {
      if (c.width <= 100 && c.parentElement) c.parentElement.style.display = "none";
    });
    document.querySelectorAll("div").forEach((d) => {
      if (d.childElementCount === 0 && d.textContent?.startsWith("GPU ms")) d.style.display = "none";
    });
  });
  // Frame the island, freeze, shoot. State application is synchronous; the event a
  // screenshot needs is RENDERED FRAMES carrying that state — wait on frameCount, never
  // on a clock (an arbitrary sleep hides races and slows every run; repo CLAUDE.md).
  await page.evaluate(() => {
    const sw = window.__shipwright;
    sw.setVisibility({ physics: false, player: false, pole: false, seabed: false, island: true });
    sw.setTerrainVisible(true);
    sw.setSun(30, 135);
    sw.setCamera([-30, 25, -150], [100, 0, -140]);
    sw.freeze(12);
  });
  const start = await page.evaluate(() => window.__shipwright.frameCount());
  await page.waitForFunction((k) => window.__shipwright.frameCount() > k + 6, start, {
    timeout: 20000,
  });
  const png = await page.screenshot({ type: "png" });
  const control = await page.screenshot({ type: "png" });
  await page.close();
  return {
    png: png.toString("base64"),
    control: control.toString("base64"),
    stats,
    tApi,
    tReady,
    warnings,
  };
};

const worker = await shootIsland(BASE);
const sync = await shootIsland(`${BASE}?terrainWorker=off`);

console.log("worker path:", JSON.stringify({ ...worker.stats, tApi: worker.tApi, tReady: worker.tReady }));
console.log("sync   path:", JSON.stringify({ ...sync.stats, tApi: sync.tApi, tReady: sync.tReady }));
if (worker.warnings.length) console.log("worker-page console warnings:", worker.warnings);
if (sync.warnings.length) console.log("sync-page console warnings:", sync.warnings);

// Pixel diff in a fresh page (canvas decode).
const diffPage = await browser.newPage();
const diff = (a64, b64) =>
  diffPage.evaluate(
  async ([a64, b64]) => {
    const load = (b) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = `data:image/png;base64,${b}`;
      });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const w = ia.width;
    const h = ia.height;
    const grab = (im) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, w, h).data;
    };
    const A = grab(ia);
    const B = grab(ib);
    let max = 0;
    let sum = 0;
    let over2 = 0;
    for (let i = 0; i < w * h * 4; i += 4) {
      const dd = Math.max(
        Math.abs(A[i] - B[i]),
        Math.abs(A[i + 1] - B[i + 1]),
        Math.abs(A[i + 2] - B[i + 2]),
      );
      sum += dd;
      if (dd > max) max = dd;
      if (dd > 2) over2++;
    }
    return { mean: sum / (w * h), max, pctOver2: (100 * over2) / (w * h) };
  },
    [a64, b64],
  );

const controlA = await diff(worker.png, worker.control);
const controlB = await diff(sync.png, sync.control);
const d = await diff(worker.png, sync.png);
console.log("controls (same page twice):", JSON.stringify(controlA), JSON.stringify(controlB));
console.log("worker vs sync pixel diff:", JSON.stringify(d));
await browser.close();
if (controlA.max > 0 || controlB.max > 0) {
  console.error("INCONCLUSIVE: a frozen page shot twice gave different pixels — harness noise");
  process.exitCode = 1;
} else if (d.max > 2) {
  console.error("FAIL: worker and sync terrain differ");
  process.exitCode = 1;
} else {
  console.log("PASS: worker-generated island is pixel-identical to the sync path");
}
