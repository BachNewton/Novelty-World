# Handoff: water visual fidelity — sun-reflection look is NEXT (kill the milky wash, add glitter)

**Goal.** Improve the sea's realism across the three real-world scales Kyle sails by (Baltic): swells
(good already), **chop / wind sea** (missing), and **ripples / capillaries** (was a bad normal map).
Plus the **sun-on-water/wood reflection look**, which is the ACTIVE focus now (see NEXT): remove the
milky washed-white smear the sun's specular currently has and replace it with discrete "shattered
diamonds" glitter.

**Active focus (2026-07-19): the sun-reflection look — milky-wash removal + glitter.** Chop and the
wind master are **deferred** this session: Kyle has physics work incoming that will touch the wave
math, and chop lives in that *locked* CPU/GPU wave field — building it now would collide. So this
effort narrowed to the two *pure lighting/render* items (no physics coupling): kill the milky wash and
add the glitter. The ripple perf measurement also stays parked (see the earlier DONE block).

---

## DONE this session — procedural ripple normal (working, ON by default)

Replaced the sampled `waternormals.jpg` (which was **crumpled-foil crinkle, not water**, with a baked
seam and chop-scale features) with a **per-fragment procedural normal**. All in `ocean.ts`:

- `OCEAN_RIPPLE_PROC` — analytic gradient noise (Hoskins hash + IQ `noised`); the slope comes free so
  the normal is exact. `rippleSlope()` sums **dual-scale** layers: fine ~0.35 m (leads), ~0.16 m glint
  octave, coarse ~1.8 m undulation. Layers scroll different directions → shimmer (reads as wind drift),
  not a sliding sheet. Seamless (no tile), uniform-scale (no baked photo perspective), animated.
- **Far-field antialiasing:** `rippleAA()` Nyquist-fades each layer once a pixel spans its wavelength,
  keyed off `fwidth(vRippleWorld)` — so it tracks **zoom**, not just distance, and fading capillaries
  at range is physically correct. This killed the "TV-static at distance" the first cut had.
- **Integration:** spliced into three's `<normal_fragment_maps>` (`USE_NORMALMAP_TANGENTSPACE` branch)
  behind `uProcRipple`. **Reflection:** the SSR pass marches off the smooth wave normal, and the main
  shader adds ripple as a GENTLE screen-space blur (`uReflectDistort` ≈ 0.012) from the procedural slope;
  the "wave smear" term was deleted and marching the fine ripple was tried + rejected (see Gotchas).
- **New varying** `vRippleWorld` (world-metres XZ) written in `OCEAN_BEGINNORMAL`; `uTime` added to the
  fragment pars.
- Ripple strength already rides `normalScale` (via `applyRippleStrength`, tied to wave height) — so it
  eases toward a mirror as the sea calms. Kyle: "good enough for now."

**Debug toggle:** Sea → Surface → **procedural ripples** (on = ripple, off = flat). The ripple normal
is now **fully procedural** — the JPG texture files and the ripple-map switcher were **deleted**
(2026-07-19). A **1×1 dummy normal** stays bound as `material.normalMap` for one reason only: three
emits the tangent-space normal chunk we splice the procedural normal into (and its tangent frame) only
when a normalMap is bound. It is never sampled. **far roughness (WIP)** remains a parked toggle (see
Decisions).

**Perf is UNMEASURED** — it trades a texture fetch for ~3 noise evals/fragment over full-screen water.
Tracked as an unranked open thread in `../PERFORMANCE.md`; measure via `tools/ab.mjs` toggling
`uProcRipple` before this ships. Full feature write-up in `../FIDELITY.md` "Procedural ripple normal".

---

## DONE this session (2026-07-19, continued) — wood in shots + a reflection red herring

- **The raft's wood is now in the shot suite (`07-wood` group).** The milky wash hits wood too, so it
  needs to be reviewable. Added a **`raft` flag to `__shipwright.setVisibility`** (`scene.ts`): it shows
  the gameplay raft statically at a deterministic, level pose (`physics.respawn()` + a dt=0 `update`, the
  same recipe the benchmark's visuals mode uses — RAFT spawns level just above its waterline via
  `spawnOverride`). `shots.mjs` gained `raftDeck`/`raftClose` cameras and 5 scenarios (sun 4/12/25/50 +
  a close plank-grain detail), off by default like islands so the frozen baselines are untouched. The
  wood-plank material is the shared `woodMaterial` in `physics.ts`. Reference: `07-wood/detail-e20`
  (sun-facing far deck planks visibly wash pale — the wood half of the milky-wash defect).

- **"Occasional red/blue flash outline in SSR reflections of the buoys" — RESOLVED, it was NOT a render
  bug.** It is the terrain **loading-tile debug overlay** (wireframe boxes: **blue** = queued,
  **orange** = generating; `terrain-stream.ts`, `showPending` default ON) being **faithfully reflected**
  by SSR on first load while tiles stream in. The SSR is correct; the debug overlay just shouldn't be in
  the reflection. Ruled out the ripple-distort offset first by **amplifying** `uReflectDistort` 6.7× (no
  fringe appeared → not the cause); the reverted-clean diagnostic and Kyle spotting the real cause closed
  it. **Attempted fix + why it's reverted:** moved the placeholders to `MAIN_PASS_LAYER` (draw in the
  main pass, not the scene capture) → killed the reflection, **but** the merged main pass presents the
  world as a **depth-less quad**, so main-pass objects have no world depth to hide behind and the lines
  drew **over everything** (z-order regression). Reverted to original (depth-correct, reflected-on-load).
  **Left as a parked decision** (low priority — a dev overlay): see the new Gotcha "loading-tile
  reflection".

---

## NEXT — the queued work, in rough priority

**SSR reflection ripple — RESOLVED (2026-07-19), do not reopen.** We tried the "honest" version —
folding the ripple normal into the SSR pass's reflection **ray** (marching off the ripple-perturbed
normal). Tested at full fidelity (100% reflection res + 48 march steps) and it **shatters coherent
object reflections into noise**, because reflecting off the steep fine-ripple normal (~40° tilt at
peaks) sends neighbouring pixels in wildly different directions — a ray-*direction* problem that more
march steps CANNOT fix (steps only sharpen each ray's hit). Real-time SSR has no temporal denoiser to
clean a rough reflection the way offline renderers do. So the **screen-space "ripple blur" is the
correct approach, not a hack**: march the coherent base reflection off the smooth WAVE normal, then
jitter the sample by a GENTLE fine-ripple slope (`uReflectDistort` ≈ 0.012, from the procedural field).
The "wave smear" term was deleted (it double-counted the wave tilt the march already applies). The
experiment + its uniforms/varyings/GUI were removed. **Perf-tuned (Kyle, live):** 0.25 reflection res is
the floor (lower flickers), march steps landed at **31** for reflection-shape fidelity (lower dissolves),
and `SSR_STEPS_MAX` was **baked to 31** so the loop runs exactly that with no uniform-break overhead.
Going cheaper than this needs a *different technique* — SSPR — which needs **WebGPU compute** (deferred:
migrating for reflections alone is the tail wagging the dog; decide WebGPU on its broad merits).

**These two (1 + 2) are ONE system and the active focus — they're the same phenomenon (the sun's
specular reflection), across sun elevation.** Grounded in captured frames this session: the glitter
ladder (`shots.mjs "front"` → all `*-front` frames) and the new **`07-wood`** wood group (see below).

1. **Milky washed-white sun reflection — REMOVE it. (Corrected understanding — the previous handoff had
   this backwards.)** The sun's specular on **both water AND the raft's wood**, when the surface is
   angled toward the sun, currently washes to a low-contrast **milky white** — and Kyle wants that
   **removed**, not added. ⚠️ It is **NOT** the Caribbean bright-overhead wash (the intense high-sun
   look Kyle *does* like — that is OUT OF SCOPE this session; do not touch it). Because the wash hits
   **wood too**, the cause is almost certainly **global** (tonemap / IBL), not the water shader —
   leading hypothesis is **AgX pushing bright highlights toward white before they clip**; `physics.ts`
   even records a prior "the deck went white" fight (wood roughness + light balance) that this is a
   residual of. **Do NOT guess** at the lighting model (locked: no per-material exceptions): isolate the
   cause by A/B (AgX↔ACES, env/IBL intensity, grade) on a sun-facing wood+water frame. See reference
   frames: `01-sun-heading/e25-front` (water milky smear), `07-wood/detail-e20` (wood deck washes pale).
2. **Sun glitter / "shattered diamonds" — ADD it (the desired replacement for the wash).** Same
   phenomenon across the day: at **low/sunset** sun a coherent *smear* is physically correct, but ours
   is **overdone + mis-coloured** (too pale — the AgX whitening again — tighten it + warm it); as the
   sun **rises** it should break into **discrete sparkles**, but ours stays a milky smear. Geometric
   cause of the missing sparkle: one shading normal/pixel + `roughness 0.4` averages the sub-pixel slope
   variance into a wash. Needs a **microfacet glint term** feeding on sub-pixel normal *variance* — the
   procedural ripple field (`OCEAN_RIPPLE_PROC`, dual-scale) is exactly the source it should sample. HDR
   glints then read as diamonds. `../FIDELITY.md`'s #1 photoreal gap.
3. **Chop (short Gerstner geometry) — DEFERRED this session (physics work incoming).** Still the clear
   illusion-breaker (nothing between fine ripples and big swells at boat scale), but it lives in the
   *locked* CPU/GPU wave math (`sampleSurface` must match the GLSL lock-step or the raft floats off),
   which Kyle's incoming physics work will churn — so it waits. Scope when it's time: short, steep,
   multi-heading Gerstner trains (~1–5 m) in `BASE_WAVES`; watch the §gentle-sea buoyancy constraint;
   short waves only resolve near-camera on the LOD grid. See `../sea-conditions.md`, `../../CLAUDE.md`
   "Water architecture".
4. **Wind master / sea-condition coupling — DEFERRED, build WITH chop.** One wind/Force parameter
   driving ripple *character* + chop + whitecaps + turbidity together. `../FIDELITY.md` "collapse
   sea-state into ONE wind control".

---

## Decisions made this session — do NOT relitigate

- **Procedural beat every photo** (blind A/B): the crumpled JPG, the OGA sea normals (baked camera
  perspective → won't tile flat), AND the three.js default. Procedural is the direction.
- **`far roughness` (`uFarRough`) is parked OFF.** A uniform distance→roughness ramp kills the far
  mirror but also flattens the sun-glitter path (the thing we want to ADD), so it's the wrong lever
  alone. Revisit it as the *partner* to the AA fade (fading ripples flat far → it keeps the far field
  matte instead of mirror) once glitter/chop land. Values are pre-tuned behind the toggle.
- **Working style (important):** Kyle wants concrete value *picks* with rationale, applied live, and he
  judges the RESULT — never a rack of sliders to "tune to taste." Own the calibration.
- **Milky washed-white on the sun's reflection is a DEFECT to REMOVE, not a look to add (corrected
  2026-07-19).** The previous framing of it as a "wish" was wrong — Kyle clarified it's unwanted, on
  water and wood. It is DISTINCT from the Caribbean bright-overhead wash he DOES like (out of scope; do
  not touch). See NEXT #1–2.
- **Chop + wind master are deferred until the incoming physics work settles** (they live in the locked
  wave math it will churn). This session is milky-removal + glitter only. See the intro.

## Gotchas
- **SSR reflection ripple is a GENTLE screen-space blur, and that's final** (see the RESOLVED note in
  NEXT). It took a long thrash to land: raw procedural slope ~3× too large (smears wide, misses geometry
  → islands stop reflecting); then marching off the fine normal (noise — the real lesson). What works:
  the base reflection marches off the smooth WAVE normal, then `uReflectDistort` (≈0.012) jitters the
  sample by the *normalized* procedural ripple slope. Two rules the thrash taught: (1) the reflection
  distortion must be GENTLE and the procedural slope is ~3× a normal-map's xy, so keep `uReflectDistort`
  small; (2) do NOT feed the reflection the full fine ripple (whether by marching or a strong nudge) —
  coherent object reflections shatter. It is a cheap proxy that need not perfectly match the surface.
- **GLSL splice** targets three's chunk text verbatim (currently r185) — a version bump can silently
  break the `.replace` (it degrades to a flat normal via the else-branch, not a crash — the water goes
  mirror-flat). Re-check the target on upgrades. Same for the 1×1 dummy normal: if a three change stops
  a bound normalMap from emitting `USE_NORMALMAP_TANGENTSPACE`, the splice target vanishes → flat water.
- **km-scale precision:** the hash `mod()`s its domain so noise stays stable as the world-anchored
  coordinate roams to kilometres; raw `sin`-hashing bands out there.
- **Verify GLSL without the dev server:** compile the shader in headless Chrome via Playwright
  (`chromium.launch({ channel: "chrome" })` + a WebGL2 `getContext`/`compileShader` check) — catches
  syntax errors before handing over. (Playwright's own browser isn't installed; use system Chrome.)
- **Loading-tile reflection is a PARKED decision, not a bug (2026-07-19).** The blue/orange loading-tile
  boxes (`terrain-stream.ts`, `showPending` default ON — Kyle keeps it on in dev) are SSR-reflected on
  first load and clutter the whole horizon for the ~6 s stream. Moving them to `MAIN_PASS_LAYER` fixes
  the reflection but breaks depth (merged main pass presents the world as a **depth-less quad**, so
  main-pass objects can't occlude against the world → they draw over everything). A clean fix needs one
  of: **(A)** limit placeholders to near tiers (`e.spec.tier <= NEAR_READY_TIER`) — kills the horizon
  clutter + shrinks the reflection to a brief near blip, ~1 line, but hides far pending tiles; or **(B)**
  give the lines the water's capture-depth occlusion (`uMergedOcclusion`-style discard) → unreflected
  AND occluded, more work. Low priority; Kyle's call which (or leave it).
- **Shot probes that `import` a package (playwright/three) must live in the project tree**, not the
  scratchpad — a bare import can't resolve `node_modules` from there (`ERR_MODULE_NOT_FOUND`). Drop a
  `_probe.mjs` next to `shots.mjs`, run, delete. Also: `npx playwright install chromium` may be needed
  after a dep bump (the browser revision moved 1223→1228 this session).
