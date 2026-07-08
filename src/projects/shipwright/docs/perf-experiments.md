# Shipwright Render-Cost Experiments

A runnable suite for `tools/bench.mjs` that turns `PERFORMANCE.md`'s **asserted** cost model
into **measured** numbers: how much does each rendering setting actually move per-pass GPU cost
on the target hardware (the AMD 780M). Run the whole thing when there's time; each experiment
stands alone. Fill in the results tables as you go — that becomes the measured cost model.

## Methodology — read before running (or the numbers lie)

Distilled from the determinism investigation (see `PERFORMANCE.md` → "Determinism + noise floor"):

- **Headless, warm GPU, back-to-back.** Measure with the default (headless = fixed-dt deterministic)
  mode. Headed numbers are a different GPU path and are NOT comparable. Warm the GPU first (the
  built-in warm-up lap does this) and run an A/B pair in one session.
- **Compare p50 (median) — the trustworthy metric; ~3% noise floor.** A delta under ~3% is noise;
  for small effects, interleave A/B/A/B and average. Treat p95/p99/spikes as directional (they catch
  real hitches AND random OS blips), except for E5 where spikes ARE the signal.
- **Read per-segment, not just overall.** The levers hit different segments differently — `render
  scale` scales everything (`down-calm`/`overhead-storm` = fill), SSR levers bite hardest at grazing
  (`grazing-storm`, `player-turn`, `max-stress`). The per-segment table is where the model lives.
- **Serve THIS checkout's code**, ideally a production build (`next build && next start`) for clean
  CPU-ms; a dev server is fine for GPU-ms as long as no edit lands mid-run.
- **Hardware travels with every run.** Each JSON stamps git SHA + resolution + config **and the
  hardware** — GPU (WebGL `UNMASKED_RENDERER`, e.g. `AMD Radeon 780M … D3D11`) + host CPU/OS/RAM —
  and the filename is host-prefixed, so the same sweep can be run on different GPUs and compared
  directly. Cross-GPU is a first-class axis: re-run any Tier-1 experiment on another machine to see
  how the cost model shifts with the hardware.

**Baseline** (every experiment diffs against this):
```
node src/projects/shipwright/tools/bench.mjs --label baseline --url http://localhost:3005/3d-games/shipwright
```

---

## Two lenses: systems and levers (both clocks have both)

To trace a cost, spike, or regression you need two lenses, and they cut across both clocks:

- **Systems** = the cost centres, the code that runs each frame (render passes, buoyancy, Rapier,
  ocean field…). This is the *what*.
- **Levers** = the knobs that flex a system's cost (render scale, reflection res, `--bodies`…). This
  is the *how much*.

Both the GPU and the CPU have systems **and** levers — but they lean opposite ways, which is why it's
tempting (wrongly) to equate GPU↔levers and CPU↔systems:

- The **GPU** is a *small, fixed set of systems* (three render passes) whose cost is dominated by
  **settings** → **lever-driven**. GPU tuning is mostly "which knob" (Tiers 1–2).
- The **CPU** is a *growing pile of systems* (buoyancy, Rapier, ocean field, buoys, player, and every
  future one) each adding load, with fewer knobs → **system-driven**. CPU tuning is mostly "which
  system" (Tier 0 census + Tier 4), though it still has levers — `--bodies` is a CPU load lever.

A frame runs both clocks overlapping, and **frame time ≈ max(CPU total, GPU total)** because they
pipeline. The map below is the *systems* lens (with each system's *levers* alongside); the census
(Tier 0) reads the systems, and Tiers 1–4 are the levers that flex them.

| System | Clock | Cost driver | Isolate | Flex with (levers) | Status |
|---|---|---|---|---|---|
| **Ocean render** (capture + SSR + main passes) | GPU | pixel count, SSR march, grazing angle | `--mode visuals` | render-scale (E1), reflection-res (E2), ssr-steps (E4), ssr-cutoff (E5), capture-scale (E7), tess (E8), MSAA (E9) | **measured** per-pass (`ssr`/`capture`/`main`) |
| **Buoyancy** (per-voxel flood-fill + trapped-air) | CPU | voxels, void/cavity cells, body count | `--mode physics` | `--bodies` (P3); future: voxel density, flood knobs | in `phys`; own column = P4 (deferred) |
| **Rapier solver** (`world.step`) | CPU | bodies, contacts | `--mode physics` | `--bodies` (P3) | in `phys`; own column = P4 (deferred) |
| **Ocean CPU field** (`sampleSurface`, Gerstner sum + Newton inversion) | CPU | sample count, wave count, iters | seam timer around `ocean.update` | wave count, sample density / tess (future knobs) | **deferred** (needs the seam span) |
| **Nav buoys** (kinematic particle-ride) | CPU | buoy count | seam timer around `navBuoys.update` | buoy count (future knob) | **deferred** |
| **Player controller** (dynamic-body sailor) | CPU | one body + its contacts | seam timer around the fixed-step callback | — (single body) | **deferred** (absent in the bench world) |
| **Frame / smoothness** | mixed | `max(CPU, GPU)` | any run | all of the above | **measured** (`avgFPS`/`1%low`/`spikes`) |

The deferred CPU rows all wait on the same thing: a per-system CPU span measured **at the seam** (the
loop times what it calls) or by a module **self-reporting** its own breakdown — never by a system
importing the bench (see `PERFORMANCE.md` → "measure from the seams"). Until then their cost hides
inside the frame CPU total; the census still bounds it (CPU total − physics = everything else).

**Update (2026-07-09): the seams are now instrumented** (see the session section below). The render-prep
split (`ocean`/`captureCpu`/`ssrCpu`/`mainCpu`) revealed the **Ocean CPU field is ~0 ms** (`ocean.update`
is 3 uniform writes; the census bound had over-attributed it), and the render CPU was ~all scene-graph
traversal. The physics step is split into **buoyancy vs Rapier solver**. Remaining deferred: nav-buoys
and the player controller (both small; absent or trivial in the bench world).

---

## 2026-07-09 session — render-prep RESOLVED + CPU seam timers + physics split

The big result of this session (full narrative in `perf-handoff.md`): **the "~16 ms render-prep"
that was the top open thread was scene-graph TRAVERSAL over ~12,800 hidden force-arrow debug nodes**,
not draw calls, pixels, or vertices. Fixed by building the arrow overlay lazily. New instruments +
knobs landed: CPU seam timers (`ocean`/`captureCpu`/`ssrCpu`/`mainCpu` + `mainRenderMs()` on the
shared hook), a physics-step split (`buoyancy`/`solver`), a **render census** (draw calls + triangles
+ **scene-graph node count**) in every run header, and diagnostic knobs `--quad-size` (E8),
`--gpu-timer off`, `--bare-probe`, `--ssr-cutoff` (E5).

**Isolation ladder that found it** (780M, `--mode visuals`, p50 render CPU = capt+ssr+main):
| probe | result | conclusion |
|---|---|---|
| render-scale 1.0→0.5 (¼ pixels) | 9.1 → 8.5 ms | NOT fragment/fill-bound |
| `--quad-size` 4.9→625 m (1 M→128 plane verts) | 8.8 → 9.2 ms | NOT vertex-bound (E8) |
| `--gpu-timer off` | 9.0 → 12.6 ms | NOT the timer (it's not inflating) |
| `--bare-probe` (empty `renderer.render`) | ~0 ms | per-call floor is the CONTENT, not fixed overhead |
| **render census** | 12,792 objects / **11 draw calls** | the graph is huge but draws are few → traversal |

**Lazy-arrows fix — before → after** (p50, headless):
| | scene objects | render CPU | total CPU | avgFPS |
|---|---|---|---|---|
| visuals | 12,792 → **72** | 9.0 → **0.8 ms** | 9.0 → **0.8** | → **109** |
| both/32 | 29,873 → **107** | 20.1 → **1.4 ms** | 30.1 → **9.9** | 44 → **100** |
GPU-ms is unchanged (the arrows never drew) — a pure CPU win. The interactive scene now hits the
60 fps vsync cap (was ~20–30). **Lesson: measure scene-graph node count, not just draw calls.**

**Physics step split** (`--mode physics`, p50 ms): buoyancy dominates, ~2.4× the Rapier solver, linear.
| bodies | buoyancy | solver | other | phys |
|---|---|---|---|---|
| 32 | **6.1 (67 %)** | 2.5 (27 %) | 0.5 | 9.1 |
| 64 | **11.6 (67 %)** | 4.6 (27 %) | 1.1 | 17.3 |
So greedy-meshing *colliders* (solver) is the smaller prize; the per-voxel buoyancy sample loop is the
lever. Allocation is NOT it (a `sampleHeight` that drops the discarded normal Vector3 left buoyancy
unchanged at 6.1 ms) — it's the Newton inversion + wave math.

**Within buoyancy** (`--drag off`, physics 32, back-to-back A/B): drag ON = 6.5 ms, OFF = 5.1 ms → the
**drag term + its 2 `sampleParticle` water-velocity evals is only ~1.4 ms (~22 %)**. The other **~78 %
is the buoyancy-height Newton inversion + the void-cell flood sampling + force math**. So the buoyancy
lever is the **height/void SAMPLE COUNT + Newton cost** (fewer sample points / cheaper height eval),
NOT the drag — an analytic water-velocity would recover only ~22 %.

**E5 SSR Fresnel cutoff** (`--ssr-cutoff`, visuals, SSR GPU-ms p50) — a **weak lever**:
| cutoff | grazing-storm | max-stress | overhead-storm |
|---|---|---|---|
| 0.02 | 2.60 | 3.32 | 1.61 |
| 0.05 (default) | 2.58 | 3.28 | 1.57 |
| 0.10 | 2.54 | 3.35 | 1.57 |
| 0.20 | 2.49 | 3.26 | 1.60 |
It discards near-head-on (low-Fresnel) pixels, but the costly ones are at grazing (high Fresnel, above
the cutoff), so it can't cut the worst case. reflection-res (E2) / ssr-steps (E4) are the real SSR knobs.

**Main-pass shading split** (`--shading`, visuals, GPU-ms p50, interleaved 0-spike full runs): the
**water's screen-space composite + PBR is the single biggest GPU cost**, bigger than the SSR pass.
| shading | main | capture | ssr | total |
|---|---|---|---|---|
| full (PBR + composite) | **6.3** | 0.8 | 2.4 | 9.5 |
| flat (unlit fill, same geometry) | 2.2 | 0.8 | 2.4 | 5.5 |
So the main pass = ~2.2 ms base fill + **~4.1 ms shading-math/composite** (refraction + Beer–Lambert +
Fresnel + SSR sampling + PBR). capture/ssr are shading-independent (unchanged) — the split is clean.
GPU-reduction priority is now: the **composite/PBR (~4.1 ms)** ≳ the SSR pass (2.4 ms) ≫ capture (0.8).
(wireframe is NOT a clean no-fill baseline — a 1 M-vertex plane draws ~2 M line segments, its own cost.)

---

## Tier 0 — the system census (run this first)

Three headless runs that snapshot **what each measurable system costs right now**, on this SHA +
hardware. This is the anchor every other tier refines; re-run it after any perf-relevant change.

```
node .../bench.mjs --mode visuals --label census-gpu    # ocean render, GPU per-pass (physics frozen)
node .../bench.mjs --mode physics --label census-cpu    # physics CPU cost (`phys`, ocean hidden → GPU ~0)
node .../bench.mjs --mode both    --label census-both    # the real combined frame
```

- **Read GPU vs CPU:** `census-gpu` gives the render's per-pass GPU ms; `census-cpu` gives the
  physics `phys` ms. `census-both`'s `tot50`/`avgFPS` shows which clock the real frame is bound by —
  if `both ≈ visuals` the frame is GPU-bound (physics is *free*, hiding under the render); if
  `both` rises over `visuals` by ~the physics cost, it's CPU-bound.
- **Bound the unmeasured systems:** in `census-cpu`, `phys` is buoyancy + Rapier; the rest of the CPU
  total (ocean field, buoys, render prep) is `cpu − phys`. That difference is the ceiling on the
  still-unattributed systems until the seam spans land.
- **Pick a realistic load:** re-run `census-cpu`/`census-both` with `--bodies N` set to a target
  build/fleet size (P3) so the census reflects real gameplay, not just the demo scene.

---

## Tier 1 — GPU render levers, runnable TODAY (no code changes)

### E1 — Render scale (the headline fill lever)
- **Hypothesis:** total cost ∝ pixel count (≈ scale²); it's fill-bound so every pass scales, `capture`
  + `main` most. This is the single biggest lever.
- **Sweep** `--render-scale` 0.5 / 0.75 / 1.0 / 1.25 / 1.5 / 2.0:
  ```
  for s in 0.5 0.75 1.0 1.25 1.5 2.0; do node .../bench.mjs --render-scale $s --label rs --url ...; done
  ```
- **Record:** overall + `max-stress` `tot50` vs scale; fit `tot ≈ a + b·scale²`.
- **Learn:** the true fill exponent, where the 780M crosses 60 fps, and the real cost of DPR
  supersampling (2.0 = 4× the pixels of 1.0).

### E2 — Reflection resolution (the SSR pixel-count dial)
- **Hypothesis:** `ssr` p50 ∝ reflectionRes² (marched pixels); other passes ~flat.
- **Sweep** `--reflection-res` 0.1 / 0.25 / 0.5 / 0.75 / 1.0.
- **Record:** `ssr` p50 per segment (grazing segments biggest) vs res. Separately, eyeball `--headed`
  at each to find the quality knee (the ripple distortion hides low-res, so it degrades gracefully).
- **Learn:** the SSR cost curve + the res where quality stops improving = the sweet spot (default is
  0.25).

### E3 — Water type / optics (is clarity free?)
- **Hypothesis:** negligible — same shader, different uniforms.
- **Sweep** `--water` "Oceanic I" / "Coastal 5" / "Coastal 9".
- **Learn:** confirm optics/clarity is perf-neutral now (matters once underwater effects land).

---

## Tier 2 — GPU render levers (need a small knob exposure first)

Each needs a one-line `window.__shipwright` setter + a `bench.mjs --flag` (mirror `setReflectionRes`
/ `--reflection-res`). Cheap; noted per item.

### E4 — SSR march steps (per-march cost)
- **Needs:** `SSR_STEPS` as a runtime uniform-`break` (the sketch is in `PERFORMANCE.md` → compile-time
  knobs) **or** rebuild per value; expose `--ssr-steps`.
- **Hypothesis:** `ssr` p50 ≈ linear in steps, slope steepest at grazing (`max-stress`, `player-turn`),
  where rays miss to sky and run the full count.
- **Sweep** 8 / 12 / 20 / 32 / 48.
- **Learn:** the steps ↔ quality ↔ cost trade; the fewest steps that still looks right at grazing.

### E5 — SSR Fresnel cutoff (the anti-SPIKE lever)
- **Needs:** expose `uSsrMinFresnel` as `--ssr-cutoff`.
- **Hypothesis:** a higher cutoff culls near-grazing pixels before the march → lower `ssr` p50 AND
  lower p95/spikes at grazing, trading grazing-reflection fidelity.
- **Sweep** 0.02 / 0.05 / 0.1 / 0.2.
- **Record:** `grazing-storm` + `max-stress` `ssr` p50 **and p95** — this is the frame-time-VARIANCE
  lever, so watch the tail, not just the median.

### E6 — SSR on/off (quantify "SSR is the bottleneck")
- **Needs:** expose `uSsrEnabled` as `--ssr off`.
- **Hypothesis:** disabling SSR drops total substantially (the doc's ~37→100 fps headline).
- **Learn:** SSR's exact share of the frame, per segment — the anchor for the whole cost model.

### E7 — Scene-capture resolution
- **Needs:** make `sceneCapture.resolutionScale` (currently fixed at mount in `shipwright.tsx`)
  runtime + `--capture-scale`.
- **Hypothesis:** `capture` p50 ∝ its res; `ssr`/`main` unaffected (the march runs per OUTPUT pixel).
  Confirms the doc's "capture res did little for compute".

### E8 — Tessellation (confirm it is NOT the bottleneck)
- **Needs:** expose plane/quad as `--plane` / `--quad` (or a dedicated segment).
- **Hypothesis:** near-flat — the ocean is fill-bound, not vertex-bound; changing it barely moves FPS.
- **Sweep** quad 2.5 / 5 / 10 / 20 m; plane 1000 / 5000 / 10000 m.

### E9 — MSAA on/off
- **Needs:** `antialias` is fixed at WebGL-context creation, so this is a two-run comparison against a
  build/flag that flips it, not a live toggle.
- **Hypothesis:** MSAA = a 4× framebuffer + a per-frame resolve, coverage/depth only (doesn't touch
  the SSR/water fragment) — small but measurable on the iGPU's bandwidth.

---

## Tier 3 — synthesis

### E10 — Quality tiers (Low / Med / High / Ultra)
Combine the winners from E1–E6 into presets and measure each tier's overall + `max-stress` cost, e.g.:

| tier | render-scale | reflection-res | ssr-steps | target |
|---|---|---|---|---|
| Low | 0.75 | 0.25 | 12 | weak iGPU ≥ 60 fps at max-stress |
| Med | 1.0 | 0.25 | 20 | default |
| High | 1.0 | 0.5 | 32 | strong GPU |
| Ultra | 1.5 | 1.0 | 48 | beauty shots |

**Output:** the auto-tier table — detect a weak GPU and default the render scale / reflection res
(the "auto quality tiers" future lever in `PERFORMANCE.md`).

### E11 — Thermal soak (needs the real-time soak mode — not built)
A long **real-time** run (the deferred `--soak` mode): watch for p50 creep + spike onset over minutes
= the throttle signature (`PERFORMANCE.md` → thermal/pacing). Complements the deterministic suite;
answers "does it stay smooth for 10 minutes", which fixed-dt can't.

---

## Tier 4 — physics / CPU (`--mode`)

The CPU-clock deep-dive behind the census (Tier 0). The benchmark steps its OWN Rapier world
(`BENCH_SHAPES`, seeded from `TEST_SHAPES`), separate from the live raft + sailor and reset to a known
spawn → deterministic. The `phys` column (CPU physics-step ms) is the metric here — today it sums the
**buoyancy** and **Rapier** systems (P4 splits them).

### P1 — Physics floor (physics-only)
- **Hypothesis:** `physics-only` (ocean hidden, passes skipped) reports the raw CPU cost of stepping
  the current buoyant/colliding body set — roughly flat across segments (physics cost barely depends
  on camera/sea).
- **Run:** `node .../bench.mjs --mode physics --label phys-floor`.
- **Learn:** the CPU floor the physics eats every frame today — the anchor for "how much headroom is
  left for rendering".

### P2 — The physics tax (visuals vs both)
- **Hypothesis:** `both` = `visuals` GPU cost + the physics CPU cost, and since they pipeline, the
  frame cost is ~`max(gpu, cpu+physics)` — so on a GPU-bound frame the physics may be *free*, and on a
  CPU-bound one it dominates. The delta tells you which.
- **Run:** `--mode visuals --label tax-v` then `--mode both --label tax-b`; diff `tot50`/avgFPS.
- **Learn:** whether the new stability-matrix bodies actually cost frame time, or hide under the GPU.

### P3 — Object-count scaling (`--bodies N`)
- **Hypothesis:** `phys` p50 grows with body/voxel count (buoyancy is per-voxel; collisions super-linear
  in contacts) — the curve that answers "how many objects before physics blows the frame budget".
- **Run:** `--mode physics --bodies N --label scale-N` for each N. The knob swaps the curated demo set
  for a fresh non-overlapping grid of N **buoyant hulls** (cycled from the air-enclosing demo shapes —
  boat/hulls/buckets/crown), so every added body genuinely exercises the flood-fill buoyancy rather
  than padding the count with solid plates. Body count is recorded in the JSON (`meta.bodies`).
- **Sweep:** N = 4 / 8 / 16 / 32 / 64.
- **Learn:** the shape of the curve (linear vs super-linear) and the N at which `phys` p50 crosses the
  frame budget — the object budget for a build/fleet before physics needs optimising.

### P4 — Buoyancy vs Rapier split (DEFERRED — needs the in-loop timers)
- **Idea:** the `phys` number is two systems in one — our per-voxel **buoyancy** (`applyBuoyancy`) and
  **Rapier**'s solver (`world.step`), back-to-back in the fixed-step loop. Timing each separately says
  which one to optimise (and how each scales with `--bodies N`).
- **Blocked on:** instrumenting inside `physics.ts`' step loop — deferred until the in-progress
  buoyancy work lands, then done as physics **self-reporting** its internal breakdown (a getter the
  bench reads at the seam), so no system couples to the benchmark. See PERFORMANCE.md known-gaps.

## Results — measured baseline (2026-07-08)

First full run of the runnable-today suite (Tiers 0, 1, 4). Every number below is the **median (p50)
of two interleaved passes** (~90 min apart); the two passes agreed to within ~1–2% everywhere, so
there is **no thermal drift** over the run and the p50s are highly reproducible.

- **Hardware:** AMD Radeon **780M** iGPU (ANGLE / D3D11) · Ryzen 7 **7840U** (16 threads) · Win11 ·
  the `desktop` host. *(This is the worst-case target — a small-VRAM immediate-mode iGPU. Re-run any
  Tier-1 experiment on another GPU to see the model shift; the JSON stamps the hardware.)*
- **SHA:** `3ad3cea` · **render:** 1600×900, pixelRatio 1, SSR 0.25× (bench defaults) · **water:**
  Coastal 5 · **clock:** fixed-dt headless.
- **Run against the dev server** (`npm run dev`, port 3001) — verified sufficient: dev vs prod agrees
  within the noise floor (finding #3), and GPU-ms is build-independent (identical GLSL). No production
  build is needed for the perf suite. *(This baseline was captured against a prod build during that
  verification, but the numbers are equivalent — use dev going forward.)*
- **A/B'ing an engine code change** (measuring the perf impact of an edit) is the one case that wants
  two *stable* servers side-by-side. A dev server hot-reloads as you edit, so it can't hold a fixed "A"
  baseline while you change code for "B". Cleanest: **two git worktrees, each running its own dev
  server** on a different port — leave worktree A untouched (old code) as the baseline, edit worktree B,
  and `--url` the bench at each. (See the worktree note in the repo memory; don't junction node_modules.)

### Methodology findings (read these first — they reframe the numbers)

1. **The 780M's GPU cost is strongly SUBLINEAR in resolution — a DVFS clock-boost signature, not
   `∝ pixels²`.** E1 (below): 4× the pixels (rs1.0→rs2.0, 1.44→5.76 MP) costs only **1.2×** more GPU
   time; per-megapixel cost drops ~8× from the lowest to the highest scale. This holds **per-segment**,
   even for a purely fill-bound down-look (overhead-storm main50: 3.0→3.9→6.9 ms for 16× the pixels).
   At a *constant* clock a fill pass must scale ~linearly with pixels; it doesn't → the GPU is raising
   its clock under load. **Consequence:** at the bench's 1600×900 the GPU sits in an *under-loaded*
   regime (high per-pixel cost, likely underclocked). This is the measured, reproducible part. The
   *link* to the eyeballed "~10% headless vs ~90% real game" Task-Manager reading is an **observation,
   not a proven fact** — that reading was noted informally and may have been taken partly during
   CPU-bound `--mode physics` runs (ocean hidden → GPU genuinely near-idle), so treat the exact
   percentages as illustrative. What the E1 numbers *do* prove: the **absolute** 1600×900 ms is valid
   and fast (~100 fps visuals), but a per-pixel A/B *delta* measured here can under-represent the
   boosted native-res game. For a settings knob whose
   value you'll ship, also spot-check it at native res (`--width 2752 --height 1152` or `--render-scale
   1.75+`), which sits in the boosted regime.
2. **p50 is trustworthy from run 1; warm-up lives in the TAIL.** The 4 s warm-up lap holds the median
   steady across back-to-back runs (0.4% spread). The *first* run's p95/spikes are worse (max-stress
   tot95 74→20→17 ms over runs 1→2→3) then settle. Compare p50; treat a cold run's spikes with
   suspicion.
3. **dev vs prod CPU is within the ~3% noise floor** (phys50 6.7 prod / 6.8 dev over 3 runs each). The
   physics hot loop is Rapier WASM + buoyancy JS, which V8 runs identically regardless of Next's
   dev/prod bundling; dev only inflates React/HMR/bundle overhead, not the measured fixed-step loop.
   GPU-ms is build-independent (identical GLSL). **→ the prod-build requirement can be dropped for
   iteration; a dev server is a valid target for the whole suite.**

### Tier 0 — system census

| run (`--mode`) | bodies | GPU tot50 | cpu50 | phys50 | frame tot50 | avgFPS | 1%low | bound by |
|---|---|---|---|---|---|---|---|---|
| visuals | 0 | 9.43 | 7.65 | — | 9.48 | 101 | 50 | **GPU** (frame ≈ gpu > cpu) |
| physics | 31 | 4.80 | 6.95 | 6.95 | 6.95 | 144 | 112 | **CPU / physics** (gpu hides under phys) |
| both | 31 | 10.19 | 18.25 | 6.15 | 18.45 | 49 | 21 | **CPU** (cpu ≫ gpu) |

- **The real combined frame (`both`) is CPU-bound at ~18 ms / ~49 fps**, and cpu50 (18.25) is *triple*
  phys50 (6.15) — so the CPU bottleneck is **render preparation**, not physics. Most of it is
  **ANGLE→D3D11 draw-call submission** for the capture pass (rendering the scene + 31 bodies), plus the
  Gerstner CPU field; physics is the smaller share. The GPU (10 ms) hides underneath. The real game
  runs the same ANGLE/D3D11 path in Chrome, so this is representative *at this resolution* — at native
  res the GPU rises (sublinearly, per finding #1) and the two clocks converge.
- `both` ≈ `visuals` + `physics` (near-additive, **not** `max()`): the CPU/GPU pipeline poorly here
  because physics + render-submit are serial on the JS main thread. `both` is also the spikiest run
  (53–84 spikes, tot95 ≈ 30 ms).
- `physics`-mode GPU is **not** 0 (4.8 ms): the 31 bench hulls still render even with the ocean hidden.

**Native-resolution anchor** (`--width 2752 --height 1152` = 3.17 MP, the primary display — the number
that actually matters for shipping):

| run | 1600×900 tot50 | 1600×900 avgFPS | native tot50 | native avgFPS | native max-stress fps |
|---|---|---|---|---|---|
| visuals | 9.43 | 101 | 10.33 | 90 | 65 |
| both (31 bodies) | 10.19 | 49 | 16.67 | 41 | 34 |

Confirms finding #1 at real resolution: 2.2× the pixels moves the *visuals* GPU frame only 9.4→10.3 ms
(the GPU boosts). But the *combined* frame stays **CPU-bound** (GPU 16.7 ms < CPU ~24 ms) at **~41 fps
overall / ~34 fps at max-stress** — the render-submit + physics main-thread cost, not the water shader,
caps the real game. GPU only overtakes CPU at still-higher resolutions. (Matches E1 rs1.5 @ 3.24 MP =
10.20 ms — a native viewport and pixelRatio supersampling cost the same per pixel, as expected.)

### Smoothness & spikes (the felt-quality signal — read alongside every avgFPS)

**avgFPS is only half the story: a high average full of spikes feels worse than a lower steady rate,
and every spike is a per-frame perf bug an average hides.** The bench captures the tail — `1%low` (the
99th-pct frame), frame p95/p99, and a **spike count** (frames > 2× the median). Foregrounding it:

- **The 1% low is ~45–51% of the average in EVERY mode** (visuals *and* both). At the visuals baseline,
  avg 101 fps but 1%low **51** (frame p50 9.5 ms → p99 **19.5 ms**). At native `both` b8, avg 76 but
  1%low **36**. Felt smoothness is roughly **half** the headline FPS — budget for the 1% low, not the avg.
- **A ~2–3% background frame-hitch rate, roughly UNIFORM across all 9 segments** (spike counts scale
  with each segment's frame count, not its load). A load-independent, reproducible (fixed-dt!) hitch
  rate points at a **periodic global cause — per-frame allocation / GC**, not any one shader. **This is
  the highest-value thing to chase:** hunt per-frame allocations in the frame loop (`onFrame`,
  `ocean.update`, physics step, the capture submit) and the spikes should drop across the board.
- **Camera rotation spikes:** `player-turn` (the 180°/360° turn segment) carries an elevated spike rate
  in every mode (8–9 spikes in its short 5.7 s window) — SSR temporal-coherence hitches on fast heading
  changes, a rendering-side cause on top of the background rate. `--ssr-cutoff` (E5, Tier 2) is the
  intended lever for it.
- **`both` roughly DOUBLES the spike count** vs visuals (53 vs 23 at 1600×900; 37→62 as native bodies
  go 8→32) — main-thread physics ↔ render-submit contention. The real gameplay frame is both slower
  *and* spikier than either clock alone.
- **Rare monster frames (100–118 ms)** show up ~once per run (worst-frame column) — likely one-off
  shader-compile / major-GC events; caught by `worstMs`, not the median.

Native-res `both` budget, tail-first (the numbers that decide how big a ship *feels* good to sail):

| bodies | avgFPS | **1%low** | 1%low ÷ avg | spikes | worst frame |
|---|---|---|---|---|---|
| 8 | 76 | **36** | 47% | 37 | 31 ms |
| 16 | 65 | **27** | 42% | 54 | — |
| 32 | 39 | **17** | 43% | 62 | 119 ms |
| 48 | 29 | **14** | 49% | 33 | — |

**Caveat + next step:** these are *headless fixed-dt* spikes — reproducible and directional, but they
mix true engine hitches with GpuTimer-readback / rAF-pacing artifacts (the doc's determinism note). The
**definitive felt-smoothness instrument is the `--headed` real-time run** (real frame pacing; its FPS
*is* the felt signal) and the deferred **`--soak`** mode (E11) for spike *onset* over minutes. Run
`--headed` on the worst cases above (native `both`, high bodies, `player-turn`) to confirm which spikes
a player would actually feel before optimising — but the per-frame-allocation hunt is worth starting on
the headless signal alone.

### Tier 1 — E1 render-scale (visuals)

| setting | MP | overall tot50 | ssr50 | capture50 | main50 | max-stress tot50 | avgFPS | Δ vs baseline |
|---|---|---|---|---|---|---|---|---|
| rs0.5 | 0.36 | 5.80 | 1.82 | 0.24 | 3.71 | 11.03 | 125 | −38% |
| rs0.75 | 0.81 | 7.18 | 1.92 | 0.47 | 4.73 | 10.84 | 125 | −24% |
| **rs1.0 (baseline)** | 1.44 | **9.41** | 2.41 | 0.79 | 6.10 | 10.86 | 104 | — |
| rs1.25 | 2.25 | 10.27 | 2.40 | 1.11 | 6.67 | 11.93 | 96 | +9% |
| rs1.5 | 3.24 | 10.20 | 2.22 | 1.31 | 6.49 | 13.71 | 89 | +8% |
| rs2.0 | 5.76 | 11.26 | 2.23 | 1.47 | 7.44 | 17.84 | 79 | +20% |

- **Not `∝ scale²` — strongly sublinear** (finding #1). The fill passes (capture+main) plateau: main
  barely grows 6.1→7.4 ms for 4× the pixels. **SSR is flat** across render-scale (~2.2–2.4) because it
  runs in its own reflection-res-pinned low-res pass — render-scale doesn't touch it (as designed).
- **max-stress is the exception that proves fill isn't the worst case:** its tot50 is ~flat 10.8–11 ms
  from rs0.5→rs1.0 then climbs (→17.8 at rs2.0). The worst-case segment is dominated by *scale-invariant*
  cost (grazing SSR march on the wide 10 km plane), not fill.
- **The render-scale lever caps at 2× (maxPixelRatio).** `--render-scale 2.5` and `3.0` both render at
  3200×1800 (pixelRatio 2), identical to rs2.0 — the shared hook clamps supersampling at 2×. To push
  past 5.76 MP for a GPU-saturation point, use a larger `--width`/`--height` viewport, not render-scale.

### Tier 1 — E2 reflection-res (SSR pass, visuals)

| setting | overall tot50 | ssr50 | capture50 | main50 | max-stress ssr50 | avgFPS | Δ vs baseline |
|---|---|---|---|---|---|---|---|---|
| rr0.1 | 8.71 | 1.80 | 0.78 | 6.08 | 2.98 | 112 | −7% |
| **rr0.25 (baseline)** | 9.38 | 2.40 | 0.79 | 6.06 | 3.26 | 104 | — |
| rr0.5 | 10.19 | 3.22 | 0.79 | 5.99 | 4.31 | 95 | +9% |
| rr0.75 | 10.58 | 4.35 | 0.77 | 5.35 | 5.52 | 93 | +13% |
| rr1.0 | 10.66 | 5.20 | 0.74 | 4.58 | 6.65 | 92 | +14% |

- `ssr50` rises with reflection-res but **sublinearly** (0.1→1.0 res = 100× marched pixels, only ~2.9×
  cost) — same DVFS effect: the low-res SSR pass under-loads the GPU. There's a hard SSR floor (~1.8 ms
  at rr0.1). The default **0.25 is a good knee** — dropping to 0.1 saves only ~0.7 ms overall.
- **CAUTION — the isolated `ssr` pass timer UNDERSTATES SSR (see E6).** By this timer, SSR reads ~2.4 ms
  (≈ 25% of the frame) and the `main` pass is 2–3× larger. But that only counts the dedicated march
  pass — it misses the cost SSR imposes *inside* the main pass (sampling the reflection texture +
  occupancy). **E6 (full on/off) shows SSR's true frame share is ~37% (3.55 ms)** — comparable to the
  ~5 ms "pure" main pass, not a quarter of it. So the `main`-vs-`ssr` per-pass columns are a *lower
  bound* on SSR's real weight; trust E6's on/off delta for SSR's actual cost. (The main pass is still
  the single largest *isolated* pass, but "SSR is minor" would be wrong — it's ~⅓ of the frame and, for
  the felt cost, the biggest single lever after render-scale.)

### Tier 1 — E3 water type (visuals)

| water | overall tot50 | ssr50 | main50 | avgFPS |
|---|---|---|---|---|
| Oceanic I (clearest) | 9.40 | 2.41 | 6.08 | 104 |
| **Coastal 5 (default)** | 9.42 | 2.40 | 6.10 | 101 |
| Coastal 9 (most turbid) | 9.42 | 2.41 | 6.09 | 102 |

- **Perf-neutral, confirmed** — all within 0.02 ms. Same shader, different absorption/scattering
  uniforms; clarity/optics is free (as hypothesised). Matters only once underwater effects land.

### Tier 4 — P3 object-count scaling (`--mode physics --bodies N`)

| N | phys50 | GPU tot50 | avgFPS | 1%low | bound by |
|---|---|---|---|---|---|
| 4 | 1.9 | 4.35 | 233 | 227 | GPU |
| 8 | 2.5 | 4.2* | 188* | 183 | GPU |
| 16 | 4.65 | 4.28 | 205 | 147 | GPU |
| 32 | 9.7 | 4.5* | 103 | 81 | **physics** |
| 64 | 19.6 | 4.30 | 51 | 42 | **physics** |

- **Physics is ~linear at ≈0.3 ms/body** (grid of non-overlapping buoyant hulls → few contacts, so no
  super-linear collision blow-up in this range). phys50 crosses the **16.7 ms (60 fps) budget at ≈54
  bodies**; on its own, physics stays under ~10 ms up to ~32 hulls.
- `--bodies` is **not a pure physics lever** — the N hulls also *render*, so GPU tot rises with N too
  (and the extra draw-call submission is CPU). P1/P2 (physics floor + tax) fall out of the census
  above: physics-only frame = 6.95 ms (CPU/physics-bound); the physics tax on the real frame is the
  `both` − `visuals` gap.
- *\*The GPU tot50 for N=8 and N=32 is averaged with a one-off capture-pass spike in a single pass
  (transient render hitch, not load-dependent); `phys50` is rock-steady across both passes and is the
  reliable metric here.*

### Tier 4 — collision on/off (contact-resolution share, done 2026-07-08)

Exposed `--collision off` (a runtime `physics.setCollisionEnabled` that sets every collider's collision
groups to non-interacting — mass, inertia, buoyancy, and the broad-phase AABBs stay put; only Rapier's
narrow-phase + solver *contact* work drops). Isolates the collision-**resolution** cost from the rest of
the step. Wired exactly like `--ssr off` (physics/both modes only). SHA `10bfdbf`, AMD 780M.

| load | collision ON `phys50` | collision OFF `phys50` | Δ |
|---|---|---|---|
| default demo (~31 bodies) | 6.6 ms | 6.7 ms | **+0.1 ms (noise)** |
| 64-body grid | 20.3 ms | 20.0 ms | **−0.3 ms (−1.5%, noise)** |

- **Collision resolution is ~free here — at *any* body count.** Both deltas sit inside the ~3% noise
  floor (at 31 bodies "off" even read *higher* than "on", impossible for real work). So the `phys` cost
  is **entirely broad-phase collider maintenance + per-voxel buoyancy sampling**; narrow-phase + solver
  contribute nothing.
- **Why, and the limit of this result:** the bench grid is **deliberately non-overlapping**
  (`bench-shapes.ts` `GRID_SPACING = 8 m` > the ~6 m boat), and there is no seabed collider, so nothing
  ever touches → no contacts to resolve. Body count scales broad-phase + buoyancy, **not** contacts, so
  more bodies won't surface a collision cost. A **contact-heavy** scene (bodies that overlap / drift
  together / settle on a floor) would — that's the gameplay-relevant follow-up (crowded ships), not a
  bigger `--bodies`.
- **Consequence for the optimization plan:** "turn off collision" buys nothing when bodies float apart.
  The physics levers that matter are **greedy-meshing** (cuts broad-phase, always-on) and the
  **buoyancy sampler** (per-voxel Gerstner) — split still owed (P4 below). Greedy-meshing's ceiling is
  the broad-phase share, which is contact-independent (it's the every-frame AABB maintenance, not
  contacts) — so it helps even with zero contacts, but only up to whatever fraction of `phys` isn't
  buoyancy.

### Tier 2 — E6 SSR on/off (done)

Exposed `--ssr off` (a runtime `ocean.setSsrEnabled`; the uniform is now the single source of truth and
scene.ts skips the whole `renderSsr` march when off). **Gotcha fixed along the way:** `GpuTimer` carries
the last per-span value forward for its panel, so a *skipped* span reported a stale `ssr` reading from
the interactive pre-run frames — the benchmark now records `ssr = 0` when SSR is off, so the saving is
real. *(Side effect: the GUI "Reflection → enabled" toggle now actually reclaims the pass cost too, not
just the sampling — it was a latent no-op-for-perf before.)*

Visuals, same build, SSR on vs off:

| view | ON tot50 | OFF tot50 | Δ | ON main | OFF main |
|---|---|---|---|---|---|
| **overall** | 9.46 | **5.91** | **−3.55 (−37%)** | 6.15 | 5.11 |
| grazing-storm | 10.16 | 6.13 | −4.03 | 6.72 | 5.38 |
| raft-clear | 11.74 | 6.91 | −4.83 | 6.84 | 5.83 |
| calm/moderate (down-calm…short-chop) | 6–10 | 4.4–6 | −1.7 to −4.0 | — | — |
| **max-stress (grazing worst case)** | 10.90 | **10.37** | **−0.53** | 6.51 | **9.53** |

overall avgFPS **106 → 164**, 1%low 64 → 92. So SSR ≈ **37% of the average frame** — its *total* cost
(the march pass **plus** the main-shader sampling/occupancy it drives) is larger than the isolated
`ssr` pass timer (2.4 ms) because disabling it also cheapens the main pass. This restores the doc's old
"SSR ≈ half / 37→100 fps" headline for the *average* scene.

**But the crucial finding: SSR is NOT the grazing worst-case bottleneck.** At max-stress, turning SSR
off saves only 0.53 ms — because the env-map IBL *fallback* reflection at extreme grazing makes the main
pass ~3 ms **more** expensive (6.5→9.5), paying back almost exactly what the skipped SSR march saved.
**The reflection is expensive by any method at grazing; SSR-off just moves the cost.** To shave the
worst case you must cull the reflection *before either path* — that's the Fresnel cutoff (E5,
`uSsrMinFresnel`), not on/off. So an SSR-off "low" quality tier would help calm sailing a lot and storms
barely.

### Still open (Tier 2)

**E5 SSR cutoff** (`uSsrMinFresnel` → `--ssr-cutoff`) is now the top follow-up — it's the lever for the
grazing worst case E6 just showed SSR-off *can't* fix, and the doc's anti-spike knob. **E4 SSR steps**
(the `SSR_STEPS=20` constant → runtime) is lower value given E6. And since the `main` pass is a co-equal
cost with SSR, a Tier-2 pass on the **main shader** (PBR vs the parked Phong; the composite cost) is
worth adding.

**Reconciling with `PERFORMANCE.md`:** its "SSR is the dominant cost center / ≈ half the frame" was
roughly RIGHT — E6 puts SSR's true share at ~37% (the isolated per-pass timer's ~25% is a lower bound;
it misses the main-pass sampling cost). The real corrections to fold in are: (1) SSR-off saves ~37% on
average but **≈0 at the grazing worst case** (reflection-bound by any method — cull with the Fresnel
cutoff, not on/off); (2) the `main` pass is the largest *single isolated* pass, so it's a co-equal
target, not a footnote; (3) on this iGPU the cost is **DVFS-sublinear in resolution**; and (4) the real
combined frame is **CPU-bound** (draw-call submission + physics) at ≤ native res, and **spiky** (1%low
≈ half the avg).
