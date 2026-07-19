# Shipwright — Performance

The measured cost model. Read this before any perf work, and **keep it updated** — it is the one doc
that rots if perf work doesn't maintain it, and it has rotted before (see "What this doc got wrong").

**Hardware:** every number here is an **AMD Radeon 780M** iGPU (Ryzen 7 7840U, 512 MB UMA), headless
ANGLE/D3D11, **1600×900**, fixed-dt. That is the deliberate worst case: a small-VRAM immediate-mode
iGPU that spills to system RAM. A Pixel 10 Pro XL (tile-based deferred, fast unified memory) runs the
whole thing smoothly. Every bench JSON stamps the GPU, so re-run any experiment elsewhere and compare.

Instruments — **and reach for the live ones first, because the bench is not the game** (see "The LIVE
game is a different scene from the benchmark"):

| tool | asks |
|---|---|
| `tools/ab.mjs` | is B cheaper than A? **THE ITERATION TOOL** — interleaved A→B→A on a segment subset, one warm session, ~1–3 min, with a built-in drift column that says when the answer is noise |
| `tools/profile-live.mjs` | what does the **shipped** frame cost, and where does it go? (the pie) |
| `tools/budget.mjs` | what do the levers cost **stacked**, on the real display? (the roadmap) |
| `tools/lod-ceiling.mjs` | what can an LOD ocean actually win? (tessellation at a fixed plane size) |
| `tools/capture-curve.mjs` | what does shrinking the scene capture cost the **image**? |
| `tools/bench.mjs` · `sweep.mjs` · `report.mjs` | the deterministic scripted flight: one run, the whole suite, the tables (`--segments` flies a subset) |
| `tools/verify-msaa.mjs` · `verify-shadow-cache.mjs` · `verify-merged-pass.mjs` | pixel-identity guards |

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

### Scene-capture resolution (E7) — **superseded. The old "small" verdict is wrong twice over.**

The old entry read: *"0.25× saves 0.9 ms. It is only 1.0 ms of the frame to begin with."* Both halves are
now false. The capture is **5.3 ms** of the shipped frame (it grew as a share once the composer left), and
it is a **quality trade, not a cheap one** — it bleeds silhouettes at the waterline. Measured properly in
`tools/capture-curve.mjs`; see "Shrinking the scene capture — measured, then REJECTED".

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

**The decisive run — DONE 2026-07-15** (`ab.mjs`, interleaved, island segments, 1600×900, merged pass on):

| A/B | fp-sail | island-approach | twilight |
|---|---|---|---|
| full − flat shading | −0.94 | −1.00 | −1.28 |
| terrain on − off | −1.41 | **−0.04** | −1.40 |

1. **The bedrock's PBR shading + shadow-receive is worth ~1.0–1.3 ms** (scales with fill, so more at
   native res). That is the ceiling of the "cheaper terrain material" project — real, but not the old
   6.3 ms headline, which was measured in the pre-merge, pre-re-anchor regime.
2. **Terrain is partly FREE via occlusion — removing it can cost ~nothing.** On island-approach,
   hiding the island entirely changed the frame by 0.04 ms: every hidden terrain pixel became a WATER
   pixel (composite + SSR coverage), which costs about what the terrain did. Land that occludes water
   pays for itself; land against sky (fp-sail/twilight camera angles) costs its full ~1.4 ms. Any
   future "terrain is expensive" claim must say what the pixels would otherwise be.

Still open from before: a closing baseline for the old spacing sweep (17.8-era numbers are bracketed
rather than re-anchored — low value now the regime shifted anyway).

**Not in any of these numbers: generation.** It runs once, inside scene setup, before the first measured
frame, so a per-FRAME model cannot see it.

**Re-measured 2026-07-12: 715 ms** (500,000 bedrock tris · 966 spruce). The old figure here was
**2,483 ms** — stale by 3.5×, because the terrain's generation properties changed after it was recorded
and nobody re-ran it. Ask for it with `__shipwright.terrainStats()`; it used to be reachable only inside
a benchmark result, which is how it rotted. **A number nobody can cheaply re-check is a number that will
be wrong.**

**No longer a hang — the worker landed 2026-07-17** (ranked list #2): generation runs off-thread, the
game starts on open water immediately, and the island arrives ~1 s later as transferred buffers. The
per-chunk number (~530 ms for the 600 m window at 1.2 m, reported by `terrainStats().generationMs` and
`tools/verify-terrain-worker.mjs`) is now the STREAMING budget — how long a chunk takes to arrive after
the player sails toward it — not a freeze.

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

The frame is **GPU-bound**; CPU is ~2.8 ms and nearly all driver submission; physics is ~0 now the demo
testbed is out of the live scene. **Every remaining lever is on the GPU.** As of 2026-07-15 the
**merged main pass** is shipped (the opaque scene is rasterised once per frame, not twice), and as of
2026-07-17 the **LOD ocean** is too — **−4.5 ms mean, −7.1 ms on max-stress at 1600×900** (see its DONE
section below). No remaining lever approaches that size; the frontier is now the smaller SSR and
terrain-material items in the ranked list.

(⚠ Do not quote this doc's older ABSOLUTE milliseconds — "14.3 ms shipped", "24.8 ms at ultrawide" —
against fresh runs: the 2026-07-12 absolutes did not reproduce on 2026-07-15 on the same machine and
commit (~2× apart; thermal/DVFS regime is the prime suspect). Interleaved same-session deltas are the
trustworthy unit; re-anchor a baseline in-session before comparing anything. The same regime is
visible in plain GAMEPLAY: the live game settles from ~100 to ~80 fps over the first minutes of play
as the APU drops from cold-boost to sustained clocks — adopted 2026-07-19 as the working explanation;
what that *felt* like and the fix are in "Frame pacing" below.)

### Frame pacing, vsync, and VRR — why 80 fps FELT broken, and the fix (2026-07-19)

The symptom: fresh boot → ~100 fps, mouse-look smooth; after minutes of play the thermal regime
settles to ~80 fps and mouse-look turned laggy and juddery — far worse than "20 % fewer frames"
should feel, with no frame-time spikes to blame. The mechanism is the DISPLAY, not the renderer:

- **A browser is always vsync-on.** Chrome composites on the panel's refresh; rAF is that clock, and
  there is no tearing/uncapped mode to reach for. Native-game intuition ("vsync off unless tearing
  bothers you") has no browser equivalent.
- **Under fixed-refresh vsync, evenness beats average.** Frames display for whole multiples of the
  refresh period (10 ms on the 100 Hz dev panel), so 80 fps = three frames shown 10 ms + one held
  20 ms — twenty hitches per second — plus compositor queue latency once frame time exceeds the
  budget. "Anything above 60 is smooth" is false under vsync; 80 on a 100 Hz panel paces worse than
  a locked 50. Mouse-look exposes it hardest because a mouse is *position* control (hand position ↔
  camera angle, so lag is directly visible); a stick is *rate* control and hides the same latency.
- **The transition is a cliff, not a slope.** At ≤10 ms frame time the game is synced 1:1 — even
  pacing, minimal queue. At 10.1 ms it drops into the judder + queue regime all at once. A frame
  tuned to ~10 ms on a COLD gpu lives on the wrong side of that cliff once the clocks settle.

**The fix on the dev display is VRR — enabled and confirmed by feel 2026-07-19.** The dev monitor
(Samsung ViewFinity S5 34″ ultrawide, DisplayPort) supports FreeSync 48–100 Hz with LFC; its OSD
FreeSync toggle + Windows' variable-refresh-rate setting were switched on, and the warm ~80 fps
regime immediately stopped feeling laggy. VRR shows each frame when it arrives, so an *organic*
~12.5 ms frame paces evenly at low latency. (80 still reads slightly less fluid than 100 — that
residual is honest temporal resolution, and only frame-time headroom moves it. Chrome's VRR path is
most reliable fullscreen.)

Consequences, recorded so they aren't re-derived:

- **The stride FPS cap (`Performance → fps cap`) is the only cap a browser can implement, and the
  fraction form is correct — do NOT replace it with preset numbers.** A page can only render-or-skip
  each rAF tick, so the achievable *even* rates are refresh/N — the strides — on every panel,
  automatically. A "cap at 60" on a 100 Hz panel means rendering 3 of every 5 ticks: uneven source
  pacing, **and VRR does not repair it** — adaptive sync follows the frames it is given, so an
  unevenly-submitted stream paces unevenly on any display. (The organic 80 fps case paces evenly
  under VRR precisely because nothing skips; every frame simply takes ~12.5 ms.)
- The ½-rate stride was judged live: pacing looks even, but the laggy mouse feel remains — expected,
  since a cap fixes pacing while slightly *lengthening* latency. It is the graceful-degrade tier for
  fixed-refresh displays, not a smoothness fix.
- **Perf targets: the cliff still exists for everyone else.** The dev display no longer has one, but
  every fixed-refresh/non-VRR player does, and there is no web API to detect whether VRR is active —
  so the number that matters is the SUSTAINED-regime (warm-clock) frame time clearing the panel
  budget. Cold-boot measurements overstate the headroom.

### The budget, on the real display — `tools/budget.mjs`

Quoting levers one at a time invites the wrong conclusion ("LOD only gets us to 43 fps, so this can't be
a game"). No single lever ships it; the question is what they cost **stacked**. The dev machine is a
**3440×1440 ultrawide at 125 % scaling** — a CSS viewport of 2752×1152 at DPR 1.25, i.e. a 3440×1440
drawing buffer, **5.0 Mpx**. Note that render scale 1.25 is **native panel resolution, not
supersampling**: dropping below it renders under-native and upscales. **Render scale is not a free lever
here.** The remaining levers have to be structural.

Re-measured **2026-07-15**, after the merged main pass landed (rows are cumulative, one warm session):

| cumulative | GPU ms | GPU fps | main | capture | ssr |
|---|---|---|---|---|---|
| CLASSIC (2-pass, the old path) | 10.5–11.0 | **~93** | 6.4 | 2.7 | 1.5 |
| **MERGED main pass (shipped)** | **9.9** | **101** | 5.3 | 2.5 | 1.8 |
| + capture MSAA 4× | 17.0 | 59 | 5.4 | **9.5** | 1.9 |
| + LOD ocean (still with MSAA 4×) | 13.4 | 74 | 3.1 | 9.3 | 1.1 |
| + capture at 0.5 | 8.8 | 114 | 4.6 | 3.3 | 0.8 |

**⚠ The old table here claimed "shipped today = 24.8 ms". That did NOT reproduce** — the same tool, the
same machine, the same commit reads **10.5–11.0 ms** for the same classic config three days later, and
`profile-live` moved 14.3 → ~10 the same way. Nothing in the code explains a 2.2× shift, which leaves
the machine's own regime (thermal state / power profile / DVFS clocks) as the prime suspect — the doc's
own "a cost model is only valid for the frame it was measured on" lesson, now with a corollary: **it is
only valid for the thermal regime it was measured in, so re-anchor the baseline in the same session
before quoting any historical absolute.** Deltas measured interleaved remain trustworthy; absolutes
across sessions do not.

1. **Merged scene pass — SHIPPED, see the DONE section below.** Its budget-table win on this open-water
   default view is ~1 ms; its real value is in the frames that were worst (island approach −2.3 ms,
   max-stress −2.6 ms at 1600×900).
2. **LOD ocean — SHIPPED 2026-07-17** (see the DONE section below). NB the budget table above predates
   it and its `+ LOD ocean` row was a quad-40 *proxy*; `budget.mjs` now measures the real grid (and its
   row order changed: LOD lands right after the merged pass, matching the shipped stack) — re-run for
   fresh stacked numbers.
3. **Scene capture resolution — a live dial (`Performance → capture res`), but NOT the default.** And
   NB: with the merged pass the capture IS the presented opaque image, so this dial now behaves like a
   render scale that spares only the water — a stronger quality trade than it was, and still a low-end
   tier knob only.

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

**So the default stays 1.0, and the lever is the merged pass instead** — the capture simply *is* the
full-resolution scene render the frame was already doing, so presenting it deletes the duplicate with
**no** artifact. (Built 2026-07-15 — see the DONE section below. NB the win is the *main pass's*
duplicate share, not the capture column this paragraph once promised; the capture pass itself still
runs, because the water still needs it.)

The dial stays live in the GUI: it is a real knob for a **low-end quality tier**, where a halo at the
waterline is a fair price for 4.5 ms. It is not a free win, and it should never have been sold as one —
and under the merged pass it is a bigger trade still, because the capture is now also the presented
opaque image (the dial behaves like a render scale that spares only the water).

### The LOD-ocean ceiling — the pricing that justified the build (SHIPPED 2026-07-17, see the DONE section)

Bigger than everything else combined, and measured *as an LOD ceiling* rather than inferred —
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

### DONE 2026-07-15: the merged main pass — the duplicate scene rasterisation is gone

*(This section replaces the "NEXT: merge the duplicate scene pass" spec, which is executed. What
follows is what the spec got right, what it got wrong, and what the measurement actually says.)*

**What shipped** (`present-pass.ts` + `scene.ts` `routeMainPass` + `layers.ts`, default ON, live switch
at `Performance → merged main pass`): `renderPrePasses` still renders the water-less scene into the
capture; a fullscreen **present quad** then puts that capture on screen (tonemap + grade via the
`CustomToneMapping` chunks, so both paths share one display transform by construction), and the main
render draws **only** the quad + the water — `routeMainPass` points the camera at `MAIN_PASS_LAYER`
alone. Any frame whose pre-passes didn't run (capture probe off, water off, physics-only bench) falls
back to the classic full-scene render automatically. three layer-filters **lights** too, so the sun and
the pooled lantern explicitly enable `MAIN_PASS_LAYER` — a light left on layer 0 alone silently stops
lighting the merged pass (that is a trap for every future light; `layers.ts` documents it).

**The spec's blit was impossible, as it half-suspected**: the default framebuffer is multisampled and
GL ES 3.0 forbids blitting INTO a multisampled draw buffer — and a blit can't tonemap anyway. The quad
fallback is the primary path.

**The finding the spec missed: the quad's DEPTH write was worth more than everything else in the
section.** The first build had the quad write the capture's depth via `gl_FragDepth` so the water could
depth-test against the presented scene. That one line made the quad cost roughly what the duplicate
scene pass had cost — writing `gl_FragDepth` disables early-z, and into a 4×-multisampled backbuffer it
forces per-sample colour+depth writes for 5 Mpx — so the merged pass measured **net ~0**. The fix:
nobody needs that depth. The only consumer was the water's depth test, and the water shader **already
samples the capture's depth texture** — so in merged mode it discards its own occluded fragments
(`uMergedOcclusion`, first statement of the fragment), and the quad is a colour-only present with
`depthTest`/`depthWrite` off. *The lesson generalises: a fullscreen pass is cheap until it touches
depth; auditing what a pass writes matters as much as what it reads.*

**Measured** (780M; full-flight interleaved A→B→A at 1600×900, drift ≤ 0.2 ms):

| segment | merged | classic | win |
|---|---|---|---|
| overall (12-segment mean) | 8.9 | 9.6 | **−0.78 ms (−8 %)** |
| island-approach | 8.8 | 11.0 | **−2.3 ms (−21 %)** |
| max-stress | 10.4 | 13.0 | **−2.6 ms (−20 %)** |
| open-water segments | — | — | −0.2…−0.7 ms |

At native 3440×1440 the budget's open-water default view wins ~1 ms (10.5–11.0 → 9.9). CPU main-render
submit also fell 0.4 → 0.1 ms (fewer draws). **The win lands exactly where the frame was worst** — the
duplicate cost scaled with the opaque scene, so the terrain-heavy and stress frames improve ~20 % while
an empty sea barely moves. It is smaller than the spec's "5.3 ms" because that figure equated the win
with the whole capture column; the true win is the opaque scene's *main-pass* share minus the quad, and
because on a cool, under-loaded 780M DVFS masks work-reduction (clocks drop, milliseconds stay flat —
the E1 lesson again). On a loaded GPU — the case that matters — removing real work shows.

**Verified pixel-equivalent** — `tools/verify-merged-pass.mjs`, the freeze-once harness with an
interior/edge split diff: interiors match to **0.01–0.03/255 mean** (fp16 quantisation); every pixel
over 2/255 traces a silhouette on the heatmap the tool writes. Edges differ by **AA provenance**,
which is the one real trade:

- **Opaque geometry loses the backbuffer's MSAA** (its edges are baked into the single-sample capture;
  the context's MSAA can only smooth the water now). Spruce and island rims alias where they used to be
  smoothed.
- **Capture MSAA (`Performance → capture MSAA`, `ctx.setCaptureSamples`) restores it and is DEAD as a
  default: +7 ms at 3440×1440** (a multisampled HalfFloat raster + resolve — the same cost family as
  the composer target that bug 3 deleted). It stays as a live dial for strong GPUs.
- The backbuffer MSAA itself is now only smoothing water edges: declining it (`?msaa=off`) saves a
  further ~0.5 ms at 1600×900 — a tier knob, left ON by default for the horizon line.

**Decision left open for Kyle:** whether the opaque-edge aliasing at the shipped default (merged ON,
capture MSAA off) is acceptable to the eye in the live game — flip `Performance → merged main pass`
live to compare. Everything else about the merged pass is strictly better or equal.

### DONE 2026-07-17: the camera-following LOD ocean — **−4.5 ms mean, −7.1 ms max-stress, near field BYTE-identical**

*(Replaces the "NEXT: the camera-following LOD ocean" spec, which is executed. Full log entry with the
A/B table: `perf-experiments.md` 2026-07-17.)*

**What shipped** (`ocean-lod.ts` — pure, unit-tested — + `ocean.ts` + `scene.ts`, default ON, live
dials at `Performance → ocean LOD / quad size / LOD near / LOD extent` + an `ocean grid` readout):
**ONE welded mesh** — a ~512 m dense patch at the shipped ~4.9 m quads plus five concentric rings of
doubling quad size, T-junctions stitched at build time (2:1 fans per coarse cell, L-fans at corners) —
**~52k vertices reaching 16.25 km**, vs ~1.05 M uniform at 5 km. Because it is one mesh, `renderSsr`'s
material swap, the `waterVisible` toggles, layer memberships and the shared-uniform model all carried
over untouched. Per frame the mesh snaps to the camera on the coarsest-quad (156.25 m) lattice and
`uWorldOffset` re-anchors the Gerstner evaluation in **world** space in all three vertex shaders
(main, flat-debug, SSR); every ring's quad divides the snap step, so all vertices land on one fixed
world lattice — the sampled field is bitwise-stable across snaps. The ripple normal map now samples
the world-anchored `vRippleUv` (three's `normal_fragment_begin`/`normal_fragment_maps` chunks spliced
with the UV swapped) in BOTH paths, since geometry-uv sampling would ride the following mesh. CPU
`sampleSurface` needed **no change** — it was already world-space, so the GPU/CPU lock-step contract
held by construction.

**Measured** (`ab.mjs` interleaved, 1600×900, drift ≤ 0.53): down-calm −2.9, grazing-storm −4.9,
island-approach −3.1, **max-stress −7.1 (−66 %)**, **mean −4.5 ms (−55 %)**. The win is vertex work —
a roughly fixed ms at any resolution — and lands hardest in the steep-wave frames, where the SSR pass
billed the plane's vertices a second time. The sea also grew 2.5 → ~8 km radius in the same move,
past the ~5.4 km deck-height optical horizon (the FIDELITY.md corner-curl defect went with it).

**Verified on pixels** (`tools/verify-ocean-lod.mjs`, freeze-frame): the near field is **byte-identical
(max diff 0)** to the uniform grid — at the origin AND at a camera forcing a non-zero (312.5 m) snap,
which is the load-bearing case: it proves the world-offset math in every shader and that snaps cannot
pop. Exactness is by construction (`ocean-lod.ts` copies `PlaneGeometry`'s anti-diagonal cell split, so
the shared lattice rasterises identically). The far field differs by design.

**Traps documented:** a `ShaderMaterial` only uploads uniforms LISTED in its `uniforms` map — sharing
by reference is not enough (`uWorldOffset` had to be added to the SSR material's list or its surface
silently diverges). And `setPlaneSize`/`setQuadSize`/bench `quadSize` now dispatch on the LOD flag —
a uniform-grid sweep (E8-style, `lod-ceiling.mjs`) must pin `setOceanLod(false)` first; `lod-ceiling.mjs`
and `budget.mjs` are updated.

**Not fixed, on purpose:** the far-glitter dotted moiré is identical with LOD on and off — it is
ripple-map minification aliasing (per-pixel, indifferent to vertex density). FIDELITY.md's old claim
that the LOD grid was "the real fix" for it is corrected; the real fix is dual-scale normals / a
distance fade of ripple strength.

### Done 2026-07-12 (was "do these first")

1. ~~Drop `TEST_SHAPES` from the live scene~~ — **done.** It was the biggest single cost in the live
   frame, and it was debug content.
2. ~~The composer target's MSAA, ~4.5 ms — a quality trade~~ — **it was never a trade.** The composer
   only existed to host the display grade; moving the grade into the tone mapper deleted the composer,
   its HDR target, and its MSAA together, and handed geometry AA back to the context's cheap
   driver-resolved backbuffer. See bug 3. *A "decision" is worth one more look at the premise: the best
   outcome of a perf trade is discovering you don't have to make it.*

### Decisions waiting for Kyle — trades, not bugs. Measured, not taken.

1. **Opaque-edge AA under the merged pass.** The shipped default (merged ON, capture MSAA off) trades
   the spruce/rim edge smoothing for the merged pass's win — my recommendation, since capture MSAA
   costs +7 ms at native ultrawide and the win lands in the worst frames. Judge it by eye in the live
   game: flip `Performance → merged main pass` (and `capture MSAA`) live. See the DONE section.
2. **`maxPixelRatio: 2`.** Every fill cost above scales with the pixel count, and the default render
   scale is the device pixel ratio — so Windows display scaling at 125/150 % silently renders 1.6–2.3×
   the pixels these numbers were measured at. **Kyle's call so far (2026-07-19): resolution is the
   most powerful fidelity lever and under-native rendering reads blurry — don't spend it if
   avoidable.** That rules out "cap it lower" as the dev-display answer and leaves an auto quality
   tier for weak GPUs; the dev display's own budget pressure is softened now VRR absorbs the sub-100
   regime (see "Frame pacing"), and headroom there comes from the ranked structural work.
3. **Buoyancy Newton iterations — ~1.7 ms** at 4 → 2. A **fidelity** trade: the sampled waterline drifts
   from the rendered one. At the calm gameplay sea horizontal displacement is tiny, so 2 may be
   indistinguishable — but "may be" is a thing to look at, not assume. ~0 with one raft, so not urgent.

### Open threads — RANKED. A new session starts at #1.

1. **SSR fade-cull — cheap, and pixel-identical BY CONSTRUCTION (unbuilt, unmeasured).** The main
   shader multiplies the SSR sample by a fade that reaches zero beyond 2–4× `uSsrMaxDistance` and at
   extreme grazing (see the `ssrFade` note in `ocean.ts`) — but the SSR PASS still marches those
   pixels, and far-grazing rays are the expensive kind (full-count sky misses). Apply the same test
   pass-side, with a conservative margin for the ripple-offset resample, and the discarded work is
   exactly the work whose output was multiplied by zero. Verify on pixels with the merged-pass
   harness. Bigger sibling: **Hi-Z / hierarchical marching** (same hits, fewer samples — also the only
   lever for the grazing worst case, which E6 proved SSR-off cannot fix).
2. **Terrain worker + CHUNK STREAMING — both DONE 2026-07-17.** `generateChunk` runs in a Web
   Worker, and `terrain-stream.ts` tiles the world to a **12 km radius** in LOD tiers (quadtree,
   hysteresis, swap-on-ready). Measured: ~76 tiles ≈ 2.1 M verts ≈ ~100 MB GPU, full settle ~6 s
   background (~70 ms/tile), and the whole archipelago costs **+1.9 ms GPU** at 1600×900
   (`ab.mjs` terrain on/off — fill-bound held at 20× the old land radius; island-approach is
   +0.5 ms, the land-occludes-water effect again). The bench freezes retiling per run
   (`terrainStreaming` knob measures hitches on purpose); `tools/verify-stream.mjs` is the settle
   + budget + hole check. See "Terrain" and docs/ISLANDS.md for the architecture.
3. **A cheaper terrain material — ceiling ~1.0–1.3 ms at 1600×900, DOWNGRADED from the old 6.3 ms
   headline.** The decisive probe ran 2026-07-15 (see "Terrain"): the bedrock's shading+shadow-receive
   is ~1 ms, and terrain is partly free via occlusion (land that hides water costs ~nothing net).
   Worth having; not worth doing before #1 and #2.
4. **The smoothness tail (felt quality, not avg fps):** a ~2–3 % frame-hitch rate, uniform across
   segments (per-frame allocation/GC suspicion), and 1 %-lows at ~half the average. NB the biggest
   "feels worse than its fps says" case turned out to be the DISPLAY, not the frame — vsync
   quantization at a warm-regime 80 fps on the 100 Hz panel, solved by VRR (see "Frame pacing").
   The hitch tail is still real and still unexplained; hunt here once pacing is ruled out.
5. **Contact-heavy physics is unmeasured.** `--collision off` is free *because the bench hulls never
   touch*. Crowded/touching ships would surface a real collision cost.
6. **No regression gate.** Bench JSON is keyed by git SHA; a gate (fail if p95 rises >X % vs a stored
   baseline) is the natural next step now the numbers are trustworthy and a sweep is one command.
7. **Auto quality tiers** — detect a weak GPU and default render scale / reflection res / capture res
   down. `capture res` is now a live dial and is a legitimate tier knob (it is just not a free default).

### How to re-run

```bash
# THE ITERATION TOOL — is config B cheaper than config A? One page, one warm session, interleaved
# A→B→A with a drift column, ~1-3 min. Configs are BenchmarkConfig JSON (runtime knobs only).
# BOTH configs must pin every key either one touches (state persists between runs; the tool enforces it).
node src/projects/shipwright/tools/ab.mjs --a '{"merged":true}' --b '{"merged":false}'
node src/projects/shipwright/tools/ab.mjs --a '{"quadSize":4.9}' --b '{"quadSize":40}' --passes 3

# the merged-pass pixel-identity guard (interior/edge split diff + heatmaps)
node src/projects/shipwright/tools/verify-merged-pass.mjs

# the LOD-ocean pixel-identity guard (near-field crop must be BYTE-identical, incl. at a non-zero snap)
node src/projects/shipwright/tools/verify-ocean-lod.mjs

# the terrain-worker guard (worker vs sync path must be pixel-identical; also times the per-chunk cost)
node src/projects/shipwright/tools/verify-terrain-worker.mjs

# streaming sanity: settle time, tile/vertex/memory budget, tint-by-LOD + deck-height frames
node src/projects/shipwright/tools/verify-stream.mjs

# the shipped LOD ocean vs the uniform grid, interleaved (the 2026-07-17 headline table)
node src/projects/shipwright/tools/ab.mjs --a '{"oceanLod":false,"quadSize":4.8828125}' --b '{"oceanLod":true,"quadSize":4.8828125}'

# the LIVE shipped frame, and the pie chart of what is in it
node src/projects/shipwright/tools/profile-live.mjs

# the frame budget on the real display: levers STACKED, one warm session (this is the roadmap)
node src/projects/shipwright/tools/budget.mjs            # defaults to the 3440x1440 ultrawide

# what an LOD ocean can actually win (plane held at 5000 m; only tessellation varies)
node src/projects/shipwright/tools/lod-ceiling.mjs 1.25

# what shrinking the scene capture costs the IMAGE (clear water + seabed = the honest stress frame)
node src/projects/shipwright/tools/capture-curve.mjs

# one benchmark run
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

**`?terrain=off` skips terrain GENERATION** (not just its visibility) — ~840 ms off every page load for
any probe that runs without land. A sweep is hundreds of page loads.

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
