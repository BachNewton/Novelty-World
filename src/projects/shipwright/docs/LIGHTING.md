# Shipwright — Lighting

The brief for the **lighting overhaul**. Companion docs: `FIDELITY.md` (how the water looks),
`ISLANDS.md` (how the land looks), `sea-conditions.md` (the wave spectrum), `PERFORMANCE.md` (cost).
This one owns **the light itself** — sun, sky, exposure, shadows — for every object in the scene.

**Keep it updated as the overhaul lands.** Blind reviewer agents are grounded in this file.

---

## The thesis: one model, no exceptions

> If the lighting changes, **every** object in the scene must respond to it naturally, physically, and
> correctly. There is never a lighting model for some objects and another for the rest.

That is the whole point of the overhaul. It is not a style goal, it is a correctness goal, and it is
falsifiable: `grep -r envMapIntensity src/projects/shipwright` must return **nothing** when this work
is done. Today it returns the land's hack, and the islands and the buoys consequently read as though
they were photographed in different scenes.

## The bug that started this

Measured on a sun-facing slope at fixed exposure, each source isolated, converted out of sRGB to
linear:

| source | setting | linear contribution |
|---|---|---|
| directional sun | `intensity 2.5` | 0.005 |
| hemisphere | `intensity 0.5` | 0.002 |
| **PMREM sky env** | `environmentIntensity 1.0` | **0.098** |

**The sky out-lights the sun ~21 : 1.** Physically it is the other way round: direct sun on a facing
surface is ~100 klx against ~10–20 klx of skylight, i.e. roughly **5 : 1 the other way.** We are
inverted by about two orders of magnitude. Consequences, all observed:

- The sun contributes **1–8 % of the land's brightness at every azimuth tested.** Lit from all sides
  by a bright dome, rock has no form.
- **Shadows have almost nothing to remove.** They were switched on and were invisible.
- `sunLight.intensity` is a **constant, all day** — while exposure, veil, and env intensity are all
  already elevation-driven. At 4° elevation the real beam has crossed ~12 air masses; at noon, ~1.

### Every "auto" curve today is a patch on that one number

Read `scene.ts` with this in mind and the three curves confess:

- **`envIntensityForSun`** eases `scene.environmentIntensity` 1.0 → 0.45 as the sun climbs, to fight a
  near-white specular sheen. That sheen exists *because the env is too strong relative to the sun*.
  Under a correct balance this curve should not need to exist.
- **`veilForSun`** is the water body's downwelling brightness, and its own comment says the magnitudes
  are "perceptual choices (not derived)". Under a correct balance the veil is **derivable**: it is the
  downwelling irradiance just under the surface,
  `E_d ≈ (1 − F(θ)) · (E_sun · cos θ_refr + E_sky)`. The water's optics (`a`, `b`, `B`, Gordon's `R∞`)
  are already real physics — the light driving them should be too.
- **`exposureForSun`** is a key-value heuristic (`key / (ambient + sin(elevation))`). Under a physical
  rig it becomes a real exposure derived from scene luminance / EV.

**So the deliverable is not "tune the sun brighter." It is: fix the balance, then delete the patches
that only existed to hide it.** If the overhaul lands and all three curves survive unchanged, it did
not land.

---

## This is a GENERAL lighting system, not a Finnish one

The model takes **sun elevation**, not latitude. Latitude only determines the *trajectory* elevation
follows across a day and a year — and that layer bolts on later via a solar-position library. So a model
that is correct across the **full elevation range** is automatically correct everywhere on Earth.

> Finland is **content**. The physics is not. A lighting system strong enough to make the Archipelago
> Sea look right at 6° will make Costa Rica look right at 88°, and it must do both without a single
> per-region constant.

This has three consequences the reviewer must enforce:

- **No hand-fitted constants over elevation bands.** This is the real objection to `envIntensityForSun`
  (which lerps over `30°…90°`) — not that its range is unused in Finland, but that a band-fitted fudge
  is not a model. Derive from air mass; do not lerp between eyeballed endpoints.
- **The sweep must cover 0°–90°**, not stop at Finland's 53.4° maximum. The tropics are the *harsher*
  test: white sand at ~0.9 albedo under a zenith sun over Jerlov I water is the worst case for
  "blacks stay black, hues stay hued" and for highlight clipping — exactly the failures being fixed.
  Deleting the high-sun frames would delete the hardest ones.
- **Twilight below the horizon must also work**, because at high latitude that is most of the year.

Finland gets the **hero frames and the reviewer's attention**, because it is what ships first. It does
not get to define the model's domain.

---

## Twilight is IN scope. Night is NOT. Here is the line.

They are different problems, and conflating them is how this task doubles in size.

### Twilight (0° → −18°) — **in scope, and mandatory**
Below the horizon there is **no direct beam**, only sunlight scattered by the atmosphere. It is the same
model with the beam at zero, and it is the strongest test in this document: if anything still looks
sun-dependent at −6°, the model is lying somewhere. The elevation ladder already demands it.

Today the sun cannot go below 0° — **the debug GUI slider and the `setSun` API both need extending to
−18°.** That is a hole in the brief, not a new feature.

Three things must be right, and none is optional:

- **The beam vanishes correctly.** Zero for `h ≤ 0`, with a soft transition across the sun's angular
  radius (~0.27°). Note that atmospheric refraction (~0.57° at the horizon) means the sun is
  *geometrically* below the horizon at the moment you watch it set — worth getting right, it is free.
- **Preetham is undefined for a sun below the horizon** and will not degrade gracefully. Do not let the
  sky snap to black at 0°. Handle it deliberately (e.g. clamp the sun to the horizon inside the sky
  model while scaling total sky radiance down a twilight curve, or blend toward a measured twilight
  gradient), and **write down what you chose and why** in this doc.
- **Exposure must not run away.** `exposureForSun`'s `AMBIENT_FLOOR = 0.2` exists purely because there
  is no night model. Replace it with a principled floor grounded in real illuminance: civil twilight
  ~3–300 lux, nautical ~0.008–3 lux, full moon ~0.25 lux, starlight ~0.001 lux.

### Night proper (sun < −18°) — **out of scope tonight**
Night is not a sun problem. It is **new light sources** — moon, stars, airglow, later lanterns and
ship's lights. That is content, not the lighting model.

The point of a correct model is that adding the moon later is *trivial*: a moon is just another
directional light with its own env map and its own (much smaller) irradiance. **If adding it later is
painful, the architecture was wrong.** So instead of building it, build the seam:

- **Nothing may assume there is exactly one directional light.**
- **Nothing may divide by the sun's intensity**, or by anything that reaches zero below the horizon.
- The sky's radiance and the exposure must be driven by *the scene's actual light*, not by
  `sunLight.intensity` specifically.

### And one decision that is NOT the agent's to make
Physically correct night is **nearly black** — starlight is ~0.001 lux, a millionth of daylight. A
faithful night is unplayable without eye adaptation or a deliberate artistic lift, and *that is a design
call for Kyle*, not something to invent unattended at 3am. Get the physics right down to −18°, expose a
single adaptation / night-lift parameter, and **do not invent a night look.**

## What the model must handle

The first sea is Finland, latitude ≈ **60° N** (sun never above ~53.4°, midwinter noon ~6.6°). Full
day/night and seasons are **out of scope now**, but the model must be *shaped* so they drop in without a
rewrite — and must already be correct at tropical elevations it has not yet been asked to render.

- **Bright clear summer day** — high sun, hard shadows, ~5:1 sun:sky.
- **Golden hour and red/orange sunset** — long air mass, strongly reddened and dimmed beam,
  sun:sky approaching parity. Warm hues must survive the tonemap (see "Highlights", below).
- **Overcast** — a near-uniform luminance dome, **no sun disc**, no cast shadows, low contrast, cool
  neutral. This is *not* a dim clear sky. See "Overcast is a cloud parameter, not a second system".
- **Winter twilight / white nights** — at 60° N the sun spends hours near the horizon. Long, dim,
  strongly reddened light; blue-hour skylight after the sun sets.

### The sun's interface stays `(elevation, azimuth)` — DECIDED
Do **not** build solar-position math. `(elevation, azimuth)` is the *output* of that calculation, and
`(latitude, longitude, date, time)` is its input; an off-the-shelf npm library (e.g. `suncalc`) does
the conversion correctly and for free. So the contract for this overhaul is: **make the lighting model
correct across the full range of elevation and azimuth**, and geolocation / date / time bolt on later
at near-zero cost. This also keeps `tools/shots.mjs` and `tools/bench.mjs` deterministic — they drive
the sun directly, and their determinism depends on that setter existing.

Practical consequence: the model must be **verified across the whole elevation sweep**, including the
negative/near-zero elevations that a 60° N winter actually spends most of its day in. Do not tune only
at noon.

---

---

## Overcast is a cloud parameter, not a second system — DECIDED

Overcast **is** sunlight: a thick cloud layer scatters the beam into a near-uniform dome. So a correct
model needs no overcast *system*, only a cloud **optical depth τ** that everything reads from.

Why Preetham can't do it on its own: it is an analytic fit to **clear-sky** radiance parameterised by
**turbidity**, and turbidity is *haze and aerosols*, not cloud. Raising it gives a milky bright sky with
the sun disc still burning through. Hosek–Wilkie is a better clear-sky fit (horizon, ground albedo) with
the same limitation. **Neither is an overcast model.** Keep Preetham; add τ.

**⚠ We already have clouds, and they are the same disease as the buoy/island seam.** `scene.ts` sets
`cloudCoverage = 0.4`, `cloudDensity = 0.5` — patched into the Sky shader and baked into the PMREM. So
clouds change how the sky *looks*, and weakly how objects are lit. But **nothing tells `sunLight` that
the sun is behind a cloud.** Drive coverage to 1.0 today and the sun still blazes at full strength,
casting hard shadows through an overcast sky. The picture and the light disagree.

The unification, all driven by one τ:

- **Direct beam** attenuates through the cloud slab along the sun's path:
  `E_sun *= exp(−τ / sin h)`. At high τ the beam → 0, and cast shadows vanish *because there is no
  beam*, not because a flag was set.
- **The removed energy re-emerges as diffuse.** Blend the sky's radiance distribution from Preetham
  toward the **CIE Standard Overcast Sky**: `L(θ) ∝ (1 + 2·cos θ) / 3` — zenith ≈ 3× the horizon, no
  disc.
- **Cloud albedo** bleeds off what is reflected back to space, so a fully overcast day lands at roughly
  **10–25 % of clear-sky illuminance** rather than at parity. Do not conserve energy exactly.
- **The same τ drives the existing painted clouds**, so what you see and what lights you finally agree.

**Overcast is the acid test of this whole document.** Push τ up: the sun goes to zero, the shadows go
with it, the dome flattens, and *every object must still look right, together*. If any object needs a
special case at τ = 1, the model is wrong.

### The cloud shadow map, and the ONE sanctioned way to touch every material
The same cloud field, evaluated on a plane and projected from the sun into a small render target
(512²–1024², refreshed at ~15 Hz — well under 0.1 ms), gives **moving dappled light** sweeping across
the sea and the islands. It is the single cheapest atmosphere in this document.

It has to multiply the sun's contribution on **every** object. The tempting route is patching each
material, which is precisely the mistake that produced the buoy/island seam. **The sanctioned route is
a single global override of three's `lights_fragment_begin` `ShaderChunk`**, so every
`MeshStandardMaterial` in the project picks it up from one place. One patch, one model, no per-object
exceptions. It also drops straight into a volumetric shaft march later.

---

## Clouds: genera, not a density slider

three's `Sky` already grows clouds from multi-octave value noise, already projects them onto a plane at
altitude (`cloudUV = direction.xz / (direction.y * elevation)`), and already scrolls them
(`cloudUV += time * cloudSpeed`). So they have parallax and they move. What they lack is why they only
ever look like **cirrus**:

```glsl
float cloudNoise   = fbm( cloudUV * 1000.0 );                                  // 2D — no thickness
float cloudMask    = smoothstep( 1.0 - cloudCoverage, ...+0.3, cloudNoise );   // fixed 0.3 edge width
float sunInfluence = dot( direction, vSunDirection ) * 0.5 + 0.5;              // VIEW angle only
```

**No thickness, no self-shadowing, no phase function.** A cloud can never have a lit top and a dark
base, because nothing samples the cloud's own depth toward the sun. Raising `cloudDensity` only slides
a threshold, and the noise floods into a flat opaque smear. Cirrus reads well because cirrus genuinely
*is* a thin, flat, backlit sheet with no self-shadowing — the model's limitations are cirrus. Cumulus
violates every one of those assumptions.

We do **not** need to simulate clouds. We need a sailor to recognise what he is looking at, and the
light to match it. Five cheap additions get stratus, cumulus and cumulonimbus out of the same 2D field:

1. **Treat the noise as THICKNESS, not a mask.** Transmittance `T = exp(−τ · h)`: thick is dark, thin
   is translucent.
2. **Self-shadow with 2–4 taps** of the same noise, offset along the sun direction in cloud-plane UV.
   This alone produces lit tops and dark bases — the single biggest step from "smear" to "cumulus".
3. **Beer–Powder** for dark interiors with bright thin edges, and a **Henyey–Greenstein phase** term on
   the view–sun angle for the silver lining when backlit. Both are a few instructions.
4. **Edge sharpness as a parameter** (the smoothstep width), not a hardcoded `0.3`: sharp cauliflower
   edges for cumulus, soft featureless for stratus.
5. **Noise character + layers.** Billow noise (`1 − |noise|`) for cumulus; strongly wind-sheared
   anisotropic sampling for cirrus; low-frequency low-contrast for stratus. Two or three layers at
   different altitudes, composited back-to-front, is most of a real sky.

### Genus presets, and the light each one implies
One parameter set per genus — and because the **same τ feeds the lighting**, the light follows the sky
automatically. This is the "one model" property paying out.

| genus | altitude | τ | what the light does |
|---|---|---|---|
| **Cirrus / cirrostratus** | high | ~0.1–0.5 | sun disc still visible (halo); shadows barely soften; illuminance almost unchanged |
| **Fair-weather cumulus** | low | high locally, coverage 0.2–0.4 | **dappled** — the sun blinks in and out. The cloud shadow map earns its keep here |
| **Stratus / stratocumulus** | low | ~10–40 | no disc, near-uniform dome, no cast shadows, **10–25 % of clear-sky illuminance**, cool grey |
| **Cumulonimbus** | towering | enormous | near-black base, violent contrast, dramatic shafts through gaps, steel/green cast |

A Baltic sailor sees mostly low stratus and stratocumulus, fair-weather cumulus, cirrus ahead of a
front, and cumulonimbus in a squall. Those four are the target.

**Later coupling (not now):** `FIDELITY.md` notes that scattering `b` should rise with sea state, and
`sea-conditions.md` owns the wave spectrum. Weather ought eventually to drive cloud genus, wave
spectrum, and water turbidity together. Build the seam; don't wire it yet.

---

## Targets (the acceptance criteria)

These are numbers, not vibes. The overhaul is judged against them first, and against reviewer eyes
second.

1. **Sun : sky irradiance ratio, DERIVED — not eyeballed.** Do not lerp between hand-picked endpoints;
   that is the fudge we are removing. Compute it.

   - **Air mass.** `AM ≈ 1/sin(h)` is the cheap form; use **Kasten–Young** near the horizon, where
     `1/sin(h)` diverges and is wrong by a factor of ~1.5 below 2°.
   - **Direct normal irradiance** collapses with air mass. The standard clear-sky approximation
     (Meinel & Meinel) is all you need:
     `DNI(AM) ≈ 1353 · 0.7 ^ (AM ^ 0.678)  [W/m²]`
   - **Diffuse horizontal irradiance** on a clear day is ~10–15 % of GHI near noon (≈110 W/m²), and
     falls toward ~30 W/m² near the horizon. Measure what the engine's Sky actually delivers with the
     probe; any standard clear-sky diffuse model (Haurwitz, Ineichen) is fine. The *shape* matters more
     than the exact constant.

   **State the surface orientation, or the ratio is meaningless.** Define the target on a **horizontal
   diffuse surface** (the sea, a deck, flat rock), where the beam is foreshortened by `sin(h)`:

   `ratio(h) = DNI(AM(h)) · sin(h)  :  DHI(h)`

   | sun elevation | AM | DNI (W/m²) | beam on horizontal | target ratio (sun : sky) |
   |---|---|---|---|---|
   | 90° (tropics, zenith) | 1.0 | ~947 | 947 | **~8.5 : 1** |
   | 53° (Finnish maximum) | 1.25 | ~893 | 713 | ~6.5 : 1 |
   | 30° | 2.0 | ~765 | 383 | ~3.5 : 1 |
   | 22° | 2.7 | ~676 | 253 | ~2.5 : 1 |
   | 15° | 3.9 | ~553 | 143 | ~1.6 : 1 |
   | 10° | 5.8 | ~421 | 73 | **~1 : 1** |
   | 7° | 8.2 | ~306 | 37 | ~0.6 : 1 |
   | 4.5° | 12.7 | ~184 | 14 | ~0.3 : 1 |
   | 0° | ~38 | ~20 | 0 | 0 : 1 |
   | below 0° | — | 0 | 0 | **0 : 1** — skylight only |
   | overcast (any h) | — | ≈0 | ≈0 | **0 : 1** — no beam at all |

   Today the measured ratio is about **1 : 21** — inverted at *every* elevation. Note that on a
   *sun-facing* surface (the probe that found the bug) the ratio is higher, since the beam is not
   foreshortened; report which surface you measured.

2. **Zero per-material lighting exceptions.** `grep envMapIntensity` → empty. Delete the land's hack
   and `Terrain.setEnvironment` (`terrain.ts`). If any object needs a special case, the model is wrong.

3. **Shadows are real and universal.** Every opaque object casts and receives: terrain, spruce, buoys,
   raft, voxel ships, the sailor. Today only the terrain does. (The ocean deliberately does **not**
   receive — reconciling that with the screen-space composite is out of scope here.)

4. **The blacks stay black and the hues stay hued.** Per project `CLAUDE.md`: at noon, colours are
   bright but naturally less punchy, and **an unphysical washed/grey-black look is a bug, not a style
   choice.** Judge against real sun and sky optics, never against the brand palette.

5. **No visual regression in the water.** The sea is the most-tuned part of the project. Capture a
   full `tools/shots.mjs` baseline *before* touching anything; every frame in groups 01–04 will change,
   and each change must be defended as more physical, not merely different.

### What should get BETTER, for free, if this is done right
`FIDELITY.md` lists two open water complaints that are very likely the same root cause:
- **"Sun glitter is a milky, low-contrast smear"** at mid/high sun — a sun-too-weak symptom.
- **"Noon goes white"** — the sheen half is `envIntensityForSun`'s reason for existing.

If the overhaul lands and the glitter does not improve, the diagnosis was wrong. Say so.

---

## Scope: what is locked, what is negotiable, what is fair game

Over-locking is as dangerous as under-locking: this overhaul may genuinely need to reach across the
renderer. So the boundary is drawn in three tiers, not one.

### Tier 1 — HARD LOCKED. Do not change. Do not "improve".
Each was decided the slow way and the reasoning is in the project `CLAUDE.md`. If you believe one must
change, **stop and write the argument here first** — do not change it silently.

- **The analytic Gerstner surface** and its CPU/GPU lock-step (`ocean.ts` `sampleSurface`). Not a
  lighting concern.
- **1 world unit = 1 metre.** Ocean dispersion `ω = √(gk)` only looks right at real scale.
- **SSR, not planar reflection.** Planar reflection is fundamentally incompatible with a
  vertex-displaced surface; this was proven the hard way and `reflection.ts` was deleted.
- **Vanilla three.js on WebGL** (not R3F, not WebGPU).
- **The water's inherent optical properties** — Jerlov `a`, `b`, `B` and Gordon's `R∞` (`ocean.ts`
  `WATER_TYPES`). These are real physics, validated against real Secchi depths with the measuring-pole
  rig. The *light* falling on the water is yours; its *absorption and scattering coefficients* are not.

### Tier 2 — NEGOTIABLE. Changeable, but only with a written justification in this doc.
These exist for real reasons that are easy to miss and expensive to rediscover.

- **⚠ Where the water composite sits in the pipeline.** Today the refraction/absorption/SSR composite
  runs **after `<tonemapping_fragment>`**, because the shared scene capture comes back already
  tone-mapped (three tone-maps in-material regardless of render target), and matching spaces avoids a
  double tone-map.

  **This is the one Tier-2 item that is EXPECTED to change.** A physically-based rig — and bloom in
  particular — wants everything in **linear HDR until a single tonemap at the very end**. The likely
  correct move is: render the scene capture with `NoToneMapping` into a HalfFloat target, composite the
  water in linear, and tonemap once at the end. That also lets the veil become a real downwelling
  irradiance instead of a display-space fudge. It is the trickiest integration point in the project —
  do it deliberately, and A/B it. Do not naively "fix" the current arrangement without understanding
  why it exists.
- **The single shared scene capture** (one colour+depth target feeding refraction, absorption and SSR).
  Cheap and load-bearing for performance; don't multiply passes without measuring.
- **ACES tone mapping.** See the tonemap A/B below.

### Tier 3 — FAIR GAME. This is the overhaul's actual surface area.
- `sunLight` — intensity, colour, and its (currently absent) elevation dependence.
- `hemiLight` — **seriously consider deleting it.** The PMREM sky env already supplies sky ambient;
  a hemisphere light on top of it is double-counting the sky, which is part of how the balance got
  inverted in the first place.
- The `Sky` object, its `turbidity` / `rayleigh` / `mieCoefficient` uniforms, its **existing cloud
  uniforms** (`cloudCoverage`, `cloudDensity`, `cloudElevation`), and the PMREM bake.
- `scene.environmentIntensity`, tone mapping, exposure.
- All three `*ForSun` curves — `exposureForSun`, `veilForSun`, `envIntensityForSun`. Two of them should
  cease to exist (see "Every auto curve today is a patch").
- `renderer.shadowMap` config and per-object `castShadow` / `receiveShadow` flags across the project.
- The shared hook's bloom pass (`src/shared/lib/three/use-three-scene.ts`, currently off) — and the
  hook itself, which is deliberately game-agnostic and shared. Extend it rather than fork it.
- `terrain.ts`'s `envMapIntensity` hack and `Terrain.setEnvironment` — **delete these.**

---

## Highlights, and why the sunset is hard

`FIDELITY.md` records that bright, *correctly warm* highlights **clip to flat white** because they
exceed the tonemap white point: the sun disc stays white even at 4°, and low-sun glitter reads
neutral-silver rather than gold. Two known levers:

- **HDR bloom** (parked, but supported by the shared hook): spreads bright pixels into a *coloured*
  glow before the tonemap, so the warm hue survives around a clipping core. The canonical fix.
- **AgX tone mapping** (`THREE.AgXToneMapping`) desaturates highlights far less than ACES. Helps the
  glitter and the disc's falloff; will not save the disc's blown core; shifts the whole look.

Dimming the sun disc so it stops clipping was tried and rejected — it becomes a weak dot.

---

---

## Phasing — do these in order, and review between them

Do not attempt clouds and the light balance in one swing; if both change at once, a bad frame cannot be
attributed. Between phases, capture and run the reviewers.

- **Phase 1 — the balance.** Sun:sky ratio, air-mass falloff, delete the per-material hack, universal
  shadows, exposure. `τ` exists but is driven by a single scalar. **Overcast must already work.**
- **Phase 2 — tonemap × bloom.** The 2×2 experiment, on hero frames, with GPU-ms.
- **Phase 3 — clouds.** Thickness, self-shadow taps, phase function, layers, genus presets. The cloud
  field now *derives* τ instead of being told it.

**The seam between phases 1 and 3** is a small interface, defined in phase 1 and re-implemented in
phase 3: something like `cloudTransmittance(direction) → float` and a scalar `cloudOpticalDepth`. The
lighting reads only that interface, so phase 3 swaps the cloud model without touching the light.

---

## The calibration rig (build this first — it is how the frames get judged)

`measuring-pole.ts` is a Secchi staff: it makes water clarity *readable straight off the image*. Do the
same for light. Add a debug-only **lighting rig** — a row of spheres of known albedo (0.04, 0.18, 0.90),
one chrome, one rough dielectric — floating in frame, off by default, toggled through the debug API
alongside `pole` and `seabed`.

With it, the sun:sky ratio, the shadow terminator, the sheen, and the highlight roll-off are all legible
to a human *and to a reviewer agent* in a single frame. Without it, everyone is arguing about vibes.

---

## The `06-lighting` shot group

Do **not** re-run the whole suite for lighting work; most of it tests clarity and sea state. And do
**not** build a blind cross-product of every axis — each axis answers a different question, so give each
its own frames. Calibration rig in shot; islands only in the hero frames (terrain costs ~1.65 s once per
run, not per shot).

### Space the elevations by AIR MASS, not by degrees
The existing ladder is `[0, 4, 12, 25, 85]`, and it is badly distributed. Air mass `≈ 1/sin(h)`:

| elevation | 90° | 70° | 53° | 40° | 30° | 22° | 15° | 10° | 7° | 4.5° | 2.5° | 1° | 0° |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| air mass | 1.00 | 1.06 | 1.25 | 1.56 | 2.0 | 2.7 | 3.9 | 5.8 | 8.2 | 12.7 | ~20 | ~26 | ~38 |

`25° → 85°` spans **1.1 air masses** — essentially nothing changes. `4° → 0°` spans **26**. Everything
happens below 10°, and the sweep spends most of its samples where nothing moves. (The old suite's own
comment claims its steps are "roughly even in air mass". They are not.) And **nothing is below the
horizon**, though civil twilight is where a high-latitude sea spends much of its year.

### The four sub-groups
Cover the **full 0°–90° range** — this is a general lighting system, not a Finnish one (see above). The
high end is the *harsher* test, not the irrelevant one: white sand under a zenith sun over Jerlov I
water is the worst case for highlight clipping and for keeping blacks black.

- **A — elevation ladder (the physics check).** One azimuth (side: the most diagnostic for form and
  shadow), clear sky, rig in frame. Steps ≈ ×1.3 in air mass across the whole range:
  **`90, 70, 53, 40, 30, 22, 15, 10, 7, 4.5, 2.5, 1, 0, −2, −4, −6`** (16 frames).
  - `90°` is the tropical zenith and the harshest frame in the suite. Azimuth is undefined there, which
    is harmless for a single-azimuth ladder.
  - `53.4°` is Finland's maximum; `6.6°` its midwinter noon. Mark both, and weight review attention
    toward the low end — but do not let the model *break* above them.
  - Below `0°` there is **no direct beam at all**, only skylight. This is the strongest possible test
    that the model does not secretly depend on the sun existing.
- **B — azimuth cross (shadows + glitter).** Elevations `85, 53, 25, 8, 2` × front / side / behind (15).
  Use `85°`, not `90°` — at the true zenith the sun's azimuth is undefined and the three frames would
  render identically.
- **C — cloud states.** Elevations `70, 40, 10, 2` × cirrus / cumulus / stratus / cumulonimbus (16).
- **D — heroes.** `04-beauty/*` + `05-islands/sunset-backlit`.

~50 frames, each answering something specific, instead of a cross product nobody can review.

**Leave groups 01–04 alone** — they are the water's regression baselines.

---

## The review loop (how this gets validated)

Exactly the loop in `FIDELITY.md` §"Validating looks changes", which has caught real errors all the way
through the island work:

1. **Baseline first.** `node tools/shots.mjs "" baseline` before any change.
2. **Capture on the real GPU** — it is now the default (`SHOTS_CPU=1` falls back to SwiftShader).
3. **Frames are NOT bit-identical between runs**, and they do not need to be. The GPU differs on ~0.5 %
   of pixels between two runs of the same frozen frame (mostly specular glitter). Freezing the wave
   field `t` buys **comparability** — same sea, same camera, same sun — not byte equality. Reviewers
   grade the whole image against this rubric; nobody diffs bytes. Do not chase pixel-exactness.
4. **Probe, don't squint.** The sun:sky ratio is measured by isolating each source at fixed exposure
   (set sun/hemi/env intensity independently, screenshot, compare mean luma — converting out of sRGB
   before drawing conclusions). Report the target table above, at every elevation, before and after.
5. **Re-review with fresh, BLIND reviewer agents** — no code context, never shown the diff — grounded
   in this doc + `FIDELITY.md` + `ISLANDS.md`. Ask for a per-frame verdict
   (PLAUSIBLE / QUESTIONABLE / WRONG / ARTIFACT + a physical reason) and a ranked list of what still
   looks wrong.
6. **Judge against real sun and sky optics**, not taste and not the brand palette.

---

## Decisions — settled

1. **Overcast: in scope, as a cloud optical depth `τ`.** One model with a weather knob. Keep Preetham.
   See "Overcast is a cloud parameter, not a second system".
2. **Sun API: stays `(elevation, azimuth)`.** Do not build solar-position math; `suncalc` or similar
   converts `(lat, lon, date, time) → (elevation, azimuth)` later for free. Verify the model across the
   **whole** elevation sweep, not just at noon.
3. **Tone mapping + bloom: one measured experiment, not two taste calls.** They attack the same
   problem — warm highlights clipping to flat white — and may be redundant. Run the 2×2:

   | | bloom off | bloom on |
   |---|---|---|
   | **ACES** | current baseline | ? |
   | **AgX** | ? | ? |

   On **hero frames only** (`04-beauty/*` + `05-islands/sunset-backlit`), captured with `SHOTS_GPU=1`,
   **with GPU-ms reported for each** (bloom costs ~1–2.5 ms at 1080p: an HDR `EffectComposer` with a
   HalfFloat+MSAA resolve, a ~5-level downsample/blur pyramid, and a composite — and it scales with
   render scale, so it stacks). Judge with blind reviewers. Then recommend, with the numbers.

   Watch for the failure mode: overdone bloom is hazy, milky and low-contrast, and a bright sky can
   bloom over everything — which would violate the project's "blacks stay dark; a washed grey-black look
   is a **bug**, not a style choice" rule.

4. **Clouds: genera, not a density slider.** Stratus, fair-weather cumulus and cumulonimbus must each be
   recognisable to a sailor, and the light must match each. Achieved with thickness + sun-direction
   self-shadow taps + a phase function + layers — **not** with a volumetric simulation. See "Clouds".

## Deliverables

- The rebalanced lighting model, with the sun:sky ratio table above measured and reported before/after.
- `grep -r envMapIntensity src/projects/shipwright` → **empty**.
- Universal shadows, applied through **one** `lights_fragment_begin` chunk override, not per material.
- Overcast working via `τ`, demonstrated at `τ = 0`, mid, and full — with the sun going to zero and the
  shadows going with it.
- The **lighting calibration rig**, debug-only, toggled like the measuring pole.
- The `06-lighting` shot group: elevation sweep (−6° … 53°) × cloud state × azimuth.
- The tonemap × bloom 2×2, with GPU-ms and a recommendation.
- Cloud genus presets (cirrus / cumulus / stratus / cumulonimbus) and the `cloudTransmittance` seam.
- This doc, updated with what was learned and what is still wrong.

## Non-goals (explicitly out of scope)

- Volumetric clouds (a raymarched cloudscape). three's `webgl_volume_cloud` example is a single 128³
  Perlin texture raymarched inside a unit box — a volume-rendering demo, not a cloudscape system, with
  no scene lighting and no shadows. A real cloudscape needs a curved atmosphere shell, Perlin–Worley
  noise, multiple scattering and temporal reprojection; production versions cost ~2–4 ms *with compute
  shaders*, which WebGL does not have. Against a ~9.5 ms GPU ceiling with SSR already dominant, this is
  its own project.
- **Volumetric light shafts / god rays.** (Same phenomenon as sun shafts and crepuscular rays: light
  scattered toward the eye by a medium, made visible by an occluder.) They need a scattering medium and
  a shadow map — **not** volumetric clouds — so once this overhaul lands universal shadows and a cloud
  shadow map, god rays become a small, separate, ~1–3 ms follow-up that marches the view ray against
  them. `FIDELITY.md` already wants them for the underwater camera. Build toward it; don't build it here.
- Day/night cycle, seasons, and solar position from `(lat, lon, date, time)`.
- **Night light sources** — moon, stars, airglow, lanterns — and any artistic night look or eye
  adaptation curve. Twilight down to −18° IS in scope; night bodies are not. Build the seam (no code may
  assume a single directional light, or divide by the sun's intensity) so the moon is trivial to add
  later. See "Twilight is IN scope. Night is NOT."
