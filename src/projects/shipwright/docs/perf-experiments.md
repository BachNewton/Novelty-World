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

## Results template (fill in per experiment)

**System census** (Tier 0) — the per-system snapshot, keyed by git SHA + hardware + `--bodies`:

| run (`--mode`) | bodies | GPU tot50 | phys50 | frame tot50 | avgFPS | 1%low | bound by |
|---|---|---|---|---|---|---|---|
| visuals | 0 | | — | | | | GPU |
| physics | N | — | | | | | CPU |
| both | N | | | | | | ? |

**Per-setting sweep** — from the headless JSON (`.bench/<label>/<host>-<sha>-<slug>.json`), keyed by
git SHA + hardware (GPU) + resolution:

| setting | overall tot50 | ssr50 | capture50 | main50 | max-stress tot50 | overall avgFPS | Δ vs baseline |
|---|---|---|---|---|---|---|---|
| baseline | | | | | | | — |
| … | | | | | | | |

Once filled, this table IS the measured cost model — replace the asserted numbers in `PERFORMANCE.md`
with it.
