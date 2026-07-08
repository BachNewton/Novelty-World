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

## Tier 1 — runnable TODAY (no code changes)

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

## Tier 2 — need a small knob exposure first

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

A frame has two cost centres; `--mode` isolates the CPU one. The benchmark steps its OWN Rapier world
(`BENCH_SHAPES`, seeded from `TEST_SHAPES`), separate from the live raft + sailor and reset to a known
spawn → deterministic. The `phys` column (CPU physics-step ms) is the metric here.

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

### P3 — Object-count scaling (needs a small knob)
- **Needs:** a `--bodies N` knob (subset/replicate `BENCH_SHAPES`) — today it's the fixed `TEST_SHAPES`
  set. Add it like the other bench knobs.
- **Hypothesis:** `phys` p50 grows with body/voxel count (buoyancy is per-voxel; collisions super-linear
  in contacts) — the curve that answers "how many objects before physics blows the frame budget".
- **Sweep:** N = 4 / 8 / 16 / 32 / 64.

## Results template (fill in per experiment)

Per setting, from the headless JSON (`.bench/<label>/<host>-<sha>-<slug>.json`), keyed by git SHA +
hardware (GPU) + resolution:

| setting | overall tot50 | ssr50 | capture50 | main50 | max-stress tot50 | overall avgFPS | Δ vs baseline |
|---|---|---|---|---|---|---|---|
| baseline | | | | | | | — |
| … | | | | | | | |

Once filled, this table IS the measured cost model — replace the asserted numbers in `PERFORMANCE.md`
with it.
