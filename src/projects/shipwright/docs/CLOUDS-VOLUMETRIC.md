# Shipwright — volumetric clouds: the spike, what works, the way forward

This document is the deliverable of a long exploratory session on **better clouds**. It is written for a
**fresh session** to pick up from a written plan rather than a tired memory. Read it top to bottom
before touching the cloud code.

All of this lives on branch **`clouds-volumetric`** (off `main`). **Nothing is merged to `main`**, on
purpose — see §6. The heightfield dead-end lives on a sibling branch `clouds-relief`.

---

## 0. Read this first — the verdict

The task was **"make clouds that look like real cumulus,"** because both blind reviewers and Kyle named
clouds the weakest part of the sky (see `docs/SUNSET-JOURNEY.md` §0).

**The look is solved for fair-weather cumulus.** A standalone volumetric raymarch, with the cloud shape
built from **Worley (cellular) noise**, produces fluffy, rounded, domed cauliflower cumulus — a real
summer sky, and a genuinely pretty backlit golden-hour frame. Kyle: *"This is the cumulus clouds I'm
looking for."*

Two things are **not** done, and both are known:

- **It is not optimised.** It marches 48–80 steps of per-fragment Worley, per frame, full-res, in the
  main render. Too expensive to ship as-is (Kyle's GPU can't run it live). The fix is baking (§4.1).
- **It is appearance only.** It is NOT yet wired into the light / shadow / exposure path, so it does not
  cast the dappled cloud shadows on the sea. The old flat-deck genus system still owns the lighting.

So this is a **proven look on a branch**, not a shippable feature. §4 is the plan to make it shippable.

---

## 1. What it is, and the one architectural decision

A **standalone raymarch pass** (`clouds-volumetric.ts`): a dome mesh with a `ShaderMaterial`, added to
the scene and drawn OVER the sky, **not** code inside the sky dome's fragment. That separation is
deliberate and load-bearing:

- The sunset-revert plan (`SUNSET-JOURNEY.md`) will replace the sky *rendering*; a cloud pass baked into
  that shader would have to move with it. A standalone pass composites over whatever sky is underneath.
- It is how sky-cloud-3d, Sea of Thieves, and every modern engine structure clouds — a system, not sky
  code.

It is lit **in lock-step with the scene**: `daylight.onState` feeds it the sun beam (the
`DirectionalLight`'s colour × intensity) and the ambient (the dome's `overcastZenithRadiance`). So the
clouds follow the sun without touching the sky shader.

## The technique (clean-room, from public sources)

A bounded raymarch — the textbook recipe (Schneider "Nubis", Häggström, Bruneton):

- march the view ray through the cloud slab `[base, base + thickness]` in `uSteps` steps (dynamic loop,
  capped at `MAX_STEPS`);
- density from **inverted Worley noise** (rounded cellular bumps = the cauliflower shape) — big Worley
  bumps for the billows, higher-frequency Worley to erode the edges — gated by a broad value-noise
  **coverage** field whose threshold **rises with height** so the footprint shrinks upward into a domed
  crown (not a flat slab). This is the single most important finding — see §2;
- a short `uLightSteps` march toward the sun for self-shadowing (Beer–Lambert), giving lit tops and dark
  bases;
- a two-term Henyey–Greenstein **phase** on the view–sun angle for the forward silver lining;
- **powder** (multiple-scatter deficit) for crisp edges, **height-graded ambient** for bright tops /
  darker bases, and **aerial haze** so distant clouds wash to sky instead of grainy blocks.

**License note:** the parameters were calibrated against **sky-cloud-3d** (non-commercial licence), but
every line here is our own — no third-party shader or asset was copied. The technique itself is textbook
and predates it. Provenance is clean even if the project ever goes commercial.

---

## 2. What was tried, and what each attempt taught

In order, with the lesson. The whole arc is on the two branches.

1. **Heightfield relief** (branch `clouds-relief`). Give the flat 2-D field a height and march the view
   ray through a slab. *Lesson: a single-valued heightfield surface makes crags, not clouds, and a solid
   surface can't do the volumetric light that makes a cloud read as a cloud. Dead end — but it validated
   the architecture (2-D field lights, a richer render on top).*
2. **Bounded volumetric march** (the first `clouds-volumetric` commit). Soft 3-D density + sun march +
   phase. *Lesson: this is the right primitive — puffy clouds appeared immediately. But naive full-res
   per-frame marching maxes the GPU, and the shapes were still off.*
3. **3-D value noise + haze + powder + thinner finely-sampled slab.** *Lesson: killed most grain and
   added distance haze, but the clouds read BOXY — "cubes with rounded corners."*
4. **Worley (cellular) noise — THE fix.** Value/Perlin noise makes smooth lumpy blobs that read boxy;
   inverted Worley's rounded cellular bumps ARE the cauliflower shape of a cumulus. Swapping the shape
   noise to Worley + the height-rising threshold for domed tops was the step that made it look real.
   *Lesson: for cloud SHAPE, the noise choice is everything. Worley, not Perlin.*

---

## 3. The files, the parameters, and how to run it

- **`clouds-volumetric.ts`** — the whole pass: the raymarch `ShaderMaterial`, the Worley/value noise, the
  `CUMULUS` and `STORM` presets, and `createVolumetricClouds()` returning `{ mesh, setLight, setTime,
  setParams, setEnabled, dispose }`.
- **`scene.ts`** — wiring: creates it (off by default), feeds light via `daylight.onState`, advances
  wind/time per frame, and builds the **Volumetric Clouds** lil-gui folder (every param live) + the
  `__shipwright.setVolumetricClouds(enabled, preset)` / `setVolumetricParams(patch)` debug API. Enabling
  it hides the flat deck (`setCloudGenus("clear")`).
- **`tools/vol-shots.mjs`** — capture the four spike framings (cumulus cloudy/horizon/backlit + storm)
  to `.shots/vol-spike/`. **`tools/measure-cost.mjs`** — GPU-ms delta off vs on via `gpuTimings()`.

**Current `CUMULUS` preset** (the good look): coverage 0.5, base 900, thickness 450, absorption 0.06,
featureSize 450 (the Worley bump scale), erode 0.4, steps 48, lightSteps 5, haze 0.0001, sunGain 1.1,
ambientGain 0.8. `STORM` is a first guess only — see §4.3.

**To run:** the branch needs a REAL `npm install` + Turbopack dev server (see the worktree-node-modules
memory — the junction/`--webpack` path is dead). Then `SHIPWRIGHT_URL=http://localhost:<port>/3d-games/shipwright
node src/projects/shipwright/tools/vol-shots.mjs`, or drive it live in the browser via the GUI
(Environment → Volumetric Clouds) / `window.__shipwright.setVolumetricClouds(true, "cumulus")`.

---

## 4. The way forward (the plan)

### 4.1 Bake it — the next step, and it fixes BOTH open problems at once

The per-frame, full-res, per-fragment-Worley march is the cost. Clouds are distant and change slowly, so
**render them into a cubemap that only refreshes when the sun or weather moves** (Shipwright already
re-bakes its PMREM sky env on sun change — same machinery). Then every frame just samples the cubemap:
per-frame cost collapses to ~a texture fetch. And because the bake is amortised over many frames, you can
crank quality *up* (more steps, cleaner) — so **baking fixes perf and the residual grain together.**

At the same time, **bake the Worley noise into a 3-D texture** and sample it (one lookup) instead of the
27-cell cellular computation per fragment — that per-fragment Worley is most of the current cost.
References: three.js `webgl_volume_cloud` (single 3-D noise volume raymarch) and sky-cloud-3d's 96³ volume
noise. Caveat of the cubemap: no parallax for near/overhead clouds — fine for a sea game where clouds are
distant set-dressing.

### 4.2 Wire the light coupling (the "one model" property)

Make the clouds cast the dappled shadow on the sea and feed exposure, as the flat deck does. The density
integrates to a coverage / optical-depth the existing cloud-shadow map and exposure can read, so the
one-model thesis is preserved. Decide then whether the volumetric **replaces** the flat-deck genus system
or the two coexist (cirrus stays flat — see §4.4).

### 4.3 The storm pass

`STORM` reads bright and grainy, not ominous. It needs: lower ambient fill, higher absorption, many more
steps (a thick slab undersamples), and a **look-up-into-the-base** framing. Kyle's insight stands: don't
chase a literal towering cumulonimbus — fake the "big dark clouds rolling in" mood with the absorption +
thickness dials. Its own tuning session.

### 4.4 Tiering (the full cloud system)

Cirrus should stay a cheap flat/2-D layer (volumetric is wasteful for a thin ice veil, and three-era
cirrus looked better anyway — see `SUNSET-JOURNEY.md`). The end state is layered: flat cirrus + baked
volumetric cumulus + a special-cased storm, composited in one pipeline.

### 4.5 Coordinate with the sunset-revert

`SUNSET-JOURNEY.md` §1 plans to restore three.js `Sky`'s rendering for the sunset. Our clouds are a
standalone pass over whatever sky is underneath, so they don't block that work — but both touch the sky,
so sequence with whoever picks up the revert, and don't finalise cloud *colour/compositing* tuning
against the current (soon-to-be-replaced) washed sunset.

---

## 5. Known issues (the honest list)

1. **Residual grain** in mid/far clouds (48 steps; Worley is heavy). Raise steps or bake.
2. **Storm not done** (§4.3).
3. **Appearance only** — no cloud shadows on the sea, not in exposure (§4.2).
4. **Per-frame cost too high to ship** (§4.1).
5. Two cloud systems coexist on the branch (flat deck + volumetric); enabling one hides the other. The
   merge should resolve this into one tiered system (§4.4).

---

## 6. On merging — why this stays on the branch for now

This is a **proven look, not a shippable feature.** Merging it to `main` today would land a second cloud
system that is (a) too expensive for the target GPU, (b) not wired to the cloud shadows the sea relies
on, and (c) off by default — dead, unfinished code on `main` that also collides with the pending
sunset-revert. It earns a merge once §4.1 (bake) and §4.2 (light wiring) are done and it is genuinely
shippable. This follows the project's own pattern: `SUNSET-JOURNEY.md` kept a whole experiment on a
branch, unmerged, behind a handoff doc, until it was production-ready.

---

## 7. Commit map (branch `clouds-volumetric`, newest first)

- `231db57` — **Worley noise makes them fluffy cauliflower.** The shape fix (§2.4). The good state.
- `7f81365` — real-cumulus pass: grain gone, powder + height ambient.
- `3e59f35` — 3-D noise, haze, live GUI, demo-aligned defaults.
- `e9006c2` — the volumetric pass, clean-room spike (first version).
- `4c04fd8` — `main` (base).

Sibling branch `clouds-relief`: the heightfield relief dead-end, preserved as one checkpoint commit.
