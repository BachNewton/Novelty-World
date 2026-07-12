// HOW LOW CAN THE SCENE CAPTURE GO?
//
// Two different questions, and they have different answers:
//
//   1. Where do the MILLISECONDS stop coming? The capture is a full re-render of the scene, so its
//      RASTER cost falls with the square of the scale (0.5 = a quarter of the pixels). But its VERTEX
//      cost does not fall AT ALL — every triangle of the terrain, the spruce, the buoys and the sky is
//      still transformed, whatever resolution it is being rasterised into. So the pass asymptotes to the
//      scene's geometry cost and no lower. That floor is the real answer to "how low can we go": past
//      some point you are paying full price for a texture nobody can see.
//
//   2. Where does the IMAGE break? Not in the refraction — that is a warped lookup through a moving
//      surface, and it hides softness almost arbitrarily well. It breaks at SILHOUETTES and in DEPTH:
//      the waterline around a buoy stem, the shoreline where absorption is depth-driven, and SSR
//      reflections of thin objects, which march against this very texture. And it breaks IN MOTION
//      before it breaks in a screenshot — a low-res capture under moving waves swims.
//
// This measures (1) exactly, in one warm session, and shoots frames for (2) at a waterline close-up
// where the failure would show first.
//
// Usage: node src/projects/shipwright/tools/capture-curve.mjs
//        (frames land in <project>/.shots/capture-curve)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "..");
const OUT = join(PROJECT_DIR, ".shots", "capture-curve");
mkdirSync(OUT, { recursive: true });

const SCALES = [1, 0.75, 0.5, 0.35, 0.25, 0.15, 0.1];
const SHOOT_AT = new Set([1, 0.5, 0.25, 0.1]);

// THE STRESS FRAME. The capture is what you see THROUGH the water, so judging it in the shipped water
// type is rigging the test: the default is Jerlov Coastal 5 — Baltic green, ~3 m Secchi — which absorbs
// the refracted image almost immediately. Whatever the capture's resolution, there is nothing left to
// see. So test where the effect is strongest and the degradation has somewhere to show:
//
//   Oceanic I    the clearest water in the model (~40 m Secchi, tropical blue)
//   the seabed   the sandy slope that exists precisely as a Secchi gauge — it runs from the waterline
//                down to ~-48 m, so the refracted bottom fills the frame with real, high-frequency detail
//   a high sun   light reaching the bottom, so that detail is BRIGHT rather than lost in shadow
//   looking down so the water is between the eye and the sand across most of the image
//
// If halving the capture is invisible HERE, it is invisible anywhere the game will actually be played.
const SUN = [52, 150];
const FREEZE_T = 30.0;
const CAMERA = { pos: [0, 9, 46], target: [0, -6, 4] };
const WATER = "Oceanic I";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 2752, height: 1152 },
    deviceScaleFactor: 1.25,
  });
  await page.goto("http://localhost:3001/3d-games/shipwright", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
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
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  await page.waitForTimeout(4000);

  const sample = () =>
    page.evaluate(async () => {
      const sw = window.__shipwright;
      const g = [];
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const x = sw.gpuTimings();
          if (x && x.total > 0) g.push(x);
          if (performance.now() - t0 >= 4000) res();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const med = (k) => {
        const a = g.map((v) => v[k]).sort((x, y) => x - y);
        return a.length ? a[Math.floor(a.length / 2)] : 0;
      };
      return { total: med("total"), capture: med("capture"), ssr: med("ssr") };
    });

  // Freeze ONCE, and never resume. `freeze(t)` rewinds the wave clock but NOT the physics bodies — so
  // resuming between shots let the raft drift, and the first version of this tool produced an A/B whose
  // frames contained different scenes (the raft wandered into the low-res shot and not the high-res one).
  // A comparison is only a comparison if the ONLY thing that changed is the thing under test.
  // The scene still renders every frame while frozen, so cost is measurable here too — and it is more
  // deterministic than a moving sea, not less.
  await page.evaluate(
    ({ sun, t, cam, water }) => {
      const sw = window.__shipwright;
      sw.setWaterType(water); // the CLEAREST type — see the note on the stress frame
      // The seabed slope is the subject. The raft is hidden outright, which also makes the drift
      // impossible rather than merely unlikely.
      sw.setVisibility({ seabed: true, physics: false, pole: false, player: false });
      sw.setSun(sun[0], sun[1]);
      sw.setCamera(cam.pos, cam.target);
      sw.freeze(t);
    },
    { sun: SUN, t: FREEZE_T, cam: CAMERA, water: WATER },
  );
  await page.waitForTimeout(1200);

  const rows = [];
  const shots = new Map();
  for (const s of SCALES) {
    await page.evaluate((v) => window.__shipwright.setCaptureScale(v), s);
    await page.waitForTimeout(1500);
    rows.push({ scale: s, ...(await sample()) });

    if (SHOOT_AT.has(s)) {
      const start = await page.evaluate(() => window.__shipwright.frameCount());
      await page.waitForFunction((n) => window.__shipwright.frameCount() > n + 6, start, {
        timeout: 20000,
      });
      // Let Playwright write it: `screenshot` returns the buffer AND saves it, so the tool needs no
      // filesystem call of its own (and no dynamic path handed to `fs`).
      const png = await page.screenshot({
        type: "png",
        path: join(OUT, `capture-${String(s).replace(".", "_")}.png`),
      });
      shots.set(s, png.toString("base64"));
    }
  }

  // Quantify the image cost against the full-res reference, so the verdict is not only an eyeball.
  const diffPage = await browser.newPage();
  const diffs = new Map();
  for (const [s, b64] of shots) {
    if (s === 1) continue;
    diffs.set(
      s,
      await diffPage.evaluate(
        async ([refB64, tstB64]) => {
          const load = (b) =>
            new Promise((res) => {
              const im = new Image();
              im.onload = () => res(im);
              im.src = `data:image/png;base64,${b}`;
            });
          const [ia, ib] = await Promise.all([load(refB64), load(tstB64)]);
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
          let sum = 0;
          let max = 0;
          let over2 = 0;
          const n = w * h;
          for (let i = 0; i < n; i++) {
            const j = i * 4;
            const d = Math.max(
              Math.abs(A[j] - B[j]),
              Math.abs(A[j + 1] - B[j + 1]),
              Math.abs(A[j + 2] - B[j + 2]),
            );
            sum += d;
            if (d > max) max = d;
            if (d > 2) over2++;
          }
          return { mean: sum / n, max, pctOver2: (100 * over2) / n };
        },
        [shots.get(1), b64],
      ),
    );
  }
  await diffPage.close();

  const base = rows[0];
  const px = (s) => (2752 * 1.25 * s * (1152 * 1.25 * s)) / 1e6;
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(`\nSCENE-CAPTURE CURVE — 3440x1440, one warm session, STRESS FRAME (${WATER} + seabed)\n`);
  console.log(
    pad("scale", 7) + padL("Mpx", 7) + padL("capture", 9) + padL("ssr", 7) + padL("gpuTot", 8) +
      padL("saved", 8) + padL("+saved", 9) + padL("img mean", 10) + padL("img max", 9) + padL(">2/255", 9),
  );
  console.log("-".repeat(83));
  let prev = null;
  for (const r of rows) {
    const d = diffs.get(r.scale);
    console.log(
      pad(r.scale, 7) +
        padL(px(r.scale).toFixed(2), 7) +
        padL(r.capture.toFixed(2), 9) +
        padL(r.ssr.toFixed(2), 7) +
        padL(r.total.toFixed(1), 8) +
        padL((base.total - r.total).toFixed(1), 8) +
        padL(prev === null ? "—" : (prev.total - r.total).toFixed(1), 9) +
        padL(d ? d.mean.toFixed(2) : r.scale === 1 ? "ref" : "", 10) +
        padL(d ? d.max : "", 9) +
        padL(d ? `${d.pctOver2.toFixed(1)}%` : "", 9),
    );
    prev = r;
  }
  const last = rows[rows.length - 1];
  console.log("-".repeat(55));
  console.log(
    [
      "",
      `'+saved' is the MARGINAL gain of each step — the column that decides how low is worth going.`,
      `The capture cannot fall below the scene's VERTEX cost: at scale ${last.scale} it is rasterising`,
      `${px(last.scale).toFixed(2)} Mpx (${((px(last.scale) / px(1)) * 100).toFixed(1)}% of full) and still costs ${last.capture.toFixed(2)} ms — that residue is`,
      `transforming every triangle of terrain, spruce, buoys and sky into a texture nobody can see.`,
      `Which is the argument for deleting the pass outright (the merged scene pass), not shrinking it.`,
      "",
      `frames: ${OUT}`,
    ].join("\n"),
  );
} finally {
  await browser.close();
}
