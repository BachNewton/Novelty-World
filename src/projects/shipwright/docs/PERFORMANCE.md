# Shipwright — Performance

The measured cost model. Read this before any perf work, and **keep it updated** — it is the one doc
that rots if perf work doesn't maintain it, and it has rotted before (see "What this doc got wrong").

**Hardware:** every number here is an **AMD Radeon 780M** iGPU (Ryzen 7 7840U, 512 MB UMA), headless
ANGLE/D3D11, **1600×900**, fixed-dt. That is the deliberate worst case: a small-VRAM immediate-mode
iGPU that spills to system RAM. A Pixel 10 Pro XL (tile-based deferred, fast unified memory) runs the
whole thing smoothly. Every bench JSON stamps the GPU, so re-run any experiment elsewhere and compare.

Instruments: `tools/bench.mjs` (one run), `tools/sweep.mjs` (the whole suite), `tools/report.mjs`
(fold it into tables). Measured data + methodology: `docs/perf-experiments.md`. State + open threads:
`docs/perf-handoff.md`.

---

## The frame, as measured (2026-07-12)

The frame is **GPU-bound** in normal play. CPU render-prep is ~2.8 ms and physics is ~0 with one raft;
the GPU is ~12 ms. The old doc's "the real frame is CPU-bound" is **no longer true** — that was the
hidden-debug-node era, and it was fixed.

**GPU, 12.0 ms** — default flight (clear sky, open water, no islands in frame):

| pass | ms | what it is |
|---|---|---|
| **main** | **8.8** | the one full-res draw of everything, water included |
| ↳ fill | 5.8 | rasterising it, unlit (`--shading flat`) |
| ↳ PBR shading math | 3.0 | the BRDF + IBL on top of that fill |
| ↳ of which the water's screen-space composite | 0.4 | refraction + Beer–Lambert + SSR *sampling* |
| **SSR pass** | **2.2** | the dedicated low-res reflection march |
| **scene capture** | **1.0** | the colour+depth pre-pass the water reads |
| **cloud shadow** | **0.0** | 0.14 ms, but only under cloud — the default sky is CLEAR |

**CPU, 2.8 ms** — and it is nearly all *driver submission*, not our code:

| seam | ms |
|---|---|
| capture-pass submit | 1.1 |
| main-render submit | 1.2 |
| SSR-pass submit | 0.2 |
| `ocean.update` (Gerstner uniforms) | ~0 |
| nav-buoy particle-ride | ~0 |
| `daylight.update` (shadow frustum + cloud scroll) | ~0 |

Scene census: **42 draw calls · 5,340 triangles · 143 scene-graph nodes**. All three are trivial. Draw
calls are not a problem and never have been; node count is healthy (it was 12,800 once — see below).

### What actually costs money, ranked

| lever | Δ GPU | free? |
|---|---|---|
| **Ocean tessellation** (`--quad-size` 4.9 → 20 m) | **−8.5 ms (−52 %)** | NO — coarse crests facet |
| **Islands in frame** (`--terrain on`) | **+4.2 ms (+24 %)** | it's the game |
| SSR entirely off | −1.8 ms (−15 %) | NO — no reflections |
| Sky dome hidden | −1.8 ms (−11 %) | NO — it's the sky |
| Sun shadow map off | −1.0 ms (−6 %) | NO |
| Reflection res 0.25 → 0.1 | −1.3 ms | nearly — ripple hides it |
| SSR steps 20 → 8 | −1.0 ms | nearly |
| Cloud (any genus) vs clear | +1.4 ms | it's weather |
| SSR Fresnel cutoff (E5) | **~0** | a dead knob — see below |

---

## Two bugs that were eating a third of the frame (both fixed 2026-07-12)

Both had been live for months. Neither was a tuning question; both were things nobody chose. They are
written up at length because the *shape* of each mistake will recur.

### 1. Six switched-OFF lamps were shading every water pixel — **−1.1 ms overall, −3.7 ms (−17 %) on the gameplay frame**

The six nav buoys carry `PointLight` lanterns. In daylight the photocell switched them off by setting
`intensity = 0` **and leaving them in the scene graph**.

three compiles the light **count** into every lit material's program. Six point lights in the scene
means `NUM_POINT_LIGHTS 6`, and every fragment of every lit surface runs the point-light BRDF loop six
times — *including the ocean*, which covers essentially the whole screen. The frame was paying a
six-light loop per water pixel for six lamps that were **off**.

An invisible light is skipped in three's `projectObject`, so it leaves the count entirely. The fix is
`light.visible = dark`.

- **Gate on the PHOTOCELL, not the flash.** `rhythmAt` blinks the lamps several times a second; a light
  count that changed with the blink would force a **shader recompile on every flash**. `dark` flips
  once, at dusk.
- **Twilight is unchanged, and should be** — there the lamps are genuinely lit and the cost is real.
- **The durable rule: `intensity = 0` is not free, and neither is `visible = false` on a *mesh*.** A
  light you are not using must LEAVE THE GRAPH. Same family as the debug-arrow bug below: three charges
  you for things you thought were switched off.

### 2. MSAA on a framebuffer nothing was drawn into — **−3.2 ms (−21 %), and pixel-identical**

The shared hook routes the scene through an `EffectComposer` whenever bloom **or the display grade** is
on — and the grade is **on by default**. When it does, `RenderPass` draws the scene into the
*composer's* HDR target (which has its own `samples`), and the default framebuffer only ever receives
the final fullscreen quad.

A fullscreen quad has no interior geometry edges. So the WebGL context's `antialias: true` multisampled
backbuffer was **antialiasing nothing at all**, while still resolving a 4× buffer every frame.

Proven, not reasoned: `tools/verify-msaa.mjs` renders the same frozen frame with the context's MSAA on
and off and the PNGs are **byte-identical** (with a control shot first, so "identical" can't be an
artifact of a flaky harness — and the control *did* catch one: the live Stats/GPU-timer DOM overlays
were in the screenshots).

Fixed in `use-three-scene.ts`: don't request a multisampled context when a composer will run. To make
that decidable, the grade is now **declared at mount** (`grade` option, mirroring `bloom`) — the
context's `antialias` is baked at creation, so "will a composer run?" must be answerable *before* the
renderer exists.

**Why it hid for months:** `antialias: true` reads like an unambiguous good, and the coupling is
invisible at the call site — nothing about `setGrade` suggests it re-routes the entire renderer. The
grade quietly inherited the exact cost the project had **already measured for bloom and rejected bloom
over** (+3.64 ms, of which only 1.2 ms was the blur; the rest was this same MSAA'd HDR target).

**The still-open half.** The composer target's *own* MSAA (`bloom.samples`, default 4) is what now
antialiases the scene, and it costs **~4.5 ms**. Dropping it to 0 is worth that much but is a **real
quality trade**, not a free win. That is a decision for Kyle, not a number to take. See
`perf-handoff.md`.

**Combined effect of both fixes: 16.5 → 11.65 ms, 55 → 72 fps.**

---

## What this doc got wrong (and why)

Read this before trusting any perf claim, here or anywhere.

### "The ocean is NOT vertex-bound. Tessellation is the least impactful lever." — **WRONG. It is the single biggest lever.**

| quad size | GPU total |
|---|---|
| 2.5 m | **30.4 ms** |
| 4.9 m (default) | 15.9 ms |
| 10 m | 9.1 ms |
| 20 m | **8.6 ms** |

Coarsening the grid from 4.9 m to 20 m **halves the GPU frame**. The old claim came from an experiment
(E8) that measured **render-prep CPU** and correctly found it flat — and then generalised that to the
GPU, which was never tested. The ocean plane is ~1 M vertices, its vertex shader evaluates 4 Gerstner
waves (sin/cos ×4) plus analytic normals *per vertex*, and the plane is drawn **twice a frame** (SSR
pass + main pass). That is millions of trig-heavy vertex invocations.

**Consequence: the camera-following LOD ocean is no longer a "do not do this pre-emptively" nicety — it
is the largest single GPU win available (~8 ms), and it is the one that costs no image quality**, since
the detail being removed is on far water that doesn't need it. It should be the next perf project.

### "SSR is the dominant cost / ~37 % of the frame."

It *was*, and it isn't now — because the MSAA fix removed the bandwidth pressure that SSR's sampling was
amplifying. SSR's true share is now **1.8 ms, ~15 %** (the dedicated pass is 2.2 ms, but turning it off
gives 0.4 ms of that straight back to the main pass, where the env-map fallback picks up the work).
The old headline was measured on a frame with a different bottleneck. **A cost model is only valid for
the frame it was measured on.**

### "SSR's Fresnel cutoff is the lever for the grazing worst case."

It is a **dead knob**. Sweeping `--ssr-cutoff` 0.02 → 0.2 moves the frame by ~0 ms (measured twice, in
two separate sweeps). It discards *near-head-on* pixels; the expensive ones are at *grazing*, where
Fresnel is high and above any sane cutoff. Don't reach for it.

### The one it got right, and the rule that came out of it

**Scene-graph node count ≠ draw count, and `updateMatrixWorld` walks HIDDEN nodes.** The buoyancy debug
arrows once put ~12,800 `Object3D`s in the graph (one `ArrowHelper` ≈ 3 nodes, per voxel, per body),
built eagerly even though the overlay defaults OFF. three walks every node's matrix on every
`renderer.render` — ×3 passes/frame — regardless of `visible`. Cost: ~18 ms of pure CPU for zero pixels
and zero draw calls. Fixed by building them lazily.

**Instance, don't multiply nodes.** An `InstancedMesh` is **1 node** for N elements. Never spawn a node
per voxel or per cell, debug or gameplay. Watch the census node count as ships grow.

Note the family resemblance to the buoy lanterns: **three charges you for things you believe are
switched off.** Hidden nodes still cost matrix updates; zero-intensity lights still cost a BRDF loop.

---

## The levers, measured

### Render scale (E1) — sublinear, because the GPU is under-loaded

| scale | MP | GPU total |
|---|---|---|
| 0.5 | 0.36 | 12.5 |
| 1.0 | 1.44 | 16.0 |
| 1.5 | 3.24 | 18.0 |
| 2.0 | 5.76 | 21.4 |

4× the pixels costs only ~1.3× the time. **This is a DVFS clock-boost signature**, not a cheap fill
path: at 1600×900 the 780M is under-loaded and clocked down. Consequence — **a per-pixel delta measured
at 1600×900 under-represents the shipped game at native res.** Spot-check anything you intend to ship
at `--width 2752 --height 1152`. (Render scale caps at 2× via `maxPixelRatio`; to go past 5.76 MP use a
bigger viewport, not a bigger scale.)

At native resolution (2752×1152, 3.17 MP) the visuals frame is **27.8 ms** — and `--grade off` there is
worth **9.4 ms**, nearly double its 1600×900 saving. The MSAA/bandwidth costs scale with pixels; that is
exactly why they must be checked at native res.

### Reflection resolution (E2) — the SSR pixel dial

| res | SSR pass | GPU total |
|---|---|---|
| 0.1 | 1.7 | 14.6 |
| **0.25 (default)** | 2.5 | 16.0 |
| 0.5 | 3.6 | 17.0 |
| 1.0 | 7.7 | 21.5 |

Sublinear again (100× the marched pixels for ~4.5× the cost). **0.25 is a good knee** — the ripple
distortion hides the softening.

### SSR march steps (E4) — now a runtime knob

| steps | SSR pass | GPU total |
|---|---|---|
| 8 | 1.9 | 15.0 |
| **20 (default)** | 2.5 | 16.0 |
| 48 | 4.0 | 17.2 |

The GLSL keeps a compile-time **max** bound and `break`s on a uniform — GLSL forbids a uniform loop
*bound*, but a uniform break is legal, and being warp-coherent it tracks a baked constant's cost.

### Scene-capture resolution (E7) — small

0.25× saves 0.9 ms. It is only 1.0 ms of the frame to begin with. It buys VRAM/bandwidth and sets
underwater clarity; it does **not** cut the SSR march, which runs per *output* pixel.

### Clouds — +1.4 ms, flat across genus

Cumulus, stratus, and cumulonimbus all cost the same (~+1.4 ms): the cloud-shadow **pass** is 0.14 ms
and the per-lit-fragment map fetch in the global `lights_fragment_begin` override is ~0.25 ms. The rest
is the dome's own shading. **Cheap, and the default flight never sees it** — the default sky is clear,
so `cloud` GPU-ms reads 0. Don't mistake that 0 for "clouds are free"; it means "no clouds were tested".

---

## Physics & buoyancy (CPU)

Distinct from the GPU. Rapier (single-threaded WASM, **on the main thread**) + our JS buoyancy, all
inside `physics.update()`, once per rendered frame, 1–5 fixed sub-steps.

**Scaling — linear, ~0.3 ms per body:**

| bodies | `phys` | buoyancy | Rapier solver |
|---|---|---|---|
| 4 | 1.8 | 1.3 | 0.4 |
| 16 | 5.1 | 3.8 | 1.1 |
| 32 | 9.9 | 7.0 (71 %) | 2.5 (25 %) |
| 64 | 21.9 | 15.9 | 5.0 |

`phys` crosses the 16.7 ms (60 fps) budget at **~50 bodies**. Real gameplay is one raft (~100 voxels) —
today's cost is a testbed artifact. Don't over-optimise for it.

**Buoyancy is 71 % of the step, and the Gerstner Newton inversion is the core of it.** `--sample-iters`
(new) sweeps the inversion's iteration count directly:

| Newton iters | `phys` | buoyancy |
|---|---|---|
| 0 (no inversion) | 7.1 | 4.1 |
| 2 | 8.3 | 5.4 |
| **4 (default)** | 10.0 | 7.0 |

**Each iteration costs ~0.7 ms at 32 bodies**; the full inversion is **2.9 ms — 42 % of buoyancy**. So
the perf docs' long-standing "fewer sample points or a cheaper height eval" lever is now priced: going
4 → 2 iterations saves ~1.7 ms. **It is a FIDELITY trade** (the sampled waterline drifts from the
rendered one), so judge the float feel before shipping it. At the calm gameplay sea, horizontal
displacement is tiny and 2 may well be indistinguishable — worth testing.

**Drag is only 14 %** (`--drag off`: −1.35 ms). An analytic water velocity would recover little.

**Collision resolution is free** (`--collision off`: 0 ms, twice measured). The bench hulls are
non-overlapping, so there are no contacts to resolve. `phys` is broad-phase collider maintenance +
per-voxel buoyancy. A **contact-heavy** scene (crowded, touching ships) would differ — still unmeasured.

---

## Measuring — read this or you will be misled

- **Interleave, or thermal drift will invent a finding.** This is not hypothetical. In the 2026-07-12
  sweep, `--buoys off` read **−5.7 ms (−36 % of the frame)** across two agreeing passes — and it **did
  not reproduce** when A/B'd interleaved against an adjacent baseline (real answer: −1.1 ms). A hot
  baseline against a cooled "after" faked a 23 % win once before. **Always run A → B → A in one warm
  session.** `tools/sweep.mjs` re-baselines at the head of every tier for exactly this reason, and
  `tools/report.mjs` marks any value whose two passes disagree by >3 %.
- **p50 is the metric; ~3 % is the noise floor.** Treat p95/p99/spikes as directional.
- **Measure HEADLESS.** `--headed` is a different GPU path and reads ~2× apart. It is a *watch* mode.
- **GPU-ms is build-independent** (identical GLSL), so a dev server is fine for GPU work. But a dev
  server **hot-reloads**, and a Fast Refresh remount destroys an in-flight run. For an unattended sweep
  use a production server: `NEXT_DIST_DIR=.next-bench NEXT_PUBLIC_SHIPWRIGHT_BENCH=1 npm run build`
  then `npx next start -p 3005` (its own dist dir, so it can coexist with the dev server on 3001).
- **The vsync cap hides relative cost** in the interactive scene. Read GPU-ms, not FPS.
- **Never read `renderer.info` after the frame.** three resets it at the top of every `render()` call, so
  a post-frame read reports whatever drew **last** — which, since the grade landed, is the composer's
  fullscreen quad. The census reported `1 draw call · 1 triangle` for a 114-mesh scene for exactly this
  reason. It is now sampled inside the capture pass.
- **`GpuTimer.values()` carries the last per-span value forward**, so a *skipped* pass reports a stale
  reading. The bench forces `ssr = 0` when SSR is off. Replicate that guard for any new "skip a pass"
  experiment.

---

## Future levers, ranked by measured value

1. **Camera-following LOD ocean — ~8 ms, and it costs no quality.** The uniform grid spends ~1 M
   trig-heavy vertices on far water that doesn't need them, twice a frame. This is now the **biggest
   single win available** and the clear next perf project. (Tried and rejected: dropping the short waves
   and faking them with the normal map — looked worse, a repeating "river" of smooth swells. LOD is a
   different thing: keep the waves, spend the vertices where the camera is.)
2. **The composer target's MSAA — ~4.5 ms, but a real quality trade.** Needs a look-vs-cost call.
3. **Terrain — 4.2 ms whenever land is in frame**, and land is the game. Unoptimised so far: no LOD, no
   impostors for the ~1,000 instanced spruce, and it lands in both the capture pass and the shadow map.
4. **Buoyancy Newton iterations — ~1.7 ms** at 4 → 2, a fidelity trade (above). Only matters at high
   body counts.
5. **Hi-Z / hierarchical SSR marching** — big strides through empty space via a depth mip-chain.
6. **Auto quality tiers** — detect a weak GPU and default render scale / reflection res down.

## Tried and rejected

- **Planar reflection** — fundamentally incompatible with a vertex-displaced surface. SSR replaced it.
  (See CLAUDE.md "Water architecture".)
- **Phong lighting** — cheaper BRDF, worse look, and the PBR shading math is only 3.0 ms of the frame
  now. Recoverable from git (~`7085226`) if a low-end tier ever needs it.
- **Dropping the short waves + faking them with the normal map** — looked worse.
- **The SSR Fresnel cutoff as a perf knob** — measured flat, twice. Dead.
