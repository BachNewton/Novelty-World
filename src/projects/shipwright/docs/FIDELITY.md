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
- **No lateral refraction offset — the see-through is sampled straight through.** We removed the
  screen-space UV offset (previously the depth-gated wave normal). Any lateral offset *shears* the
  submerged silhouette of a discrete object straddling the waterline: its above-water half samples
  straight, its underwater half samples an offset UV, so the two detach and the submerged part
  slides/tears on a wave face (confirmed by A/B — see below). Screen-space refraction of discrete
  straddling objects is fundamentally approximate, the default turbid water hides refraction anyway,
  and there's no continuous see-through background (seabed) shipped to benefit — so it was dropped.
  Depth-absorption (Beer–Lambert), the veil, soft edges, and SSR reflection are unaffected.
- **Calibration tool:** the **measuring pole** (`measuring-pole.ts`) is a Secchi staff —
  the depth its bands vanish at is the rendered visibility. Use it to dial water-type
  coefficients to real Secchi depths (validate physics, don't fit a curve).

---

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
at noon). Front-loaded rise (dusk→~18°), then flat. See `FIDELITY-REVIEW.md` P1.

### Downwelling colour
The veil's light tint (`uWaterLight`) is a fixed cool-neutral; could track the sun/sky
colour (warm at dusk → neutral at noon).

### Downwelling attenuation of the object's illumination
Today only the object→eye path is attenuated; the light *reaching* a submerged object isn't.
Multiply the refracted sample by `exp(-Kd · depthBelowSurface)` so deep objects also dim
from reduced illumination. Minor gap noted in the optics diagnosis.

### Dual-scale normals + sun glitter
Finer + coarser ripple-normal layers and a sun-glitter/sparkle term (from the root
`CLAUDE.md` future rungs).

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
