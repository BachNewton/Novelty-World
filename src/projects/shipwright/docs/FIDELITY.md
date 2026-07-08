# Shipwright Water — Visual Fidelity

How the sea **looks**, and the tweaks we can make to improve it. The companion docs:
**`PERFORMANCE.md`** is the *cost* side (any tweak here must respect the fill/SSR budget),
and **`sea-conditions.md`** is the *sea state* (wave spectrum). This one is the "how it
looks / how to make it look better" doc — the visual model plus a backlog of enhancements.
**Keep it updated** as looks work lands.

---

## The look today (what's implemented)

- **Screen-space water** — refraction + depth absorption + SSR reflection off one shared
  scene capture. See `PERFORMANCE.md` "Architecture" and `ocean.ts`.
- **Physically-based underwater optics.** Colour + clarity DERIVE from three inherent
  optical properties, not a painted colour (see the `WaterType` block in `ocean.ts`):
  - absorption `a` — pure-water red tail + **CDOM** blue-absorption for coastal (→ the
    green window / Baltic green);
  - **total scattering `b`** — grey (flat), scattering-dominated for turbid water; sets
    clarity via extinction `c = a + b`;
  - **backscatter fraction `B`** — the small slice that returns to the eye (`b_b = B·b`);
    sets the veil colour via Gordon's `R∞ = b_b/(a + b_b)`.
  - Water types are Jerlov's real classes: **oceanic I–III**, **coastal 1/3/5/7/9**.
- **Veil brightness** (downwelling) is **sun-driven** (`veilForSun` in `scene.ts`): it lights
  the water BODY (displayed body = the type's `R∞` reflectance × this veil), so it sits in the
  same exposed/tone-mapped space as the scene. Because auto-exposure already holds the mid-level
  roughly constant through the day, the veil is a **plateaued bright daytime value** (~0.6) that
  rolls *down* toward true dusk (~0.15) — NOT a ramp up to noon. This is what lets turbid coastal
  water read its green→olive body by day (a dim veil crushed it to near-black), while clear water
  stays deep blue (its `R∞` is tiny regardless). Still a *perceptual* quantity (chosen magnitudes).
- **Sun-driven IBL sheen roll-off** (`envIntensityForSun`, `scene.ts`). The noon sky env map is so
  bright its broad specular reflection adds a near-white sheen to every surface — black paint lifts
  to grey, saturated colours (buoys) dilute toward white. Exposure can't fix it (it scales colour
  and sheen together, so saturation is unchanged); the fix cuts the sheen itself by easing
  `scene.environmentIntensity` down as the sun climbs (1.0 up to 30° → 0.45 by zenith). Noon keeps
  hue + dark blacks; low/mid sun (≤30°) is untouched so dusk/golden reflections don't change. NB
  this is the *energy* half of "noon goes white" — the *display* half (bright warm highlights like
  the sun disc + glitter clipping to white) is a separate, unaddressed tonemapping problem (backlog).
- **No lateral refraction offset — the see-through is sampled straight through.** We removed the
  screen-space UV offset (previously the depth-gated wave normal). Any lateral offset *shears* the
  submerged silhouette of a discrete object straddling the waterline: its above-water half samples
  straight, its underwater half samples an offset UV, so the two detach and the submerged part
  slides/tears on a wave face (confirmed by A/B — see below). Screen-space refraction of discrete
  straddling objects is fundamentally approximate, the default turbid water hides refraction anyway,
  and there's no continuous see-through background (seabed) shipped to benefit — so it was dropped.
  Depth-absorption (Beer–Lambert), the veil, soft edges, and SSR reflection are unaffected.
- **Calibration rig (debug-only):** the **measuring pole** (`measuring-pole.ts`) is a 44 m Secchi
  staff — the depth its bands vanish at is the rendered visibility — read against the **debug seabed**
  (`scene.ts`), a steep sandy slope spanning the waterline down to ~−48 m. The SLOPE is the real
  gauge: the depth where the sand fades into the water colour IS the visibility, and it reaches past
  the clearest type's ~40 m, so the whole Jerlov ladder can be validated (and clear water shows its
  true deep-blue body in the deep tail, turquoise only over the sunlit shallows). Both are
  `visible:false` by default — dial water-type coefficients to real Secchi depths (validate physics,
  don't fit a curve).

---

## Known rendering bugs (surfaced, not yet fixed)

- **Sun-movement flicker.** With a smoothly moving sun — the benchmark's `day-sweep` segment
  (`tools/bench.mjs`, headed real-time) sweeps noon→sunset — the frame **flickers** as the sun
  descends. This is a real rendering bug, **not** a benchmark artifact, and it's exactly what the
  motion benchmark exists to surface (you'd rarely hold a moving-sun condition by hand). It matters
  because a **day/night cycle is planned** (see `PERFORMANCE.md`). Not diagnosed yet; first places to
  look when we do: the per-frame **PMREM env-map re-bake** (every `updateSun` rebuilds
  `scene.environment`, so any instability in the bake — or in the HDR sky clamp — reads as the water
  reflection / IBL jittering frame-to-frame), and/or the **auto-exposure / veil** stepping as
  elevation changes. **Parked — noted only, no fix now.**

## Tweaks & enhancements (backlog — none are blockers)

### Refraction offset — dropped; revisit only *with a seabed*
The lateral see-through offset was **removed** (see "The look today"). Both prior backlog ideas
here — driving the offset by the **full perturbed normal** for underwater shimmer, and a
**Snell-correct direction** (`refract(viewDir, normal, 1.0/1.33)`, folding in view angle + IOR) —
change the offset's *magnitude/direction* but do **not** fix the core problem: any nonzero offset
shears a discrete object straddling the waterline (A/B confirmed the Snell direction still tore the
buoy). Screen-space refraction only reads well on a **continuous** see-through background. So the
whole family is parked until shallow water over a **seabed** lands (roadmap: shoreline/islands). At
that point revisit a **seabed-aware** offset — e.g. apply the offset only where the fragment behind
the water is far/continuous (large water column), and suppress it near discrete occluders — rather
than a blanket UV nudge. Until then, straight-through is the honest, artifact-free choice.

### Foam / whitewater
Shoreline foam + open-water whitecaps — the single strongest "it's breaking" signal to the
eye (see `sea-conditions.md` §6). Needs a *breaking scalar* and, for the shoreline, a
seabed. **Biggest visual payoff** on this list.

### Sun-driven veil brightness — DONE
Veil brightness now tracks **sun elevation** (`veilForSun`, `scene.ts`). The key realisation:
because auto-exposure holds the exposed mid-level roughly constant, the veil should be a
**plateaued bright daytime value that rolls DOWN toward dusk** — not the intuitive ramp-up to
noon (which both crushed turbid water to near-black by day and clipped clear water toward cyan
at noon). Front-loaded rise (dusk→~18°), then flat. (See "The look today".)

### Downwelling colour
The veil's light tint (`uWaterLight`) is a fixed cool-neutral; could track the sun/sky
colour (warm at dusk → neutral at noon).

### Downwelling attenuation of the object's illumination
Today only the object→eye path is attenuated; the light *reaching* a submerged object isn't.
Multiply the refracted sample by `exp(-Kd · depthBelowSurface)` so deep objects also dim
from reduced illumination. Minor gap noted in the optics diagnosis.

### Sun glitter / microfacet sparkle — TOP photoreal gap at mid/high sun
The single biggest remaining "it doesn't look real" at mid-to-high sun (independent reviewers,
`01-sun-heading/e25-front`, `03-sea-state/3–5`, `04-beauty/low-grazing-chop`): the sun's specular
lane on the water is a **smooth milky low-contrast smear**, where real rippled water breaks a high
sun into **thousands of discrete sparkles**. It reads correct at *low grazing* sun (`sunset-backlit`)
— the deficit is specifically at mid/high elevation. Needs a **microfacet sun-glitter/sparkle** term
(sub-pixel normal variance → many bright glints), likely with **dual-scale normals** (finer + coarser
ripple layers) feeding it. Root `CLAUDE.md` future rungs.

### HDR bloom → warm sun disc + warm glitter (the "display half" of noon-white)
The `envIntensityForSun` roll-off fixed the *energy* half of noon washing (see "The look today"),
but the **display half** is untouched: bright, correctly-warm highlights **clip to flat white**
because they exceed the tonemap white point. Two symptoms: the **sun disc stays white at low sun**
(a real low sun is orange-red; the disc's radiance is thousands× over white, so any tint still
clips), and the **low-sun sun-glitter reads neutral-silver** rather than gold. The canonical fix is
**HDR bloom** (spread the bright pixels into a *coloured* glow before tonemap, so the warm hue
survives around a clipping core) — bloom is **parked** (the shared hook supports it; Shipwright runs
without it, per `CLAUDE.md`). A lighter partial fix: swap ACES → **AgX** tonemapping (`THREE.AgXToneMapping`),
which desaturates highlights far less — helps the glitter + disc *falloff*, won't save the disc's
blown core, and shifts the whole look (wants its own review). Dimming the disc so it stops clipping
was rejected — it becomes a weak dot.

### Minor tone tweaks (from the final review)
- **Sunset zenith green band** (`04-beauty/sunset-backlit`) reads a touch strong — real twilight has
  a green transition, but consider easing it (the three.js `Sky` Rayleigh at 0°; we raised Rayleigh
  2→3 for the low-sun reddening, which also lifts this band).
- **Clearest-water shallows rim glows hot near-white-cyan at noon** (`02-clarity/1-oceanic-i/e90`):
  the sunlit-sand fringe over the shallowest water is slightly over-bright. Cap it if it bothers.

### Far-water ripple aliasing (mitigated) → LOD grid is the real fix
Faint diagonal streaks in mid-far water at grazing angle were the ripple normal map minified with
too little anisotropic filtering; bumped `detailNormals.anisotropy` to 16 (real GPUs). Note the
SwiftShader capture tool ignores anisotropy (its max ≈ 1), so shot-suite frames still show it — judge
on a real GPU. The proper far-field fix is the camera-following **LOD grid** (root `CLAUDE.md`).

### Dual-scale normals
Finer + coarser ripple-normal layers (feeds the sparkle term above; also breaks up the current
single-scale normal map, which reads faintly repetitive/"scratchy" up close at the rough end).

### Underwater camera mode *(future)*
Today the camera dipping below the surface is an **artifact** — you see through the water's
back-face-culled underside to the background (a pale void the buoys float over). But a *deliberate*
underwater render is a real future feature: the camera visually beneath the waterline, showing the
surface from below lit by the sky through **Snell's window** (the ~97°-wide circle of compressed sky
overhead, ringed by total internal reflection going mirror-dark), light **shafts / god-rays**, a
suspended-particle haze scaled by the same scattering `b`, and the veil + absorption applied to the
*whole* view rather than just the see-through column. It needs its own "inside the medium" shading
branch, not the above-water composite. When there's something to show, add an `05-beauty/underwater`
scenario to the capture suite (`tools/shots.mjs`) so it becomes a tracked shot test.

---

## Where clarity meets sea state
Water clarity/colour (this doc, the `WaterType` system) and wave state (`sea-conditions.md`)
are **orthogonal inputs** — a rough clear sea or a calm murky harbour are both valid. But
they *couple* physically: rougher seas churn up sediment and entrain bubbles, so the
**scattering `b` (and thus turbidity) should rise with sea state**. That coupling — a sea
condition scaling the water type's scattering — is a future step; for now they're set
independently.

---

## Validating looks changes (the review loop)
The proven loop for any fidelity work (used to land the veil rework, clarity, sea-state, the rig,
and the noon fix — git history has the details):
1. **Capture** the deterministic shot suite: `node tools/shots.mjs "" <label>` (dev server on :3001;
   filter substring as arg 1 to grab a subset fast). Every frame is a frozen wave field, so runs are
   pixel-comparable — capture a `baseline` before a change and an `after` for a frame-for-frame A/B.
   Groups: `01-sun-heading` (elevation × heading), `02-clarity` (Jerlov types × elevation, over the
   Secchi rig), `03-sea-state` (glassy→rough), `04-beauty` (hero/stress frames).
2. **Re-review** by dispatching **fresh, unbiased reviewer agents** — no code context, judging each
   frame against real ocean/sky optics (ground them in this doc + `sea-conditions.md` + the
   `WATER_TYPES` table; do NOT let them read the change so they stay blind). One agent per group, or a
   single holistic pass over the whole suite. Ask for a per-frame verdict (PLAUSIBLE / QUESTIONABLE /
   WRONG / ARTIFACT + physical reason) and a ranked list of what still looks wrong.
3. **Judge against physics, not the brand palette** — Shipwright is photoreal (see project `CLAUDE.md`).
