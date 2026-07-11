// Proves the shadow-map CACHE is a pure optimisation: pixel-identical output, one third the redraws.
//
// WHY THIS EXISTS. three re-renders every shadow map inside every `renderer.render()` call unless
// `shadowMap.autoUpdate` is false. Shipwright renders the scene THREE times a frame (scene capture →
// SSR pass → main), so the sun's 2048² shadow map was being drawn 3× for one frame's worth of shadows.
// The scene now takes manual control and flags it once per frame (`Daylight.requestShadowUpdate`).
//
// That is only sound if nothing between a frame's passes can change what the shadow map should contain.
// Reasoning says nothing can (the light and the casters are posed before the first pass). But "reasoning
// says" is how you ship a subtly wrong shadow, so this asserts it on real pixels: render the same frozen
// frame under both regimes and require the PNGs to be byte-identical.
//
// It runs the frame that would break first if the reasoning were wrong — low sun over the archipelago,
// which is the scene's largest shadow caster and its most grazing shadow angle.
//
// Usage: node src/projects/shipwright/tools/verify-shadow-cache.mjs [--url U] [--keep]
//   --keep  write both PNGs to ../.shots/shadow-cache/ for eyeballing (they're identical when it passes)

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
const URL = args.url ?? "http://localhost:3001/3d-games/shipwright";
const KEEP = args.keep !== undefined;

// A frozen, deterministic frame: the wave field is a pure function of time, so freezing t makes the
// surface bit-identical between the two shots and any pixel difference is the shadow map alone.
const SUN = [12, 135]; // low — long, grazing shadows off the island, the worst case for a stale map
const FREEZE_T = 21.5;
const CAMERA = {
  pos: [-30, 14, -150],
  target: [-30, 2, -235], // the landfall island (peak ~(-30,-235), 13 m) — the biggest caster
};

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const shoot = async (shadowCache) => {
  await page.evaluate(
    ({ cache, sun, t, cam }) => {
      const sw = window.__shipwright;
      sw.setShadowCache(cache);
      sw.setTerrainVisible(true);
      sw.setSun(sun[0], sun[1]);
      sw.setCamera(cam.pos, cam.target);
      sw.freeze(t);
    },
    { cache: shadowCache, sun: SUN, t: FREEZE_T, cam: CAMERA },
  );
  // Wait for real rendered frames, not a guessed sleep — the PMREM re-bake and the first shadow redraw
  // both have to land before the pixels are final.
  const start = await page.evaluate(() => window.__shipwright.frameCount());
  await page.waitForFunction((n) => window.__shipwright.frameCount() > n + 6, start, { timeout: 15000 });
  return page.screenshot({ type: "png" });
};

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 20000 });

  // Hide the dev chrome, or the comparison is meaningless: the Stats.js panel paints a LIVE FPS counter
  // and graph, and the GPU-timer div a live ms readout — both land in `page.screenshot`, so two shots of
  // the same frozen scene would differ in those pixels alone. (This is exactly what the control caught.)
  // Same treatment shots.mjs uses; each is styled imperatively, so target them structurally.
  await page.addStyleTag({
    content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}",
  });
  await page.evaluate(() => {
    document.querySelectorAll("canvas").forEach((c) => {
      if (c.width <= 100 && c.parentElement) c.parentElement.style.display = "none"; // Stats.js
    });
    document.querySelectorAll("div").forEach((d) => {
      if (d.childElementCount === 0 && d.textContent?.startsWith("GPU ms")) d.style.display = "none";
    });
  });

  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 20000 });
  await page.waitForTimeout(2500); // ripple texture + env bake

  // CONTROL FIRST. "The two regimes differ" only means something if the SAME regime, shot twice,
  // agrees — otherwise the harness itself is nondeterministic and any verdict is noise. Shoot stock
  // twice and require a match before trusting the comparison below.
  const stock = await shoot(false);
  const stockAgain = await shoot(false);
  const cached = await shoot(true);

  const hash = (buf) => createHash("sha256").update(buf).digest("hex");
  const [hStock, hStockAgain, hCached] = [hash(stock), hash(stockAgain), hash(cached)];

  if (hStock !== hStockAgain) {
    console.error("\nINCONCLUSIVE — the control failed: the SAME configuration shot twice produced");
    console.error("different pixels, so this harness cannot decide anything about the shadow cache.");
    console.error("Fix the nondeterminism (a still-settling env bake, a scrolling texture) first.");
    console.error(`  stock #1: ${hStock.slice(0, 16)}`);
    console.error(`  stock #2: ${hStockAgain.slice(0, 16)}`);
    process.exitCode = 2;
  }

  if (KEEP) {
    const dir = join(PROJECT_DIR, ".shots", "shadow-cache");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "stock-3x-per-frame.png"), stock);
    writeFileSync(join(dir, "cached-1x-per-frame.png"), cached);
    console.log(`wrote both PNGs to ${dir}`);
  }

  console.log(`\nshadow map redrawn 3×/frame (three's default): ${hStock.slice(0, 16)}`);
  console.log(`shadow map redrawn 1×/frame (the cache)      : ${hCached.slice(0, 16)}`);
  if (hStock === hCached) {
    console.log("\nPASS — byte-identical. Caching the shadow map changes no pixels; the two extra");
    console.log("redraws per frame were pure waste.");
  } else {
    console.error("\nFAIL — the frames DIFFER. Something between the frame's passes changes what the");
    console.error("shadow map should hold, so it cannot be cached once per frame. Do NOT ship the cache.");
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
