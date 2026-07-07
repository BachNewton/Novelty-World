# Shipwright Water — Performance

Read this before any rendering-cost / FPS work on the ocean, and **keep it updated**
as you learn more — it's the one place that drifts if perf work doesn't maintain it.
The blow-by-blow is in git history; this is the distilled, actionable version.

The ocean is the perf-dominant part of Shipwright: it shades most of the screen with a
screen-space composite (refraction + depth + reflection) plus a PBR lighting pass and a
separate reflection pass. Everything below is about that.

---

## TL;DR — the levers, in priority order

1. **Render scale** (top of the GUI). Global fill multiplier — cost scales with pixel
   count (≈ pixels²). The single biggest lever. Defaults to the device pixel ratio,
   which **supersamples** (e.g. 2× ratio = 4× the pixels), so this is often where the
   real cost is hiding.
2. **Reflection resolution** (Debug → "reflection res"). The SSR ray-march runs in its
   own low-res pass; this scales how many pixels march. ¼–½ res reads ~the same as full
   because the ripple distortion hides the softening. Big win, nearly free visually.
3. **SSR march cost** (Advanced → Reflection): `SSR_STEPS` (compile-time, ocean.ts),
   `max distance`, `cutoff (perf)`. The march is a per-pixel loop of dependent
   depth-buffer fetches — the most expensive single thing on a weak iGPU. `cutoff
   (perf)` (`uSsrMinFresnel`) is also the main lever on the **camera-angle spikes** —
   see the SSR notes under the performance model.
4. **Scene-capture resolution** (`sceneCapture.resolutionScale` in `shipwright.tsx`,
   now **1 / full res**). The colour+depth texture refraction/SSR *read from*. Purely a
   VRAM/bandwidth + underwater-clarity/edge-crispness dial; does **not** reduce the SSR
   march count — half-res was measured to save little compute, so it's back at full res
   for sharper refraction/depth and no silhouette edge-bleed. Drop it only to reclaim
   VRAM/bandwidth on a memory-starved GPU.
5. **Tessellation** (Debug → quad size / plane size). Vertex load. **Least impactful** —
   the ocean is not vertex-bound. Changing it barely moves FPS.
6. **Lighting model** (PBR vs the removed Phong). Coverage-dependent and small in real
   scenes — see "PBR vs Phong" below.

---

## The performance model — what's actually expensive

- **Fill / fragment-bound, and on a small-VRAM iGPU also bandwidth-bound.** The water
  shades the whole screen, so cost tracks pixel count, not vertices.
- **SSR (screen-space reflection) is the dominant cost center.** It ray-marches the
  depth buffer per water pixel — up to `SSR_STEPS` *dependent* texture fetches each.
  Dependent fetches are the worst case for a fetch-starved iGPU. Neutering SSR alone
  took a default frame from **~37 → ~100 FPS** (the whole investigation's headline).
  - **Confirmed by direct per-pass GPU timing** (the `GpuTimer` panel, not FPS
    inference). On **this dev machine's AMD 780M** (512 MB UMA — the worst-case target
    below), sunset default, measured 2026-07-07: `capture ≈ 0.9 ms`, **`ssr ≈ 4 ms`**,
    `main ≈ 2.75 ms`, `total ≈ 7.65 ms`. SSR is **~half the frame** and *larger than the
    full-res `main` pass*, despite running at half reflection res. The "SSR is the
    bottleneck" claim is now measured, not inferred.
  - **SSR cost swings hard with camera angle** — a grazing view (low camera looking
    across the sea) is several× more expensive than looking down. Two compounding
    causes, both peaking at grazing incidence: (1) the **Fresnel gate**
    (`uSsrMinFresnel`, the "cutoff (perf)" knob) discards near-head-on pixels *before*
    the march, but at grazing angles Fresnel is high so nearly every water pixel runs
    the full march; (2) grazing rays are long and mostly reflect *sky* (a miss), so
    they run all `SSR_STEPS` before giving up. **Budget for the grazing worst case, not
    the average**, and treat `cutoff (perf)` as the primary knob for shaving it.
- **Shader occupancy matters.** A big fragment shader (the SSR march inline) inflates
  register usage, which caps how many pixels the GPU shades in parallel — so the march
  code slowed *everything else in the same shader* even when it didn't run. Measured
  ~7.5 ms of frame time from the march just being *present*. Moving it to its own pass
  reclaimed that (~42 → ~65 FPS at full reflection res, before any resolution drop).
- **It is NOT vertex-bound.** Wireframe (fill removed) hits the refresh cap; flat-shaded
  full-screen water is far cheaper than lit; dropping tessellation ~does nothing.

---

## Architecture (for perf context — see ocean.ts / scene.ts for detail)

- **Water = patched `MeshStandardMaterial` (PBR)** + IBL from `scene.environment` (a
  PMREM bake of the `Sky`). Lighting is a `onBeforeCompile` patch: Gerstner vertex
  displacement + the fragment composite, on top of stock PBR.
- **Screen-space composite** (after `<tonemapping_fragment>`): refraction + Beer–Lambert
  depth absorption + reflection, all off one shared **scene capture** (colour+depth of
  everything-but-water, rendered each frame at full res).
- **SSR is a DEDICATED LOW-RES PASS, not inline.** A `ShaderMaterial` (`OCEAN_SSR_*`)
  renders the water *alone* (via a render layer, `SSR_LAYER`) into a fraction-res target
  (`ssrTarget`); the main water shader just samples that texture. This (a) reclaims the
  occupancy tax on the main shader and (b) makes SSR cost scale with the reflection-res
  dial instead of screen res.
- **Ripple distortion is applied at sample time.** The low-res reflection is computed on
  the *smooth* base surface; the main shader then offsets the sample UV by the full-res
  ripple normal map (`vRippleUv` / `uReflectRipple`). This restores the fine "normal-map
  blur" AND masks the low-res blockiness — the reason ¼-res reflections look fine. It's
  an *approximation* (perturbs the result, not the ray), the same trick refraction uses.

---

## Key findings (distilled)

- **SSR is the bottleneck**, not lighting, tessellation, or plane size. Confirm anything
  else against this first.
- **The low-res SSR pass is a two-part win:** occupancy reclaim (helps at *any*
  reflection res) + fewer marching pixels (the resolution dial). At the sunset default
  it took the frame comfortably to the refresh cap.
- **PBR vs Phong is coverage-dependent.** A Phong variant measured ~2× cheaper *per
  pixel* — but that only shows when water fills the screen in an otherwise-empty scene.
  In real, populated frames (geometry occupying the screen, the frame dominated by
  capture/SSR/other geometry) the difference vanishes into noise. We kept **PBR** for the
  better look (IBL ambient — the warm-sunset wash — + PMREM reflection). Phong lives in
  git history (around commit `7085226`) if a weak device ever needs it back as a tier.
- **Scene-capture res (0.5) did little for compute.** It saves capture VRAM/bandwidth and
  sets underwater clarity, but the SSR march runs per *output* pixel regardless.
- **Device context:** the constraint is a weak **AMD 780M iGPU** — small dedicated VRAM
  (~512 MB UMA) that spills to slow shared system RAM under load. A **Pixel 10 Pro XL**
  (tile-based deferred GPU + fast unified memory) runs the full thing smoothly; mobile
  TBDR is ideal for this fill/bandwidth workload, immediate-mode iGPUs are the worst case.
  More BIOS UMA would *not* have fixed the compute/ALU costs we found — measure, don't
  assume "it's memory."

---

## Measuring — read this or you'll be misled

- **vsync cap hides relative cost.** At the refresh cap (e.g. 100 FPS) two options both
  read 100 even if one is 2× the other. To compare, make the scene heavy enough to drop
  below the cap (or read ms/frame), then A/B.
- **DVFS / clock hysteresis makes fresh readings noisy.** The GPU ramps clocks up/down
  with a lag, so FPS right after a change reflects the *previous* load. Let each state
  **settle 2–3 s** before reading; treat everything as ±several FPS.
- **Isolate with the debug toggles (Debug + Advanced folders):**
  - `shading`: **full** (production PBR) / **flat** (unlit, same geometry → isolates raw
    fill from shading math) / **wireframe** (isolates fill itself).
  - `normal map`, `scene capture`, `water FX` toggles → subtract each subsystem.
  - `reflection res` slider → SSR pass cost.
  - `render scale` slider → the fill multiplier.
  - Advanced → Reflection: SSR `enabled`, `max distance`, `thickness`, `cutoff (perf)`,
    `ripple blur`.
- **Live per-pass GPU timing (`GpuTimer`) — built.** Enabled via `gpuStats` in
  `shipwright.tsx` (shared `src/shared/lib/three/gpu-timer.ts`). Shows real **GPU** ms
  per pass (`capture` / `ssr` / `main` / `total`) with a scrolling history graph — the
  direct read that sidesteps the vsync-cap + DVFS traps above. The header number is a
  smoothed average; the graph scales to the average so spikes clip (warm tint) instead
  of rescaling the axis. Reports `n/a` where `EXT_disjoint_timer_query` is unavailable
  (Safari, some mobile, headless SwiftShader). This is the live counterpart to the
  planned benchmark harness below.
- **Compile-time knobs:** `SSR_STEPS`, `SSR_REFINE` in `ocean.ts` (baked into the GLSL
  loop; changing them recompiles the shader).

---

## Tried and rejected / parked

- **Phong lighting** — cheaper BRDF, but negligible gain in real scenes and worse look.
  Removed; recoverable from git if a low-end tier is ever needed.
- **Dropping the short waves + faking them with the normal map** — looked worse (a
  repeating "river" of smooth swells).
- **Planar reflection** (three's `Water`/`Reflector`) — fundamentally incompatible with a
  vertex-displaced surface; SSR replaced it. (See CLAUDE.md "Water architecture".)

## Future perf levers (not yet done)

- **Camera-following LOD ocean** — the uniform tessellation grid wastes detail on far
  water. Replace with a high-density patch that travels with the camera + a coarse far
  plane. Do when the roaming/sailing camera lands, or if a device needs it.
- **Hi-Z / hierarchical SSR marching** — big strides through empty space via a depth
  mip-chain, instead of fixed small steps. Cuts per-march cost.
- **Auto quality tiers** — detect a weak GPU and default render scale / reflection res
  (and, if ever needed, a cheaper lighting tier) down.

---

## Planned: a repeatable perf-benchmark harness (not built yet)

A fixed, scripted workload that measures how a perf tweak actually moves the numbers, so this
doc's cost model is *measured*, not asserted. Sketch, for whoever picks it up:

- **Separate tool from `tools/shots.mjs`.** Shots want frozen, identical *pixels* (headless
  SwiftShader is fine). A benchmark wants *milliseconds under load* — an animated scene on a
  **real GPU**. Don't conflate them.
- **Must run on real hardware, not headless.** SwiftShader timings don't track real-GPU
  bottlenecks, and the `GpuTimer` (`EXT_disjoint_timer_query`) reports `n/a` under it. So this is
  an in-app "benchmark mode" run in a real browser (or Playwright launched *headed with GPU*).
- **Determinism via a scripted flight, not free-fly.** A fixed array of `(elapsed, cameraPose)`
  keyframes stepped at a fixed `dt`, rendering each frame. Gerstner is a pure function of `t` and
  physics is fixed-timestep, so the GPU does byte-identical work every run → an A/B diff reflects
  only the tweak, not timing noise. Drive it through the `window.__shipwright` debug surface
  (`setSun`/`setCamera`/`setSea`/`setPlaneSize`/freeze-step).
- **Stress the worst cases this doc names:** water filling the screen, a grazing→overhead sweep
  (varies fill *and* SSR hit-rate), rough seas (more normal variance), seabed on, max render
  scale, max SSR distance.
- **Output = JSON, not one number.** Per pass (`capture`/`ssr`/`main`/`total`) report **p50/p95/
  p99** (percentiles catch hitches averages hide), keyed by git SHA, so a pass's cost can be
  tracked across commits. This is the measured counterpart to the model above.
- **Optional:** Playwright `recordVideo` for a visual+overlay artifact (cosmetic — the numbers
  come from `GpuTimer`); and a regression gate (fail if p95 `total` rises >X% vs a stored baseline).
