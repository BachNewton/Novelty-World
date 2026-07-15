// IS THE MERGED MAIN PASS THE SAME IMAGE?
//
// THE CLAIM. The merged main pass (scene.ts routeMainPass + present-pass.ts) draws the opaque scene
// ONCE — into the scene capture — and presents that capture through a fullscreen quad (tonemap + grade
// + depth), with only the water rendered on top. The classic path rasterises the whole scene a second
// time. Same camera, same materials, same lights, so the two must produce the same pixels, except:
//
//   * EDGES may legitimately differ. Classic: opaque geometry is antialiased by the backbuffer's MSAA.
//     Merged: opaque edges are baked into the (single-sample by default) capture, and only the water's
//     edges get the backbuffer MSAA. `--capture-samples 4`-style capture MSAA closes that gap.
//   * INTERIORS may differ by fp16 quantisation only: merged routes every opaque pixel through the
//     HalfFloat capture before the tonemap. That is a ≤1–3/255 effect, same class as the display-grade
//     move (docs/PERFORMANCE.md bug 3: interior mean 0.058/255 was accepted as "the same pixels").
//
// So this tool compares interiors and edges SEPARATELY, like the grade verification did — a single
// whole-frame diff would let real interior regressions hide behind legitimate edge noise. Two frames:
//
//   island   the verify-msaa frame — low sun, terrain + spruce silhouettes, open water, the horizon.
//            Exercises the presented opaque scene and the waterline against a shore.
//   seabed   the capture-curve stress frame — Oceanic I clarity over the sandy slope, high sun.
//            Exercises refraction/absorption identity: what you see THROUGH the water.
//
// Both paths are runtime (sw.setMergedPass), so this is ONE page, ONE frozen scene per frame — nothing
// changes between shots but the thing under test. A control shot guards the harness itself.
//
// Usage: node src/projects/shipwright/tools/verify-merged-pass.mjs [--url U]
//        (PNGs land in <project>/.shots/merged-pass)

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "..");
const OUT = join(PROJECT_DIR, ".shots", "merged-pass");
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const BASE = args.url ?? "http://localhost:3001/3d-games/shipwright";

const FRAMES = [
  {
    name: "island",
    sun: [12, 135],
    freezeT: 21.5,
    camera: { pos: [-30, 14, -150], target: [-30, 2, -235] },
    water: null, // scene default (Coastal 5)
    seabed: false,
    terrain: true,
  },
  {
    name: "seabed",
    sun: [52, 150],
    freezeT: 30.0,
    camera: { pos: [0, 9, 46], target: [0, -6, 4] },
    water: "Oceanic I",
    seabed: true,
    terrain: false,
  },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

// Diff two PNGs with the edge/interior split. Edges are detected on BOTH images and unioned — a
// sub-pixel feature (a spruce twig, the island rim) that the classic path's MSAA blurred to a soft
// smudge has almost no gradient in that image, but renders sharp in the single-sample merged capture;
// detecting on the reference alone mis-filed exactly those pixels as "interior". The mask is dilated
// so AA halos land on the edge side of the ledger. A heatmap PNG (diff > 2/255 in red over a dimmed
// reference) is written per comparison so the split can be checked by eye.
const diffPngs = async (page, refB64, tstB64) =>
  page.evaluate(
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
      const n = w * h;
      // Pass 1: mark contrast edges on BOTH images (see the note above the function).
      const edge = new Uint8Array(n);
      const mark = (D) => {
        const at = (x, y, c) => D[(y * w + x) * 4 + c];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            let g = 0;
            for (let c = 0; c < 3; c++) {
              g = Math.max(
                g,
                Math.abs(at(x + 1, y, c) - at(x - 1, y, c)),
                Math.abs(at(x, y + 1, c) - at(x, y - 1, c)),
              );
            }
            if (g > 16) edge[y * w + x] = 1;
          }
        }
      };
      mark(A);
      mark(B);
      // Pass 2: dilate twice, one pixel per round.
      let dil = edge;
      for (let round = 0; round < 2; round++) {
        const next = new Uint8Array(dil);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (dil[i - 1] || dil[i + 1] || dil[i - w] || dil[i + w]) next[i] = 1;
          }
        }
        dil = next;
      }
      // Pass 3: the split diff.
      const acc = {
        interior: { sum: 0, max: 0, over2: 0, count: 0 },
        edge: { sum: 0, max: 0, over2: 0, count: 0 },
      };
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const d = Math.max(
          Math.abs(A[j] - B[j]),
          Math.abs(A[j + 1] - B[j + 1]),
          Math.abs(A[j + 2] - B[j + 2]),
        );
        const bucket = dil[i] ? acc.edge : acc.interior;
        bucket.sum += d;
        bucket.count++;
        if (d > bucket.max) bucket.max = d;
        if (d > 2) bucket.over2++;
      }
      const fin = (b) => ({
        mean: b.sum / Math.max(b.count, 1),
        max: b.max,
        pctOver2: (100 * b.over2) / Math.max(b.count, 1),
        share: (100 * b.count) / n,
      });
      // The heatmap: dimmed reference, interior diffs >2 in solid red, edge-bucket diffs >2 in blue.
      const heat = document.createElement("canvas");
      heat.width = w;
      heat.height = h;
      const hx = heat.getContext("2d");
      const img = hx.createImageData(w, h);
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const d = Math.max(
          Math.abs(A[j] - B[j]),
          Math.abs(A[j + 1] - B[j + 1]),
          Math.abs(A[j + 2] - B[j + 2]),
        );
        if (d > 2) {
          img.data[j] = dil[i] ? 40 : 255;
          img.data[j + 1] = 40;
          img.data[j + 2] = dil[i] ? 255 : 40;
        } else {
          img.data[j] = A[j] / 3;
          img.data[j + 1] = A[j + 1] / 3;
          img.data[j + 2] = A[j + 2] / 3;
        }
        img.data[j + 3] = 255;
      }
      hx.putImageData(img, 0, 0);
      return {
        interior: fin(acc.interior),
        edge: fin(acc.edge),
        heatmap: heat.toDataURL("image/png").split(",")[1],
      };
    },
    [refB64, tstB64],
  );

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
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
  await page.waitForTimeout(2500);

  const shoot = async (name) => {
    const start = await page.evaluate(() => window.__shipwright.frameCount());
    await page.waitForFunction((k) => window.__shipwright.frameCount() > k + 6, start, {
      timeout: 20000,
    });
    const png = await page.screenshot({ type: "png", path: join(OUT, `${name}.png`) });
    return png.toString("base64");
  };

  const diffPage = await browser.newPage();
  let failed = false;

  for (const frame of FRAMES) {
    // Freeze ONCE per frame and never resume (freeze rewinds the wave clock, not the physics — see
    // capture-curve.mjs). The raft/player are hidden so nothing can drift between shots.
    await page.evaluate((f) => {
      const sw = window.__shipwright;
      if (f.water) sw.setWaterType(f.water);
      sw.setVisibility({
        physics: false,
        player: false,
        pole: false,
        seabed: f.seabed,
        island: f.terrain,
      });
      sw.setTerrainVisible(f.terrain);
      sw.setSun(f.sun[0], f.sun[1]);
      sw.setCamera(f.camera.pos, f.camera.target);
      sw.setCaptureSamples(0);
      sw.freeze(f.freezeT);
    }, frame);
    await page.waitForTimeout(1200);

    const set = async (merged, samples) => {
      await page.evaluate(
        ([m, s]) => {
          window.__shipwright.setMergedPass(m);
          window.__shipwright.setCaptureSamples(s);
        },
        [merged, samples],
      );
    };

    await set(false, 0);
    const off = await shoot(`${frame.name}-classic`);
    const offControl = await shoot(`${frame.name}-classic-control`);
    await set(true, 0);
    const on = await shoot(`${frame.name}-merged`);
    await set(true, 4);
    const onMsaa = await shoot(`${frame.name}-merged-msaa4`);
    await set(true, 0);

    // The control decides whether this harness can decide anything at all.
    const control = await diffPngs(diffPage, off, offControl);
    if (control.interior.max > 0 || control.edge.max > 0) {
      console.error(
        `\n${frame.name}: INCONCLUSIVE — the same frozen config shot twice gave different pixels ` +
          `(interior max ${control.interior.max}, edge max ${control.edge.max}).`,
      );
      failed = true;
      continue;
    }

    const dOn = await diffPngs(diffPage, off, on);
    const dMsaa = await diffPngs(diffPage, off, onMsaa);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool; path is the hardcoded OUT dir + a frame name from the hardcoded FRAMES list
    writeFileSync(join(OUT, `${frame.name}-heat-merged.png`), Buffer.from(dOn.heatmap, "base64"));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same controlled path
    writeFileSync(join(OUT, `${frame.name}-heat-msaa4.png`), Buffer.from(dMsaa.heatmap, "base64"));
    const row = (label, d) =>
      console.log(
        `  ${label.padEnd(22)} interior mean ${d.interior.mean.toFixed(3)} max ${String(d.interior.max).padStart(3)} ` +
          `>2/255 ${d.interior.pctOver2.toFixed(2)}%   |   edge mean ${d.edge.mean.toFixed(2)} max ${String(d.edge.max).padStart(3)}`,
      );
    console.log(
      `\n${frame.name} — interiors are ${dOn.interior.share.toFixed(1)}% of the frame (control: identical)`,
    );
    row("merged vs classic", dOn);
    row("merged+MSAA4 vs classic", dMsaa);

    // The bar: interiors within the fp16 round-trip the grade move already accepted (its verdict was
    // interior mean 0.058/255). Interior MAX is reported but NOT gated: dark-on-dark silhouettes
    // (spruce against spruce at dusk) have sRGB gradients below any usable edge threshold, so a
    // handful of genuine AA-provenance pixels always leak into the interior bucket — the heatmap is
    // the arbiter of whether the >2/255 pixels trace silhouettes (fine) or fill regions (a bug).
    // Edges are not gated at all — they are the AA question, a quality DECISION (capture MSAA on or
    // off), not an equivalence bug.
    if (dOn.interior.mean > 0.3 || dOn.interior.pctOver2 > 0.25) {
      console.error(
        `  FAIL — interiors moved more than fp16 quantisation can explain. That is a real ` +
          `difference in what was rendered (missing light? missing object? wrong tonemap path?). ` +
          `Look at ${frame.name}-heat-merged.png: region-filling red = the bug's footprint.`,
      );
      failed = true;
    } else {
      console.log(
        `  PASS — interiors match within fp16 quantisation` +
          (dOn.interior.pctOver2 > 0
            ? ` (${dOn.interior.pctOver2.toFixed(2)}% over 2/255 — confirm on the heatmap that they trace silhouettes)`
            : "") +
          `.`,
      );
    }
  }

  console.log(`\nframes: ${OUT}`);
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
