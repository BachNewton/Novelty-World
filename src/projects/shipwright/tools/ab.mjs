// THE FAST A/B: one page, one warm session, interleaved runs, minutes not hours.
//
// The full benchmark flight is a 12-segment scenic tour — deliberately: it is ALSO the headed
// watch-mode an in-game player can fly, so a human can see that every measured frame depicts
// something reasonable. That makes it the wrong instrument for iterating on a perf change, twice
// over: a run pays a page load + terrain generation + shader warm-up per CONFIG, and two configs
// measured in different sessions sit in different thermal/DVFS regimes — the exact trap the perf
// docs document (a −36 % "finding" that evaporated when interleaved).
//
// This tool is the A/B instrument the docs' methodology actually calls for:
//   * ONE page load, then every run via `runBenchmark` in the same warm session;
//   * INTERLEAVED A→B→A→B→A, so drift shows up as disagreement between same-config runs
//     (reported as `±drift`) instead of masquerading as a finding;
//   * a SEGMENT SUBSET (`--segments`), because an A/B needs the cost archetypes it is probing,
//     not the tour. Defaults: down-calm (fill) · grazing-storm (SSR worst case) · island-approach
//     (opaque scene) · max-stress.
//
// Configs are the same JSON `runBenchmark` takes (see benchmark.ts BenchmarkConfig). Only RUNTIME
// knobs belong here — mount-time knobs (msaa, captureScale as a mount param) need a page reload and
// therefore the full bench.mjs.
//
// CONFIGS MUST NAME THE SAME KEYS, and the tool enforces it. `runBenchmark` applies only the keys a
// config carries and the page's state PERSISTS between runs — so `--a '{}' --b '{"merged":false}'`
// silently runs every A after the first with B's setting still applied, and the A/B measures nothing.
// Not hypothetical: this tool's first session did exactly that, read "merged ≈ 0" on a change the
// full flight had measured at −2.3 ms, and the contradiction got blamed on segment context before the
// state leak was found. The ±drift column is what caught it (the first, honest A disagreed with the
// contaminated later As by exactly the effect size) — read that column.
//
// Usage:
//   node src/projects/shipwright/tools/ab.mjs --b '{"merged":false}'
//   node src/projects/shipwright/tools/ab.mjs --a '{"quadSize":4.9}' --b '{"quadSize":40}' --passes 3
//   [--segments "down-calm,max-stress"] [--url U]
//
// A is the baseline (default {}); the report is B − A per segment, negative = B is cheaper.

import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);

const URL = args.url ?? "http://localhost:3001/3d-games/shipwright";
const A = JSON.parse(args.a ?? "{}");
const B = JSON.parse(args.b ?? "null");
if (B === null) {
  console.error('need --b \'{"…"}\' (a BenchmarkConfig JSON; --a defaults to {})');
  process.exit(1);
}
// Both configs must pin every key either one touches — see the header. Erroring beats guessing,
// because this tool cannot know a knob's default to restore it.
const asymmetric = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(
  (k) => !(k in A) || !(k in B),
);
if (asymmetric.length > 0) {
  console.error(
    `configs are asymmetric on: ${asymmetric.join(", ")}\n` +
      `runBenchmark state persists between runs in one session, so a key B sets and A omits stays\n` +
      `applied during A — set it EXPLICITLY in both (e.g. --a '{"merged":true}' --b '{"merged":false}').`,
  );
  process.exit(1);
}
const PASSES = Number(args.passes ?? 2);
const SEGMENTS = (args.segments ?? "down-calm,grazing-storm,island-approach,max-stress")
  .split(",")
  .map((s) => s.trim());

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__shipwright" in window, { timeout: 30000 });
  await page.waitForFunction(() => window.__shipwright.isReady(), { timeout: 30000 });
  if (!(await page.evaluate(() => window.__shipwright.hasGpuTimer()))) {
    console.error("no EXT_disjoint_timer_query — GPU-ms unavailable, aborting");
    process.exit(1);
  }
  await page.waitForTimeout(2000);

  const run = (config) =>
    page.evaluate((c) => window.__shipwright.runBenchmark(c), { ...config, segments: SEGMENTS });

  // A→B→A→B→…→A. Ends on A so every B run has an A neighbour on BOTH sides — drift between
  // neighbouring As bounds how much of any B−A delta could be the machine moving under us.
  const runsA = [];
  const runsB = [];
  const t0 = Date.now();
  for (let p = 0; p < PASSES; p++) {
    runsA.push(await run(A));
    runsB.push(await run(B));
  }
  runsA.push(await run(A));

  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  // runBenchmark resolves with RAW per-frame samples (bench.mjs owns the pretty aggregation);
  // the metric here is the p50 of each frame's summed per-pass GPU ms.
  const gpuTot = (result, name) => {
    const frames = result.samples.filter((s) => s.seg === name);
    if (frames.length === 0) return NaN;
    return med(frames.map((s) => s.cloud + s.capture + s.ssr + s.main));
  };

  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(
    `\nA/B — ${PASSES + 1}×A interleaved with ${PASSES}×B, one warm session, ` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s of runs\n  A = ${JSON.stringify(A)}\n  B = ${JSON.stringify(B)}\n`,
  );
  console.log(
    pad("segment", 18) + padL("A p50", 8) + padL("B p50", 8) + padL("B−A", 8) + padL("±drift(A)", 11),
  );
  console.log("-".repeat(53));
  let sumA = 0;
  let sumB = 0;
  let worstDrift = 0;
  for (const name of SEGMENTS) {
    const a = runsA.map((r) => gpuTot(r, name));
    const b = runsB.map((r) => gpuTot(r, name));
    if (a.some(Number.isNaN) || b.some(Number.isNaN)) {
      console.log(pad(name, 18) + "  — not in the flight (typo?)");
      continue;
    }
    const drift = Math.max(...a) - Math.min(...a);
    worstDrift = Math.max(worstDrift, drift);
    sumA += med(a);
    sumB += med(b);
    console.log(
      pad(name, 18) +
        padL(med(a).toFixed(2), 8) +
        padL(med(b).toFixed(2), 8) +
        padL((med(b) - med(a)).toFixed(2), 8) +
        padL(drift.toFixed(2), 11),
    );
  }
  console.log("-".repeat(53));
  console.log(
    pad("MEAN", 18) +
      padL((sumA / SEGMENTS.length).toFixed(2), 8) +
      padL((sumB / SEGMENTS.length).toFixed(2), 8) +
      padL(((sumB - sumA) / SEGMENTS.length).toFixed(2), 8),
  );
  console.log(
    `\n(GPU-ms p50 per segment. ±drift = spread across the ${PASSES + 1} A runs — any B−A smaller` +
      `\n than its row's drift is NOISE, not a finding. Runtime knobs only; mount-time knobs` +
      `\n (--msaa, --capture-scale-as-mount) need bench.mjs and a reload.)`,
  );
} finally {
  await browser.close();
}
