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

**The still-open half — since CLOSED, and not by taking the trade.** The composer target's *own* MSAA
(`bloom.samples`, default 4) became the only thing antialiasing the scene, at **~4.5 ms**. That looked
like a quality-vs-perf decision. It wasn't: the right move was to ask *why a composer was running at
all*. See bug 3.

**Combined effect of both fixes: 16.5 → 11.65 ms, 55 → 72 fps.**

### 3. The display grade was dragging an entire HDR pipeline behind three multiplies — **−6 ms, and the same pixels**

A saturation + contrast grade was a `ShaderPass` at the end of an `EffectComposer`. That is the textbook
place for a grade. It is also what forced the composer to exist — and **a composer means the scene is
rendered into a HalfFloat + 4×-MSAA offscreen target, resolved and blitted every frame.**

The cost is fill, so it scales with **pixels and never with content**. On an EMPTY frame:

| empty frame — nothing in the scene at all | GPU |
|---|---|
| with the composer | 5.9 ms @ render scale 1.0 · **13.1 ms @ 1.5** |
| without it | **~0.9 ms, flat at every resolution** |

At a 1.5× render scale an empty frame **exceeded a 100 Hz budget on its own**. No scene switch could
ever reach that, which is exactly how it was found: switching off every object in the scene-cost panel
still left ~70 fps on a 100 Hz panel.

**The fix is a shader patch, not a trade.** three ships a `CustomToneMapping` stub in
`tonemapping_pars_fragment` that is *meant* to be replaced. Replace it with "run the operator you asked
for, then grade", and the grade rides a step every material already runs
(`shared/lib/three/display-grade.ts`). Then:

- bloom OFF (the default) → **no composer at all**; the scene draws straight to the default framebuffer,
  which hands back the context's cheap **driver-resolved MSAA** — so the ~4.5 ms "decision" above
  evaporated rather than being paid;
- bloom ON → the composer still runs, and `OutputPass` supports `CUSTOM_TONE_MAPPING` natively, so it
  picks up the identical patched function. **One implementation, both paths, no second copy of the look.**

It grades in sRGB-**encoded** space (encode → grade exactly as the pass did → decode, and let
`colorspace_fragment` re-encode), so the round trip cancels and the output matches the old pipeline.
Verified on pixels, not reasoning: on the 84 % of the frame that is flat interior — which excludes edges,
and therefore excludes the MSAA move — mean |diff| is **0.058/255, max 3**. The grade is unchanged; only
the edges differ, and they differ because MSAA moved back to the backbuffer.

**The shape of this mistake:** the expensive thing was not the feature, it was the *machinery the feature
implied*. Nothing at the call site (`setGrade`) suggests it re-routes the entire renderer. It is the same
family as the other two — **three charges you for things you never chose.**

### 4. Two pre-passes were rendering for a water that wasn't there

`renderPrePasses` runs the scene capture and the SSR march. Both exist **only** to feed the water shader.
With the water hidden, nothing sampled either one — and the frame still rendered the whole scene a second
time into the capture target, still marched the reflections, and threw both away. Gated on `waterVisible`.

This also made the water's own cost honest: **10.4 ms, ~72 % of the GPU frame** (mesh + capture + SSR),
not the 7.9 ms the mesh alone suggested.

### 5. The GPU timer was billing passes that had stopped running

`GpuTimer.values()` returned a persistent map, and a span that stopped being submitted **kept reporting
its last reading forever**. Anything summing the spans into a frame total therefore billed work that
never happened. The tell was an "empty" frame reading a flat **6.3 ms at every resolution**, from 0.5 to
4.7 megapixels — nothing real is both that expensive and that indifferent to pixel count.

`poll()` now zeroes any known span missing from the frame. `scene.ts` had been hand-patching this for SSR
alone (`isSsrEnabled() ? … : 0`), which is the symptom being treated one pass at a time; that special
case is gone. **Any floor number measured before 2026-07-12 is inflated by this.**

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

### Render scale (E1) — **RETRACTED. The lever was broken; the numbers measured the bug.**

The old table here showed 4× the pixels costing only ~1.3× the time, and explained it as a "DVFS
clock-boost signature — the 780M is under-loaded at 1600×900."

**That was wrong.** `ctx.setPixelRatio` did not resize the composer's target, and **the composer's target
is where the scene is rasterised** (the default framebuffer only receives the final quad — see the MSAA
bug above). So the sweep never shrank the **main pass** at all; it only shrank the scene-capture and SSR
targets, which are sized off the renderer's drawing buffer. The sublinearity *was the bug*.

Fixed in `use-three-scene.ts` (`resize()` now re-applies the pixel ratio to the composer, not just the
size). On the live scene at 1920×1080 / DPR 2, render scale 0.5 went from **18 → 59 fps**, GPU total
41.7 → 10.9 ms, main pass 35.4 → 7.0 ms. Render scale is now the strong, roughly-quadratic fill lever it
always claimed to be.

**E1 must be re-run**, and anything that leaned on "GPU cost is sublinear in resolution" is suspect —
including the advice to spot-check levers at native res *because* the low-res delta under-reports. The
underlying caution (check at native res) is still sound; the reason given for it was not.

**How this hid for months:** `bench.mjs` renders at pixelRatio 1 and sweeps `--render-scale` through the
same broken setter, so the harness never exercised a correct one. It took the live game
(`tools/profile-live.mjs`) to surface it — the bench was measuring a scene the game does not run.

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

## The LIVE game is a different scene from the benchmark — measure it with `tools/profile-live.mjs`

**The bench is not the game.** `runBenchmark` hides the gameplay bodies (`physics.object.visible =
false`), hides the archipelago, and renders at pixelRatio 1. That makes it a good A/B instrument and a
**bad model of the shipped frame** — and the gap is where two real bugs hid. When the game reads 20 fps
and the bench reads 72, the bench is not wrong; it is answering a different question.

`tools/profile-live.mjs` answers the shipped one: it loads the scene exactly as `setupOceanScene` builds
it, at a real device pixel ratio, then subtracts one thing at a time.

### The pie, after the 2026-07-12 fixes — 1920×1080, DPR 1, **14.3 ms GPU**

Every row is one switch in the GUI: **Performance → "Scene cost (switch it off)"**. `ΔGPU` is what
removing *just that thing* from the shipped scene gives back. Slices overlap and need not sum.

| switched off | ΔGPU | share |
|---|---|---|
| **water** (mesh + its capture + SSR pre-passes) | **10.4** | **72 %** |
| archipelago (all) | 3.5 | 24 % |
| sky dome | 1.6 | 11 % |
| sun shadows | 1.6 | 11 % |
| ↳ spruce only | 0.4 | 3 % |
| nav buoys · cloud shadows · bodies | ~0 | — |
| **FLOOR — an empty frame** | **0.7** | — |

The floor was **6.4 ms** before (and even that was overstated by the stale-span bug — see bug 5). It is
now 0.7 ms, because there is no composer. **The water is now the whole game**, and the ocean-LOD project
below is the only lever of its size.

**What the live scene taught that the bench could not.** Both of these were true and neither was visible
from `bench.mjs`:

1. **The live scene shipped the entire buoyancy demo TESTBED.** `createPhysics(ocean, [RAFT,
   ...TEST_SHAPES])` — ~30 bodies, ~2,500 voxel colliders of *debug demos*, in the game. It was the
   single most expensive thing in the frame, and it was **CPU**, the half no GPU dial can touch.
   **Removed 2026-07-12** (`[RAFT]` only); `--bodies N` still builds a testbed world on the benchmark
   when we want to price buoyancy deliberately.
2. **It multiplied itself, via the substep spiral.** Rapier's fixed-timestep accumulator answers a slow
   frame with **more substeps**, so the testbed made the frame slow and the slow frame made the testbed
   dearer: the same bodies measured **17 ms** in one run and **44 ms** in a slower one. Not latent —
   active, and superlinear. Removing the two GPU costs above collapsed the live frame from **67 ms to
   vsync**, which is far more than the GPU savings alone: **fixing the GPU fixed most of the CPU for
   free.**

**Still open: `maxPixelRatio: 2`.** The default render scale is the device pixel ratio, so on a
display-scaled Windows desktop (125 % → DPR 1.25, 150 % → 1.5) the game renders 1.6–2.3× the pixels these
numbers were taken at, and *every* fill cost scales with it. Now that the render-scale lever actually
works (see E1), pick a default that isn't "render everything four times over", and/or ship a quality tier.

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

**Not in any of these numbers: generation.** It runs once, inside scene setup, before the first measured
frame, so a per-FRAME model cannot see it.

**Re-measured 2026-07-12: 715 ms** (500,000 bedrock tris · 966 spruce). The old figure here was
**2,483 ms** — stale by 3.5×, because the terrain's generation properties changed after it was recorded
and nobody re-ran it. Ask for it with `__shipwright.terrainStats()`; it used to be reachable only inside
a benchmark result, which is how it rotted. **A number nobody can cheaply re-check is a number that will
be wrong.**

It is still a real hang at load, and still **on a timer**: the moment terrain STREAMS (which it must, for
the world to grow past 600 m) the same work runs each time the player sails into new water, and a
one-off load cost becomes a recurring in-play hitch. A 715 ms stall is less alarming than 2.5 s, so the
Web Worker is less *urgent* than the old number implied — but a 715 ms freeze mid-sail is still a freeze.

**`?terrain=off` skips the generation** rather than hiding the result (see `TERRAIN_GEN_ENABLED`). Worth
**~840 ms per page load** to any probe or bench segment that runs without land — and an unattended sweep
is hundreds of page loads. Hiding a thing is not the same as not making it.

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
- **A "floor" that doesn't move with resolution is not a floor, it is a bug.** Fill cost scales with
  pixels; anything claiming to be expensive *and* flat across a 9× pixel sweep is lying to you. That is
  how bug 5 (the stale GPU-timer spans) was caught, after it had quietly inflated every floor number.
  `GpuTimer.poll()` now zeroes any span not submitted this frame, so this class of error is fixed at the
  source rather than special-cased per pass — but the sanity check is the durable lesson.

---

## Where it stands, and what to do next

The frame is **GPU-bound**, and the shipped 1080p scene is **14.3 ms GPU with a 0.7 ms floor** (down from
~20 ms with a 6 ms floor). CPU is ~2.8 ms and nearly all driver submission; physics is ~0 now the demo
testbed is out of the live scene. **Every remaining lever is on the GPU, and the water is 72 % of it.**

### The budget, on the real display — `tools/budget.mjs`

Quoting levers one at a time invites the wrong conclusion ("LOD only gets us to 43 fps, so this can't be
a game"). No single lever ships it; the question is what they cost **stacked**. The dev machine is a
**3440×1440 ultrawide at 125 % scaling** — a CSS viewport of 2752×1152 at DPR 1.25, i.e. a 3440×1440
drawing buffer, **5.0 Mpx**. Note that render scale 1.25 is **native panel resolution, not
supersampling**: dropping below it renders under-native and upscales. **Render scale is not a free lever
here.** The remaining levers have to be structural.

| cumulative | GPU ms | GPU fps | main | capture | ssr |
|---|---|---|---|---|---|
| **shipped today** | 24.8 | **40** | 15.5 | 5.3 | 3.9 |
| + LOD ocean | 17.0 | **59** | 9.2 | 5.2 | 2.2 |
| + capture at 0.5 | 12.5 | **80** | 9.1 | 2.4 | 1.0 |
| + merged scene pass *(not built)* | **~10.0** | **~100** | — | — | — |

**60 fps = 16.7 ms · 100 fps = 10.0 ms · 144 fps = 6.9 ms.** So native ultrawide 1440p at ~100 fps on a
780M iGPU is reachable — and **none of the three big levers costs image quality.**

1. **LOD ocean — 7.8 ms, no quality cost.** The ocean is purely vertex-bound (above).
2. **Merge the duplicate scene pass — the whole `capture` column (5.3 ms shipped), no quality cost,
   STRUCTURAL.** *The scene is rasterised twice every frame.* `renderPrePasses` draws it **without** the
   water into the capture target; the main pass then draws it **again** with the water. Every opaque
   triangle — terrain, spruce, buoys, raft, sky — is shaded twice. Draw the opaque scene **once** into
   the capture (colour + depth), blit it to the framebuffer, then draw only the water on top. Same
   *kind* of finding as the composer: **the cost was never the feature, it was the machinery the feature
   implied.**
3. **Scene capture resolution — a live dial (`Performance → capture res`), but NOT the default. See
   below: it is the lever that looked free and isn't.**

### Shrinking the scene capture — measured, then REJECTED (and why the rejection is the point)

The capture is a full re-render of the scene, so its raster cost falls with the square of its scale. It
looked like 4.5 ms for nothing. It is not, and the way that came out is worth keeping.

**First, it had to be tested in water you can see through.** The default is Jerlov **Coastal 5** — Baltic
green, ~3 m Secchi — which absorbs the refracted image almost immediately: whatever resolution the
capture is, there is nothing left to see through the water. Judging the lever there is rigging the test.
`tools/capture-curve.mjs` therefore runs the stress case: **Oceanic I** (~40 m Secchi), the **seabed
slope** (which exists precisely as a Secchi gauge), and a high sun putting light on the sand.

| scale | Mpx | capture ms | marginal | img mean Δ | img max Δ | pixels >2/255 |
|---|---|---|---|---|---|---|
| 1.0 | 4.95 | 7.55 | — | ref | ref | ref |
| 0.75 | 2.79 | 4.61 | 3.5 | — | — | — |
| 0.5 | 1.24 | 2.75 | 2.2 | 0.11 | **98** | 0.3 % |
| 0.25 | 0.31 | 1.67 | 0.4 | 0.22 | **113** | 0.6 % |
| 0.1 | 0.05 | 1.30 | ~0 | 0.45 | **111** | 1.4 % |

Two things kill it:

- **A hard floor at ~1.3 ms.** At 1 % of the pixels the pass *still* costs 1.3 ms, because lowering the
  resolution cuts RASTER and not **VERTEX** work: every triangle of terrain, spruce, buoys and sky is
  still transformed, into a texture nobody can see. Shrinking can never delete this pass. Merging it can.
- **The mean is a liar; the max is the truth.** Mean Δ is a rounding error, but max Δ is ~100/255 — and
  Kyle located it by eye immediately: **a blocky, pixelated halo behind each buoy, exactly where the
  object's outline meets the water, worse the lower the scale.** That is **silhouette edge-bleed** — the
  refracted lookup sampling across an object's outline in a chunky capture. Everything *under* the water
  is genuinely indistinguishable even at 0.1, because a refracted lookup through a moving surface hides
  softness arbitrarily well. The bleed is at the waterline, and only there.

`components/shipwright.tsx` **already said this**: *"full res sharpens refraction/depth and avoids
silhouette edge-bleed, for only a VRAM/bandwidth cost."* The choice had been made, deliberately, and
written down. It went unread.

**So the default stays 1.0, and the lever is the merged pass instead** — which returns the capture's
*entire* cost (all 5.3 ms, vertex floor included) with **no** artifact, because the capture then simply
*is* the full-resolution scene render the frame was already doing. Strictly more milliseconds than any
capture scale could buy, and no trade at all.

The dial stays live in the GUI: it is a real knob for a **low-end quality tier**, where a halo at the
waterline is a fair price for 4.5 ms. It is not a free win, and it should never have been sold as one.

### The next perf project: the camera-following LOD ocean — **~8 ms, and it costs no quality**

Bigger than everything else combined, and now measured *as an LOD ceiling* rather than inferred —
`tools/lod-ceiling.mjs`, which holds the plane at 5000 m (so screen coverage, fill, capture and SSR are
unchanged) and varies **only** tessellation density. That is the only honest way to price LOD: an LOD
ocean still has to reach the horizon, so it can win the **vertex** half and nothing else.

| plane FIXED at 5000 m | gpuTot | main | ssr | capture |
|---|---|---|---|---|
| quad **4.9 m** (shipped) | **15.4** | 9.7 | 2.5 | 3.1 |
| quad 20 m | 8.3 | 4.4 | 0.8 | 3.1 |
| quad **40 m** | **7.8** | 3.9 | 0.8 | 3.1 |
| water OFF entirely | 4.0 | 3.9 | 0.0 | 0.0 |

**The ocean is almost purely VERTEX-bound.** At quad 40 the `main` pass costs 3.9 ms — *the same as with
no ocean at all*. The water's per-pixel fill is ~0; every millisecond of it is vertices. (The `capture`
column pinned at 3.1 across every quad size is the control: it draws the scene *without* the water, so it
must not move, and it doesn't.)

- **Ceiling: 7.6 ms of a 15.4 ms frame** (DPR 1); 8.9 of 23.7 at DPR 1.5. The win is a roughly **fixed
  number of ms at any resolution** — vertex work doesn't scale with pixels, fill does — so LOD's *share*
  of the frame shrinks as render scale rises.
- **SSR falls with quad size too** (2.5 → 0.8): the SSR pass re-renders the ocean mesh, so the vertex
  bill is paid **twice a frame**.
- **What LOD cannot touch:** the capture pass (~3 ms) + the SSR march. Those exist to feed the water and
  stay. That is the floor of "there is a sea", and only a cheaper *per-pixel* water would move it.

**Beware the tempting shortcut.** Shrinking `plane size` to 100 m *looks* like the same experiment and is
not: it takes the sea off most of the SCREEN, so it removes fill as well as vertices — and it is
unshippable, because the sea then ends 50 m away. It happens to land on a similar number **only because
the ocean's fill is ~0**, which is a conclusion, not an assumption. Sweep `quad size` at a fixed plane.

Uniform coarsening is not shippable either — the short (48/70 m) waves facet, which is *why* the fine grid
exists. But the detail is spent on **far water that doesn't need it**. A camera-following high-density
patch + a coarse far plane keeps the near waves exactly as they are and reclaims most of the ~8 ms.

**This reverses the old guidance** ("the ocean is not vertex-bound", "do NOT do this pre-emptively").
`CLAUDE.md` is corrected to match.

**And terrain LOD is a DIFFERENT problem** — see "Terrain". The bedrock is fill-bound, not vertex-bound,
so geometric LOD buys it ~1 ms. Do not design one mechanism for both; that was my assumption and the
measurement killed it.

### Done 2026-07-12 (was "do these first")

1. ~~Drop `TEST_SHAPES` from the live scene~~ — **done.** It was the biggest single cost in the live
   frame, and it was debug content.
2. ~~The composer target's MSAA, ~4.5 ms — a quality trade~~ — **it was never a trade.** The composer
   only existed to host the display grade; moving the grade into the tone mapper deleted the composer,
   its HDR target, and its MSAA together, and handed geometry AA back to the context's cheap
   driver-resolved backbuffer. See bug 3. *A "decision" is worth one more look at the premise: the best
   outcome of a perf trade is discovering you don't have to make it.*

### Decisions waiting for Kyle — trades, not bugs. Measured, not taken.

1. **`maxPixelRatio: 2`.** Every fill cost above scales with the pixel count, and the default render
   scale is the device pixel ratio — so Windows display scaling at 125/150 % silently renders 1.6–2.3×
   the pixels these numbers were measured at. Options: cap it lower, or ship an auto quality tier.
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
