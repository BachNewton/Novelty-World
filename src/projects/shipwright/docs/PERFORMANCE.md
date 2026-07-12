# Shipwright — Performance

The measured cost model. Read this before any perf work, and **keep it updated** — it is the one doc
that rots if perf work doesn't maintain it, and it has rotted before (see "What this doc got wrong").

**Hardware:** every number here is an **AMD Radeon 780M** iGPU (Ryzen 7 7840U, 512 MB UMA), headless
ANGLE/D3D11, **1600×900**, fixed-dt. That is the deliberate worst case: a small-VRAM immediate-mode
iGPU that spills to system RAM. A Pixel 10 Pro XL (tile-based deferred, fast unified memory) runs the
whole thing smoothly. Every bench JSON stamps the GPU, so re-run any experiment elsewhere and compare.

Instruments: `tools/bench.mjs` (one run), `tools/sweep.mjs` (the whole suite), `tools/report.mjs`
(fold it into tables).

**There are two perf docs, and only two.** This one is the **brief**: what costs what, which levers are
real, what is still open, and what to do next. `docs/perf-experiments.md` is the **log**: dated raw
tables, methodology, and what was tried and rejected. (Same split the lighting work uses —
`LIGHTING.md` / `lighting-log.md` — and for the same reason.) A separate "handoff" doc used to hold the
state and open threads; it was folded in here on 2026-07-12, because "what we still don't know" is not a
different document from the cost model — it is the part of the cost model that isn't finished, and
keeping it apart is how the two drift. This doc drifting is exactly what produced the errors catalogued
below.

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
| **Islands in frame** (`--terrain on`) | **+6.3 ms** | it's the game — see "Terrain" |
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
- **The durable rule: `intensity = 0` is not free.** A light you are not using must LEAVE THE GRAPH.
  Same family as the hidden-debug-node bug below: **three charges you for things you believe are
  switched off.**

**Then the night was still paying it — so the lamps were POOLED onto one light.** Gating on the
photocell fixed the *day*; at night six lanterns were still six lights, and the cost scales with the
buoy field, which is about to fill with channel markers. So there is now **one** `PointLight` — a light
*slot*, re-pointed each frame at the nearest lantern that is currently flashing.

| twilight (the only segment where lamps are lit) | GPU |
|---|---|
| six per-buoy lights | 21.1 ms |
| **one pooled light** | **18.5 ms** (−2.6 ms) |
| buoys hidden entirely | 18.2 ms ← the pooled light + all six buoy meshes now cost **0.3 ms** |

The count never changes while lit, so nothing recompiles; six marks and six hundred cost the same.

**Why keep a light at all** — suppressing all six changed only **0.19 % of pixels** (max delta 16/255).
Because that was measured 20 m out. Allard's law puts a 5 NM cardinal at 77 cd → ~3 lux at 5 m, about
**12× full moonlight**, and the raft spawns among these marks. `LAMP_LIGHT_RANGE = 40 m` is where the
photometry says it stops mattering, not a look tweak.

**And the reflection survives, because it never came from the light.** The lovely wave-distorted streak
on the water is **SSR ray-marching the scene colour capture**, which the glowing emissive lens is
already in. A lantern does two things that look like one: it *illuminates* (the `PointLight`, the whole
cost) and it *is visible* (the lens, which SSR reflects). Only the first was expensive.

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
quality trade**, not a free win — a decision, not a number to take. See "Decisions waiting for Kyle".

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

## Terrain — 6.3 ms whenever land is in frame, and it is NOT what you would guess

Land is the game, and until 2026-07-12 the archipelago had **zero cost attribution**: `runBenchmark`
hid it (`island.object.visible = false`) to keep the flight comparable with historical runs, so it was
never in a single measured frame. The `fp-sail` / `island-approach` / `twilight` segments now show it,
and `--terrain on|off` forces it either way for a clean subtraction.

**Budget: bedrock 500,000 tris · spruce 74,296 tris (1,004 trees).** (The capture pass censuses ~1.15 M
tris ≈ 2× that, because terrain is drawn into the **shadow map and the scene** in the same render call.)

| probe | GPU | reads as |
|---|---|---|
| `--terrain off` | 11.5 | — |
| `--terrain on` | ~17.8 | **+6.3 ms** |
| `--terrain-trees off` | 17.7 | the ~1,000 spruce cost **~0.2 ms** |
| `--terrain-shadows off` | 18.2 | terrain as a shadow CASTER costs **~0** |

**The instanced spruce are essentially free.** One `InstancedMesh` = 1 draw call, 1 scene-graph node,
74 k triangles. The instancing did exactly its job. The thing that *looks* expensive isn't.

**The whole 6.3 ms is the bedrock — and decimating it barely helps:**

| bedrock spacing | tris | GPU |
|---|---|---|
| 1.2 m (default) | 500,000 | ~17.8 |
| 2.4 m | 125,000 | 16.7 |
| 4.8 m | 31,250 | 17.5 |

**16× fewer triangles buys ~nothing.** Compare the ocean, where 16× fewer vertices *halved* the frame.
So the bedrock is **NOT vertex-bound** — it is fill/shading-bound: 500 k triangles or 31 k, it covers the
same pixels and shades them with the same PBR + vertex-colour material.

**This is the key strategic finding, and it splits the two LOD efforts apart:**

- The **ocean** is vertex-bound (1 M heavy Gerstner vertices, drawn twice a frame) → **geometric LOD is
  exactly right**, ~8 ms available.
- The **bedrock** is fill-bound → decimating its mesh buys ~1 ms. Its 6.3 ms is in **shading the pixels
  it covers**, so the lever is the **material/shader**, not the triangle count.

They are *not* the same problem, which is what I assumed before measuring.

**Open — 4 runs, ~10 min** (instrumentation is built and committed, this is time not work):
1. `--terrain-shading flat` (the **decisive** one, never ran). `full − flat` = terrain's PBR shading +
   shadow-receive cost; `flat` alone = its raw fill. It decides whether island LOD attacks **triangles**
   or the **shader** — the spacing result says shader, but that is an inference, not a measurement.
2. A closing baseline for the spacing sweep (`terrB-on4` failed mid-batch), so 16.7 / 17.5 are bracketed
   rather than leaning on one opening baseline.

**Not in any of these numbers: generation.** The 600 m window takes **2,483 ms on the main thread** to
generate. It runs once, inside scene setup, before the first measured frame — so a per-FRAME model
cannot see it, and it is deliberately excluded. But it is a real hang at load, **and it is on a timer**:
the moment terrain STREAMS (which it must, for the world to grow past 600 m), the same work runs every
time the player sails into new water, and a one-off load cost becomes a recurring in-play hitch. That is
when it has to move to a Web Worker. `Terrain.generationMs` reports it.

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

## Where it stands, and what to do next

The frame is **GPU-bound at ~11.7 ms / ~72 fps** (780M, 1600×900, open water). It was **16.5 ms /
55 fps** before 2026-07-12. CPU is ~2.8 ms and nearly all driver submission; physics is ~0 with the one
gameplay raft. **Every remaining lever is on the GPU.**

### The next perf project: the camera-following LOD ocean — **~8 ms, and it costs no quality**

Bigger than everything else combined. Coarsening the ocean grid from 4.9 m quads to 20 m takes the GPU
frame **15.9 → 8.6 ms**: the plane is ~1 M vertices, its vertex shader runs 4 Gerstner waves (sin/cos ×4)
+ analytic normals *per vertex*, and it is drawn **twice a frame** (SSR pass + main pass).

Uniform coarsening is not shippable — the short (48/70 m) waves facet, which is *why* the fine grid
exists. But the detail is spent on **far water that doesn't need it**. A camera-following high-density
patch + a coarse far plane keeps the near waves exactly as they are and reclaims most of the ~8 ms.
Treat ~8 ms as the **ceiling**, not a promise, until it is built.

**This reverses the old guidance** ("the ocean is not vertex-bound", "do NOT do this pre-emptively").
`CLAUDE.md` is corrected to match.

**And terrain LOD is a DIFFERENT problem** — see "Terrain". The bedrock is fill-bound, not vertex-bound,
so geometric LOD buys it ~1 ms. Do not design one mechanism for both; that was my assumption and the
measurement killed it.

### Decisions waiting for Kyle — trades, not bugs. Measured, not taken.

1. **The composer target's MSAA — ~4.5 ms (≈ 38 % of the current frame).** Now that the context's dead
   MSAA is gone, the composer's HalfFloat target (`bloom.samples`, default 4) is the **only** thing
   antialiasing the scene's geometry. Dropping it to 0 buys ~4.5 ms and costs aliased edges — the
   horizon, spruce silhouettes, buoy rims. Options: keep 4 and buy the perf from the LOD ocean instead;
   drop to 0 and lean on render-scale supersampling (may be visually free at DPR ≥ 1.5 — wants an A/B by
   eye at native res); or make it a quality tier. This is the photorealistic sea the project exists for,
   so it wants your eye, not my guess.
2. **Buoyancy Newton iterations — ~1.7 ms** at 4 → 2. A **fidelity** trade: the sampled waterline drifts
   from the rendered one. At the calm gameplay sea horizontal displacement is tiny, so 2 may be
   indistinguishable — but "may be" is a thing to look at, not assume. ~0 with one raft, so not urgent.

### Open threads

1. **LOD ocean** (above). The frontier.
2. **Finish the terrain breakdown — 4 runs, ~10 min.** `--terrain-shading flat` (the decisive one: does
   island LOD attack triangles or the shader?) and a closing baseline for the spacing sweep. The
   instrumentation is built and committed; this is time, not work. See "Terrain".
3. **Terrain generation is 2.5 s on the main thread** and becomes a per-chunk in-play hitch the moment
   terrain streams. Web Worker. See "Terrain".
4. **Contact-heavy physics is unmeasured.** `--collision off` is free *because the bench hulls never
   touch*. Crowded/touching ships would surface a real collision cost.
5. **No regression gate.** Bench JSON is keyed by git SHA; a gate (fail if p95 rises >X % vs a stored
   baseline) is the natural next step now the numbers are trustworthy and a sweep is one command.
6. **Hi-Z / hierarchical SSR marching** — big strides through empty space via a depth mip-chain.
7. **Auto quality tiers** — detect a weak GPU and default render scale / reflection res down.

### How to re-run

```bash
# one run
node src/projects/shipwright/tools/bench.mjs --label check --url http://localhost:3001/3d-games/shipwright

# the whole suite, unattended (~5.5 h) — against a PRODUCTION server so nothing hot-reloads mid-run
NEXT_DIST_DIR=.next-bench NEXT_PUBLIC_SHIPWRIGHT_BENCH=1 npx next build
NEXT_DIST_DIR=.next-bench NEXT_PUBLIC_SHIPWRIGHT_BENCH=1 npx next start -p 3005 &
node src/projects/shipwright/tools/sweep.mjs --url http://localhost:3005/3d-games/shipwright --passes 2
node src/projects/shipwright/tools/report.mjs            # fold it into tables

# the two pixel-identity guards
node src/projects/shipwright/tools/verify-msaa.mjs --url http://localhost:3005/3d-games/shipwright
node src/projects/shipwright/tools/verify-shadow-cache.mjs
```

**Check for strays before you trust a number.** On 2026-07-12 an orphaned Claude session was found
running its own `bench.mjs` loop against the same GPU. It did not corrupt anything (its runs were
timestamped after the last clean one, and it used its own labels), but only because that was checkable.
If a number looks wrong, list the processes before you believe it.

## Tried and rejected

- **Planar reflection** — fundamentally incompatible with a vertex-displaced surface. SSR replaced it.
  (See CLAUDE.md "Water architecture".)
- **Phong lighting** — cheaper BRDF, worse look, and the PBR shading math is only 3.0 ms of the frame
  now. Recoverable from git (~`7085226`) if a low-end tier ever needs it.
- **Dropping the short waves + faking them with the normal map** — looked worse.
- **The SSR Fresnel cutoff as a perf knob** — measured flat, twice. Dead.
