// STREAMING SANITY: does the tiled archipelago settle, at what budget, with no holes?
//
// Loads the live game, waits for isReady (near tiers), then for the FULL streaming radius to
// settle; reports tiles / vertices / per-tile generation time / GPU geometry census; shoots
// (a) an altitude view with `tint by LOD` on — the tier quadtree, promotions and any hole are
// directly visible in it — and (b) a deck-height view toward the horizon for the real look.
// Event-waited throughout (frameCount + streamStats), no sleeps (repo CLAUDE.md).
//
// Usage: node src/projects/shipwright/tools/verify-stream.mjs [--url U]
//        (PNGs land in <project>/.shots/stream)

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", ".shots", "stream");
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const BASE = args.url ?? "http://localhost:3001/3d-games/shipwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  const t0 = Date.now();
  // Mid-load frame: the pending-tile placeholders (blue queued / orange generating)
  // should be visible wherever land hasn't arrived yet. Event-gated on rendered frames
  // AND on the stream actually still having pending tiles (else the shot proves nothing).
  await page.waitForFunction(
    () => {
      const sw = window.__shipwright;
      const s = sw.streamStats();
      return sw.frameCount() > 5 && s !== null && s.tilesPending > 0;
    },
    { timeout: 20000 },
  );
  await page.screenshot({ type: "png", path: join(OUT, "loading.png") });
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 60000 });
  const tNear = Date.now() - t0;
  const nearStats = await page.evaluate(() => window.__shipwright.streamStats());

  // Full settle: pending drains to zero (the event is the stats themselves).
  await page.waitForFunction(
    () => {
      const s = window.__shipwright.streamStats();
      return s !== null && s.tilesPending === 0;
    },
    { timeout: 120000 },
  );
  const tFull = Date.now() - t0;
  const stats = await page.evaluate(() => window.__shipwright.streamStats());
  const memory = await page.evaluate(() => window.__shipwright.rendererMemory());
  const terrain = await page.evaluate(() => window.__shipwright.terrainStats());

  console.log(`near tiers ready: ${(tNear / 1000).toFixed(1)} s`, JSON.stringify(nearStats));
  console.log(`full settle:      ${(tFull / 1000).toFixed(1)} s`, JSON.stringify(stats));
  console.log("terrain census:", JSON.stringify(terrain));
  console.log("GPU memory census:", JSON.stringify(memory));

  // Pan away and back (the orbit-pan regression): vacated tiles hand their payloads to the
  // cache, so returning must re-attach from cache — near-instant — not requeue the worker.
  await page.evaluate(() => {
    window.__shipwright.setCamera([1970, 30, 60], [2000, 0, 0]);
  });
  await page.waitForFunction(() => window.__shipwright.streamStats().tilesPending === 0, {
    timeout: 120000,
  });
  await page.evaluate(() => {
    window.__shipwright.setCamera([-30, 30, 60], [0, 0, 0]);
  });
  // 3 rendered frames ≈ 50 ms: a worker round-trip for a vacated neighbourhood (~30 tiles ×
  // ~70 ms) cannot finish in that window, so near-zero pending here PROVES cache service.
  // A few tiles may legitimately regenerate (hysteresis shifts tier boundaries slightly on
  // the return pass), so the bar is "a handful", not zero.
  const backStart = await page.evaluate(() => window.__shipwright.frameCount());
  await page.waitForFunction((k) => window.__shipwright.frameCount() > k + 3, backStart, {
    timeout: 20000,
  });
  const backStats = await page.evaluate(() => window.__shipwright.streamStats());
  console.log("pan-return after 3 frames:", JSON.stringify(backStats));
  if (backStats.tilesPending > 8) {
    console.error(
      `FAIL — returning to a vacated area requeued ${backStats.tilesPending} tiles: the ` +
        `payload hand-back / cache path is not serving the return.`,
    );
    process.exitCode = 1;
  } else {
    console.log("PASS — the return was served from cache.");
  }
  await page.waitForFunction(() => window.__shipwright.streamStats().tilesPending === 0, {
    timeout: 120000,
  });

  await page.addStyleTag({
    content: ".lil-gui{display:none!important} nextjs-portal{display:none!important}",
  });
  const shoot = async (name) => {
    const start = await page.evaluate(() => window.__shipwright.frameCount());
    await page.waitForFunction((k) => window.__shipwright.frameCount() > k + 6, start, {
      timeout: 20000,
    });
    await page.screenshot({ type: "png", path: join(OUT, `${name}.png`) });
  };

  // (a) The quadtree tinted by tier, oblique from ~2.6 km up. NB `setCamera` routes through
  // OrbitControls (maxDistance clamps the camera toward the target — this framing sits inside
  // the 4 km limit). Tier bands recede from red (T0) at the pivot through the coarser colours;
  // holes would read as sea-through-land gaps at tier boundaries.
  await page.evaluate(() => {
    const sw = window.__shipwright;
    sw.setVisibility({ physics: false, player: false, pole: false, seabed: false, island: true });
    sw.setTerrainVisible(true);
    sw.setSun(50, 180);
    sw.setLandTint(true);
    sw.setCamera([-2400, 2600, 0], [0, 0, 0]);
    sw.freeze(10);
  });
  await shoot("tint-altitude");

  // (b) Deck height, toward the island chain — the real look, seams included.
  await page.evaluate(() => {
    const sw = window.__shipwright;
    sw.setLandTint(false);
    sw.setSun(25, 135);
    sw.setCamera([-40, 6, 60], [300, 0, -300]);
  });
  await shoot("deck-horizon");

  console.log(`frames: ${OUT}`);
} finally {
  await browser.close();
}
