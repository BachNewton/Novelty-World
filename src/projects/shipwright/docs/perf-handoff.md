# Shipwright Perf — Handoff (2026-07-08)

Pick-up point after the first full render-cost baseline + E6. **The data + analysis live in
[`perf-experiments.md`](./perf-experiments.md)** (measured tables, methodology findings). This doc is
the *state + what to do next*. Cost model background is in [`PERFORMANCE.md`](./PERFORMANCE.md).

## Where things stand

- **Baseline captured** (SHA `3ad3cea`, AMD 780M / Ryzen 7 7840U): Tier 0 census, E1 render-scale, E2
  reflection-res, E3 water, P3 body-count, native-res anchor, a spikes/smoothness pass, and **E6 (SSR
  on/off)**. 2 interleaved passes, agreed within 1–2% (no thermal drift). All in `perf-experiments.md`.
- **Committed this session:** the E6 knob (`--ssr off`), the GpuTimer stale-value fix, a bench-output
  caveat about the `ssr` column, and the results doc. The bench control API is **dev-only** again (the
  temporary `?bench` prod exposure was reverted — a dev server is verified sufficient).
- **Servers:** none left running. Start `npm run dev` (port 3001) to bench. No prod build needed.
- **`.bench/` data** from the baseline is gitignored but present locally under
  `src/projects/shipwright/.bench/` (label dirs: `census-*`, `e1-*`, `e2-*`, `e3-*`, `p3-*`, `native-*`,
  `e6-on`). Re-runnable any time.

## The five findings that matter (condensed)

1. **GPU cost is DVFS-sublinear in resolution** — 4× pixels ≈ 1.2× cost. 1600×900 under-loads the 780M
   (per-pixel numbers there can under-represent the boosted native-res game). Absolute ms still valid.
2. **SSR is ~37% of the average frame** (E6 on/off), NOT the ~25% the isolated `ssr` pass timer shows —
   the timer misses the SSR sampling cost inside the `main` pass. The old `PERFORMANCE.md` "SSR ≈ half"
   is vindicated. `main` is the largest single isolated pass; SSR is a co-equal true cost.
3. **SSR-off saves ~37% in calm/moderate views but ≈0 at grazing** — at grazing the env-map fallback is
   as expensive as the SSR march. The worst case is reflection-bound by *any* method; the lever for it
   is the **Fresnel cutoff** (E5), not on/off.
4. **The real combined frame is CPU-bound** (`both` mode: ~18 ms CPU vs ~10 ms GPU at 1600×900; ~41 fps
   at native res). Of the ~18 ms CPU, physics is ~6 ms (measured); the other ~12 ms is render-prep
   (Gerstner CPU field + ANGLE→D3D11 draw-call submission) — **not yet split** (see task B).
5. **Spikes: 1%low ≈ half the avg in every mode**, with a ~2–3% frame-hitch rate uniform across all
   segments → a per-frame-allocation / GC signature (a fixable *global* cause). See task A.

## Next actions (priority order, with concrete starting points)

### A. Kill the per-frame-allocation spikes  ← highest felt-quality win
- **Hypothesis:** steady per-frame allocation triggers periodic GC → the uniform ~2–3% spike rate.
- **Concrete suspects (already located):** `ocean.sampleSurface` allocates 1 `new THREE.Vector3`;
  `ocean.sampleParticle` allocates 2 (`ocean.ts` ~L799, L814–816). These run **per nav-buoy and per
  buoyancy sample-point, every frame** (nav-buoys sample in *all* modes → explains visuals-mode spikes
  too). Also the benchmark camera-pose helpers in `benchmark.ts` return fresh objects/arrays each frame
  (minor, bench-only).
- **Fix:** refactor the samplers to write into caller-provided scratch vectors (out-params) instead of
  allocating — standard three.js hot-loop hygiene. Audit `stepBenchmark`/`onFrame` and every `*.update`
  it calls for other per-frame `new`/array-literal churn.
- **Confirm:** a **headed** Chrome DevTools performance profile (JS flamechart + GC markers / heap
  sawtooth) before & after — some headless spikes may be GpuTimer-readback / rAF-pacing artifacts, not
  GC, so prove it with a real-time profile. `bench.mjs --headed` opens the visible window.

### B. CPU seam timers — split the ~12 ms render-prep
- Wrap `ocean.update` and `renderPrePasses` (and optionally `navBuoys.update`) in `performance.now()`
  spans in `scene.ts` `stepBenchmark`, self-report them alongside `physicsMs` in the sample, and add
  columns to `bench.mjs`. This is the doc's "measure from the seams" fast-follow — tells us
  draw-call-submission vs Gerstner-field, so CPU-side perf changes are measurable.

### C. E5 — Fresnel cutoff (`--ssr-cutoff`)  ← the grazing/worst-case + anti-spike lever
- Expose `uSsrMinFresnel` (`ocean.ts`, default 0.05) as a runtime setter + `--ssr-cutoff` flag,
  **mirroring exactly how E6 wired `--ssr off`** this session (see the E6 diff as the template:
  `ocean.setSsrEnabled`/`isSsrEnabled` + `config.ssrEnabled` in `scene.ts` + the `bench.mjs` flag).
- Sweep 0.02 / 0.05 / 0.1 / 0.2; record `grazing-storm` + `max-stress` `ssr` p50 **and p95** (it's the
  frame-variance lever). Note: the Fresnel *curve* is physics (Schlick); the *cutoff* is a picked
  perf/quality knob — this sweep finds its sweet spot.

### D. Lower priority
- **E4 SSR steps** — `SSR_STEPS=20` is a compile-time constant (`ocean.ts` L257); needs a runtime
  uniform-loop-break or rebuild-per-value. Lower value given E6.
- **Main-shader Tier-2** — since `main` is co-equal with SSR, measure PBR vs the parked Phong (git
  ~`7085226`) + the composite cost.
- **Reconcile `PERFORMANCE.md`** — it's mostly right (SSR claim vindicated); fold in DVFS-sublinearity,
  the CPU-bound real frame, and the spike/1%low reality.

## Gotchas discovered this session (don't rediscover them)

- **`GpuTimer.values()` carries the last per-span value forward** (for its panel), so a *skipped* span
  reports a stale reading. The benchmark now forces `ssr = 0` when SSR is off (`scene.ts`) — replicate
  that guard for any future "skip a pass" experiment.
- **Render-scale caps at 2×** (`maxPixelRatio`): `--render-scale 2.5`/`3.0` all render at 3200×1800. To
  exceed 5.76 MP, use a larger `--width`/`--height` viewport.
- **Bench control API is dev-only** (`window.__shipwright`, gated on `NODE_ENV !== "production"`). Bench
  against `npm run dev` (port 3001). A prod build will NOT expose it.
- **A/B'ing an engine change:** use two git **worktrees**, each running its own dev server on a
  different port (leave "A" untouched so it doesn't hot-reload while you edit "B")). Don't junction
  node_modules between worktrees.
- **Per-run wall-clock ≈ 2 min** for a visuals run (fixed-dt flight + async GPU-timer readback);
  physics runs are faster. A full sweep is ~1 hr — script it in the background.

## How to re-run

```bash
npm run dev                                    # port 3001; the bench API is dev-only
BASE=http://localhost:3001/3d-games/shipwright
node src/projects/shipwright/tools/bench.mjs --label census-vis  --url $BASE                 # visuals
node src/projects/shipwright/tools/bench.mjs --label e6-off --mode visuals --ssr off --url $BASE
# JSON lands in src/projects/shipwright/.bench/<label>/<host>-<sha>-<slug>.json — parse for tables.
```
Compare p50 (median); a delta < ~3% is noise. Diff a `--ssr off` run vs default for SSR's true share.
