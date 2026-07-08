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
  - **Could be live sliders (deferred — tools + approach in place).** To tune them at
    runtime against the `ssr` GpuTimer number — the way `reflection res` already is,
    which is especially useful at the grazing worst case — keep the loop bound at a
    compile-time *max* and `break` on a uniform (`if (i >= uSsrSteps) break;`) instead
    of baking the count. GLSL forbids a uniform loop *bound*, but a uniform `break` is
    fine, and because it's warp-coherent it's a faithful perf proxy: the cost *trend*
    matches a baked constant to within sub-%, with only a tiny fixed offset on the
    absolute ms (bake the chosen value to confirm the final number). Not built; pick it
    up if we want to dial these in by eye later.

---

## Thermal / power throttling + frame pacing (the "80 FPS but choppy" trap)

A plenty-high average FPS (~80) can still feel laggy — the cause is frame-time **variance**,
not the average. Two distinct culprits on the target **AMD 780M APU**:

- **APU throttling (thermal OR power).** The 780M shares one die, one power budget, and one
  cooler with the CPU. Under sustained load (physics + rendering) it heats up and clocks
  **down**, or the CPU (physics) eats the shared power budget (PPT) and starves the GPU's
  clocks. Either way FPS degrades over minutes.
  - **Confirm it — watch the GPU clock (MHz) during a dip:** clock **drops** on the dip →
    throttling; clock **pinned** but FPS still dips → a workload spike (grazing SSR), not
    throttle; clock **ramps up from cold** in the first seconds → just warm-up (harmless).
  - **Tools:** AMD **Adrenalin overlay** (`Alt+R` → Performance) shows GPU clock + temp + FPS,
    zero install. **GPU-Z** sensors → **"PerfCap Reason"** labels it `Thermal` / `Pwr` /
    `VRel`. **HWiNFO64** has explicit Thermal / PPT-limit flags. **Task Manager can't** show
    GPU clock (and usually not iGPU temp) — but its **CPU "Speed" (GHz)** sagging below base is
    a proxy, since the APU budget is shared.
  - **Cool-down test:** choppy after a while → close, let it cool ~5 min, reopen → smooth
    again then degrades → thermal, confirmed.
  - **Strongly suspected on this dev machine (2026-07-07):** FPS tracks how *hot* things have
    got, which tracks how long the demo's been under test — the classic thermal signature. Not
    yet pinned to the GPU-clock readout, but consistent with it. The FPS cap (below) is partly a
    mitigation for exactly this: less sustained load → cooler → clocks stay up.
  - **Mitigations:** cap FPS (below), drop render scale, physically improve cooling.

- **Frame pacing vs the refresh.** At a 100 Hz cap each frame has a 10 ms budget; a spike that
  overruns it misses the refresh and is delivered late — felt as a mouse hitch. A rock-solid
  **lower** framerate feels *smoother* than a jittery 80–100. Capping helps twice: more
  per-frame budget to absorb spikes, AND less sustained load → cooler → clocks stay up.
  - **Cap to a DIVISOR of the refresh.** On a 100 Hz display use **50** (every frame shown for
    exactly 2 refreshes → even cadence, 20 ms budget) — **NOT 60**, which doesn't divide 100
    and causes pulldown judder. Tradeoff: ~20 ms latency vs 10 ms.
  - **IMPLEMENTED as a vsync STRIDE, not a target FPS.** `ctx.setFrameStride(n)` in
    `src/shared/lib/three/use-three-scene.ts` renders 1 of every `n` rAF callbacks (a frame
    counter, even cadence); the Shipwright "fps cap" GUI exposes it as `Off / ½ / ⅓ / ¼ rate`.
    Why stride and not an FPS number: `setAnimationLoop` is vsync-locked by the browser, so the
    only achievable rates are **refresh ÷ n** anyway — a stride guarantees a clean divisor, where
    a raw ms/target-FPS cap lands on an ugly non-divisor (asking for 60 on a 100 Hz panel gave a
    ragged 45–50). And there's **no reliable way to read the true refresh** (a measured rAF
    cadence just reports the current *perf-limited* framerate, not the panel's Hz), so we can't
    honestly label the options in FPS — read the resulting number off the Stats panel instead.

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

## The benchmark harness (built) — `tools/bench.mjs`

Two instruments, one question each — keep them straight:

- **Fixed-dt benchmark (`tools/bench.mjs`) — how much does a render technique COST.** Built.
- **Real-time tool — how good does a render technique LOOK** (felt smoothness, thermal soak,
  natural-speed recording). NOT built; deferred. When built it reuses the *same* `benchmark.ts`
  `FLIGHT`, so the two share one camera path.

### What it is

A deterministic, **fixed-timestep** scripted flight through the scene's stressors, sampling
per-pass **GPU** time every frame on a **real GPU**. The flight lives in `benchmark.ts`
(`FLIGHT` = a list of segments, each a `(sea, sun, plane, camera(u))`); the driver is
`window.__shipwright.runBenchmark(config)` in `scene.ts` (it overrides the sim clock + camera
+ scene state each frame, runs the pre-passes, and reads `GpuTimer.values()`); the CLI is
`tools/bench.mjs` (Playwright launch + stats + JSON).

**Why fixed-dt, not real-time (wall-clock):** the sea (`f(t)`) and camera (`f(u)`) are pure
functions, so one fixed `dt` per rendered frame makes every run render a **byte-identical**
sequence → an A/B diff between two tweaks reflects only the tweak, not timing noise. This is
the dev/CI-regression convention. (A player-facing settings benchmark uses the real-time,
wall-clock convention — that's the deferred "does it LOOK good" tool, which is also where
screen recording belongs, because real-time = wall-clock plays back at natural speed with no
tricks. Recording a fixed-dt run would slow-mo on heavy frames, so this tool doesn't record.)

### Usage

```bash
# against a server running THIS checkout's code (NOT an unrelated :3001 dev server)
node src/projects/shipwright/tools/bench.mjs --url http://localhost:3005/3d-games/shipwright
# sweep a setting by invoking per-config and diffing the JSON:
node .../bench.mjs --reflection-res 0.25 --label before
node .../bench.mjs --reflection-res 0.5  --label after
# WATCH the exact run being measured (strongest verification — same frames that make the numbers):
node .../bench.mjs --headed --hold 3000
```

Config knobs (each applied once for the whole run; the flight sweeps sea/sun/camera itself):
`--render-scale`, `--reflection-res`, `--water`, plus `--url`, `--label`, `--timeout`, `--headed`,
`--hold`. Results land in `.bench/<label>/<sha>-<slug>.json` (gitignored) with a stdout summary
table; per **segment** and **overall** it reports min/max/avg + 1%-low **FPS**, per-pass
(`capture`/`ssr`/`main`/`total`) + frame **p50/p95/p99 ms**, and a **spike count** (frames >2× the
median). FPS = `1000 / max(cpuMs, gpuTotal)`.

### Traps it defends against (read before trusting a number)

- **Must be a real GPU.** It launches ANGLE/D3D11 and **aborts** if `GpuTimer`
  (`EXT_disjoint_timer_query`) is `n/a` (SwiftShader / blocked), rather than emit garbage.
- **GPU-ms is build-mode-independent; CPU-ms is not.** The SSR/water GLSL is identical whether
  Next serves a dev or prod bundle, so `ssr`/`main`/`capture`/`total` read the same on a dev
  server — that's why GPU-ms is the source of truth and a **dev server is fine for GPU-cost
  iteration**. The secondary `cpu` number is inflated by dev-mode JS; for clean CPU / final
  numbers, point `--url` at a **production build** (`next build && next start`).
- **Hot reload mid-run wrecks a run** (Fast Refresh remounts the three.js scene). The tool loads
  a fresh page per run, so the discipline is: edit → let the server recompile → *then* run; never
  edit while a run is in flight. If a remount happens the flight never completes and the tool
  **fails loud** with a timeout message (use a prod build to remove HMR entirely).
- **Warm-up + DVFS.** Each segment discards ~18 warmup frames (absorbs the `GpuTimer` async
  readback lag + one-off hitches: PMREM re-bake on a sun change, plane rebuild, raft respawn). The
  run is short, so it does **not** capture thermal droop — that's a real-time soak concern (above).

### Determinism + noise floor (measured 2026-07-08, AMD 780M)

The fixed-dt workload is byte-identical run-to-run — **verified**: three back-to-back warm headless
runs agreed on **p50** GPU-ms to ~1-3% (e.g. `max-stress` tot50 10.12 / 10.09 / 10.37). But
byte-identical *work* ≠ identical *time* on a DVFS/thermal APU, so mind these, or you'll chase ghosts:

- **Measure HEADLESS; `--headed` is watch-only.** Headed vs headless are different GPU paths and
  read ~2× apart (headed had a smaller effective viewport / on-screen path) — never compare across them.
- **Cold start skews the first run** (clocks ramp from idle). The **warm-up lap** (240 unmeasured
  frames of the heaviest scene, `WARMUP_LAP_FRAMES`) exists to absorb this so a fresh run reads like
  a warm one; even so, prefer running your A and B **back-to-back in one warm session**.
- **p50/avg are the trustworthy A/B metric (~3% noise floor); p95/p99/spikes are directional.** The
  tails catch real hitches but also random OS/GC blips (a warm run threw a lone 19 ms frame in
  `max-stress`). A tweak that moves p50 by <~3% needs interleaved A/B/A/B + averaging to trust.
- **Slow thermal creep** drifts p50 up a few % across successive runs — another reason to A/B
  back-to-back, and to treat the absolute numbers as session-relative, not cross-day comparable.

### The experiment suite

`docs/perf-experiments.md` is a ready-to-run set of sweeps (render scale, reflection res, SSR
steps/cutoff, SSR on/off, capture res, tessellation, MSAA, quality tiers) that turns *this doc's
asserted cost model into measured numbers*. Tier 1 runs today; the rest need a one-line knob
exposure each. Run the suite when there's time and fold the results back here.

### Cost-centre modes (`--mode`) — physics IS now measured

A frame has two cost centres — GPU (render) and CPU (physics). `--mode` isolates them:
**`visuals`** (default, render only, physics frozen — GPU cost), **`physics`** (step a
benchmark-OWNED Rapier world with the ocean hidden — isolate CPU physics via the `phys` column),
**`both`** (render AND step — the true combined frame). The bench physics world runs `BENCH_SHAPES`
(`bench-shapes.ts`, seeded from `TEST_SHAPES`) — separate from the live raft + sailor and `respawn()`
reset, so physics/both stay deterministic in headless mode (no sailor → no reset gap). See the Tier-4
experiments in `perf-experiments.md`.

**Scaling the load — `--bodies N`.** `physics`/`both` accept `--bodies N` to swap the demo set for a
fresh non-overlapping grid of N **buoyant hulls** (`benchShapesForCount`, cycled from the air-enclosing
demo shapes so every body exercises the flood-fill buoyancy, not just Rapier). Sweep it for the
object-count scaling curve (perf-experiments P3); `meta.bodies` records the count.

### The measurement principle — measure from the seams, systems stay ignorant

The benchmark must **not** become something every game system has to know about. Two mechanisms keep
it decoupled: (1) **coarse totals** (frame CPU total, GPU per-pass totals) are captured at the
harness/seam level with zero code in any system — this already catches CPU-vs-GPU and total
regressions for *any* future system; (2) **fine per-system attribution** is done by the *loop* that
already calls a system by name (or by a module self-reporting its own internal breakdown via a
getter) — never by a system reaching into the bench. Unattributed cost falls into an `other` bucket.
The eventual clean form is a tiny tick-registry at the orchestration layer that times what it ticks.

### Known gaps (fast-follows)

- **Buoyancy vs Rapier split (`phys` is two systems).** The `phys` number sums our per-voxel buoyancy
  (`applyBuoyancy`) and Rapier's `world.step` back-to-back in the fixed-step loop. Splitting them needs
  timers *inside* that loop — **deferred** until the in-progress buoyancy work lands (don't churn that
  loop now), then done as physics **self-reporting** its breakdown (a getter the bench reads at the
  seam, per the principle above). See perf-experiments P4.
- **`SSR_STEPS`/`SSR_REFINE` aren't runtime-swept** (still compile-time). Pair the benchmark with
  the uniform-`break` refactor (see the compile-time-knobs note above) to sweep them per run.
- **No regression gate yet.** JSON is keyed by git SHA; a gate (fail if p95 `total` rises >X% vs a
  stored baseline) is the natural next step.
