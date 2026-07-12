// Asks whether the WebGL context's MSAA (`antialias: true`) is doing ANY visible work.
//
// THE CLAIM. The shared hook routes the scene through an EffectComposer whenever bloom OR the display
// grade is on — and the grade is on by default. When it does, `RenderPass` draws the scene into the
// COMPOSER'S target (a HalfFloat target with its own `samples`), and the only thing ever drawn to the
// default framebuffer is the final fullscreen quad. MSAA antialiases geometry EDGES inside a draw; a
// fullscreen quad has no interior edges. So the context's multisampled backbuffer should be antialiasing
// nothing at all, while still costing a resolve every frame — measured at ~3 ms on the 780M, ~19% of the
// GPU frame.
//
// That is a chain of reasoning about someone else's renderer, which is exactly the kind of claim that is
// wrong 20% of the time. So this settles it on pixels: render the same frozen frame with the context's
// MSAA on and off and compare. If they are byte-identical, the MSAA is provably doing nothing and the
// ~3 ms is free to take. If they differ, it is antialiasing something real and the cost is a trade, not
// a bug -- and the diff tells you where.
//
// NB this is a DIFFERENT question from `--composer-samples`, which is the MSAA on the composer's own
// target. THAT one does antialias the scene, and dropping it is a genuine quality trade.
//
// Usage: node src/projects/shipwright/tools/verify-msaa.mjs [--url U] [--keep]

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "..");

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const BASE = args.url ?? "http://localhost:3005/3d-games/shipwright";
const KEEP = args.keep !== undefined;

// MSAA is baked into the WebGL context at creation, so it can only be switched by RELOADING the page
// with a different query param — not by a runtime setter. Hence two page loads rather than two shots.
//
// The frame is chosen to be the one MSAA would help most if it helped at all: a low sun puts long, hard,
// high-contrast SILHOUETTE edges across the frame (spruce against a bright sky, the island's rim against
// the water) — geometry edges are the only thing MSAA can smooth.
const SUN = [12, 135];
const FREEZE_T = 21.5;
const CAMERA = { pos: [-30, 14, -150], target: [-30, 2, -235] };

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

const shoot = async (url) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });
  // The dev chrome paints LIVE numbers (Stats FPS, the GPU-ms readout) straight into the screenshot —
  // leave them in and two shots of the same frozen scene differ in those pixels alone.
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
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(
    ({ sun, t, cam }) => {
      const sw = window.__shipwright;
      sw.setTerrainVisible(true);
      sw.setSun(sun[0], sun[1]);
      sw.setCamera(cam.pos, cam.target);
      sw.freeze(t);
    },
    { sun: SUN, t: FREEZE_T, cam: CAMERA },
  );
  const start = await page.evaluate(() => window.__shipwright.frameCount());
  await page.waitForFunction((n) => window.__shipwright.frameCount() > n + 6, start, { timeout: 15000 });
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
};

try {
  // Control first: the SAME url shot twice must agree, or this harness cannot decide anything.
  const onA = await shoot(`${BASE}?msaa=on`);
  const onB = await shoot(`${BASE}?msaa=on`);
  const off = await shoot(`${BASE}?msaa=off`);

  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const [hOnA, hOnB, hOff] = [hash(onA), hash(onB), hash(off)];

  if (KEEP) {
    const dir = join(PROJECT_DIR, ".shots", "msaa");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "msaa-on.png"), onA);
    writeFileSync(join(dir, "msaa-off.png"), off);
    console.log(`wrote both PNGs to ${dir}`);
  }

  if (hOnA !== hOnB) {
    console.error("\nINCONCLUSIVE — control failed: the same URL shot twice gave different pixels.");
    console.error(`  on #1: ${hOnA.slice(0, 16)}\n  on #2: ${hOnB.slice(0, 16)}`);
    process.exitCode = 2;
  } else {
    console.log(`\ncontext MSAA on  : ${hOnA.slice(0, 16)}  (control reproduced)`);
    console.log(`context MSAA off : ${hOff.slice(0, 16)}`);
    if (hOnA === hOff) {
      console.log("\nIDENTICAL — the context's MSAA antialiases NOTHING. With the composer active the");
      console.log("scene never draws to the default framebuffer, so the multisampled backbuffer only ever");
      console.log("resolves a fullscreen quad. Its cost is pure waste: turn `antialias` off.");
    } else {
      console.log("\nDIFFERENT — the context's MSAA is antialiasing something real, so its cost is a");
      console.log("quality TRADE, not free. Compare the PNGs (--keep) before touching it.");
    }
  }
} finally {
  await browser.close();
}
