# Handoff: water visual fidelity — ripples DONE, chop + lighting NEXT

**Goal.** Improve the sea's realism across the three real-world scales Kyle sails by (Baltic): swells
(good already), **chop / wind sea** (missing), and **ripples / capillaries** (was a bad normal map).
Plus two lighting wishes: the milky washed-white look of sunlight on water/wood, and the "shattered
diamonds" sun-glitter. This session did the ripples; the rest is queued here.

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

1. **Chop (short Gerstner geometry)** — the clear illusion-breaker now: looking out to sea there's
   nothing between the fine ripples and the big swells at the scale of the boat. Add a couple of short,
   steep, multi-heading Gerstner trains (~1–5 m) to `BASE_WAVES`. **Scope before touching code:** it's
   in the *locked* wave math — `sampleSurface` (CPU) must match the GLSL exactly (lock-step) or the raft
   floats off the waves; watch the §gentle-sea buoyancy constraint (steeper short waves start to move
   the hull); and short waves need vertex density, so they'll only resolve near the camera on the LOD
   grid and fade out at distance (fine). See `../sea-conditions.md` (the whole chop/wind-sea model) and
   `../../CLAUDE.md` "Water architecture".
2. **Wind master / sea-condition coupling** — Kyle's "dialing per condition is the tricky part." One
   wind/Force parameter that drives ripple *character* + chop + whitecaps + turbidity together. Ripple
   *strength* already tracks sea state; *character* (which layers dominate, drift speed) is fixed. This
   is `../FIDELITY.md` "collapse sea-state into ONE wind control" — build chop and this as one system.
3. **Milky washed-white sunlight** on water + the raft's wood. Hypothesis (unverified): AgX desaturates
   highlights before they clip, and/or the sky env IBL lays a bright neutral sheen. Needs a focused look
   at captured frames (`tools/shots.mjs`) — do NOT guess at the principled lighting model. Unstarted.
4. **Sun glitter / "shattered diamonds"** — the microfacet sparkle term, `../FIDELITY.md`'s #1 photoreal
   gap. The new procedural ripple field is exactly the sub-pixel normal source it should sample; the
   dual-scale it needs now exists. Natural once chop lands.

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
