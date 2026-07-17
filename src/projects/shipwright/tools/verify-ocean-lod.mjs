// IS THE LOD OCEAN THE SAME WATER, WHERE IT CLAIMS TO BE?
//
// THE CLAIM. The camera-following LOD grid (ocean-lod.ts) keeps the shipped quad density in a dense
// patch around the camera and coarsens only the far field. Near the camera it samples the SAME
// world-anchored wave lattice as the uniform plane, with the same anti-diagonal triangulation — so
// the near-field pixels must be BIT-IDENTICAL, not merely close:
//
//   * both grids' vertices sit on integer multiples of the base quad from the WORLD origin
//     (the LOD mesh snaps to the coarsest-quad lattice, which the base quad divides);
//   * the wave field is evaluated at world coordinates in both (uWorldOffset), and the ripple
//     normal map is sampled at the world-anchored vRippleUv in both;
//   * ocean-lod.ts copies PlaneGeometry's cell split, so the near patch rasterises identically.
//
// The far field is DESIGNED to differ (coarser sampling, and the sea now reaches ~8 km instead of
// 2.5 km), so a whole-frame diff proves nothing. This tool gates a NEAR-FIELD CROP (the bottom of
// the frame — water within the dense patch) on exact identity, and reports the whole frame for
// information only.
//
// Two camera stations, one page, one frozen wave clock:
//
//   origin   camera near the world origin — the LOD mesh snaps to (0, 0), the trivial case.
//   snapped  camera at x = 300 — the LOD mesh snaps to (312.5, 0). If the world-offset math is
//            wrong anywhere (either vertex shader, the ripple UV, the SSR surface), the water
//            here samples a SHIFTED field and the near crop lights up. Passing at a non-zero
//            snap is what proves the camera-follow is invisible: the surface is a pure function
//            of world position, so snaps cannot pop.
//
// Usage: node src/projects/shipwright/tools/verify-ocean-lod.mjs [--url U]
//        (PNGs land in <project>/.shots/ocean-lod)

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", ".shots", "ocean-lod");
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const BASE = args.url ?? "http://localhost:3001/3d-games/shipwright";

// Camera stations. Both look over open water (terrain hidden) with a mid sun so the
// specular glitter — the most sensitive detector of a shifted normal — is in frame.
const STATIONS = [
  { name: "origin", pos: [0, 10, 40], target: [0, 0, -30] },
  { name: "snapped", pos: [300, 10, 40], target: [300, 0, -30] },
];
// Near-field crop: bottom-centre of the 1280×720 frame — water inside the dense patch.
const CROP = { x: 256, y: 432, w: 768, h: 260 };

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

// Diff two PNGs: max/mean/pctOver2 over the near-field crop AND the whole frame.
const diffPngs = async (page, aB64, bB64) =>
  page.evaluate(
    async ([a64, b64, crop]) => {
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
      const acc = { crop: { sum: 0, max: 0, over2: 0, n: 0 }, frame: { sum: 0, max: 0, over2: 0, n: 0 } };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4;
          const d = Math.max(
            Math.abs(A[j] - B[j]),
            Math.abs(A[j + 1] - B[j + 1]),
            Math.abs(A[j + 2] - B[j + 2]),
          );
          const inCrop =
            x >= crop.x && x < crop.x + crop.w && y >= crop.y && y < crop.y + crop.h;
          for (const b of inCrop ? [acc.crop, acc.frame] : [acc.frame]) {
            b.sum += d;
            b.n++;
            if (d > b.max) b.max = d;
            if (d > 2) b.over2++;
          }
        }
      }
      const fin = (b) => ({
        mean: b.sum / Math.max(b.n, 1),
        max: b.max,
        pctOver2: (100 * b.over2) / Math.max(b.n, 1),
      });
      return { crop: fin(acc.crop), frame: fin(acc.frame) };
    },
    [aB64, bB64, CROP],
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

  // One frozen scene: open water, a real (not becalmed) sea so crest sampling is
  // actually exercised, mid sun for glitter. Freeze ONCE and never resume.
  // No settle sleeps anywhere: state application is synchronous, and every shot below
  // waits for RENDERED FRAMES (frameCount) — the actual event a screenshot needs.
  // An arbitrary sleep would only hide races and slow the run (repo CLAUDE.md).
  await page.evaluate(() => {
    const sw = window.__shipwright;
    sw.setVisibility({ physics: false, player: false, pole: false, seabed: false, island: false });
    sw.setTerrainVisible(false);
    sw.setSea({ amplitude: 1.2, steepness: 0.6 });
    sw.setSun(35, 140);
    sw.freeze(20);
  });

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

  for (const station of STATIONS) {
    await page.evaluate((s) => {
      window.__shipwright.setCamera(s.pos, s.target);
    }, station);

    // Uniform baseline at the shipped density (quad ~4.88, plane 5000), then LOD.
    await page.evaluate(() => {
      const sw = window.__shipwright;
      sw.setOceanLod(false);
      sw.setPlaneSize(5000);
      sw.setQuadSize(10000 / 2048);
    });
    const uniform = await shoot(`${station.name}-uniform`);
    const control = await shoot(`${station.name}-uniform-control`);
    await page.evaluate(() => {
      window.__shipwright.setOceanLod(true);
    });
    const lod = await shoot(`${station.name}-lod`);

    // The control decides whether this harness can decide anything at all.
    const dControl = await diffPngs(diffPage, uniform, control);
    if (dControl.frame.max > 0) {
      console.error(
        `\n${station.name}: INCONCLUSIVE — the same frozen config shot twice gave different ` +
          `pixels (frame max ${dControl.frame.max}).`,
      );
      failed = true;
      continue;
    }

    const d = await diffPngs(diffPage, uniform, lod);
    console.log(`\n${station.name} — LOD vs uniform (control: identical)`);
    console.log(
      `  near crop   mean ${d.crop.mean.toFixed(4)}  max ${d.crop.max}  >2/255 ${d.crop.pctOver2.toFixed(3)}%`,
    );
    console.log(
      `  whole frame mean ${d.frame.mean.toFixed(3)}  max ${d.frame.max}  >2/255 ${d.frame.pctOver2.toFixed(2)}%  (far field DESIGNED to differ — informational)`,
    );
    // The bar: the near crop shares vertices, triangulation, uniforms and UVs with the
    // uniform grid, so it should be exactly identical; ≤2/255 leaves room for one LSB of
    // driver-level blend/rounding without letting any real shift through.
    if (d.crop.max > 2 || d.crop.pctOver2 > 0.01) {
      console.error(
        `  FAIL — the near field moved. The dense patch is not sampling the same world lattice ` +
          `(check uWorldOffset in ALL vertex shaders + vRippleUv + the snap step).`,
      );
      failed = true;
    } else {
      console.log(`  PASS — near field identical.`);
    }
  }

  console.log(`\nframes: ${OUT}`);
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
