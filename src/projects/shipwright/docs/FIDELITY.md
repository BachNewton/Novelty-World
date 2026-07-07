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
- **Veil brightness** (downwelling) is a fixed dusk value (~0.12). It's a *camera/
  perceptual* quantity (post-tone-map brightness), so it's chosen, not derived.
- **Refraction is depth-gated** — the screen-space offset is ∝ submerged depth (→ 0 at the
  waterline), which is what makes straddling objects and steep waves read correctly.
- **Calibration tool:** the **measuring pole** (`measuring-pole.ts`) is a Secchi staff —
  the depth its bands vanish at is the rendered visibility. Use it to dial water-type
  coefficients to real Secchi depths (validate physics, don't fit a curve).

---

## Tweaks & enhancements (backlog — none are blockers)

### Underwater shimmer *(dropped — revisit)*
Drive the refraction offset by the **full perturbed normal** (geometric wave normal **+**
the fine ripple normal map), so the see-through image shimmers with the small ripples the
way real water does. Today refraction uses only the geometric wave normal
(`vWorldNormal.xz`), so ripples shimmer the *reflection* (`uReflectRipple`) but **not** the
refraction. This was part of the refraction rework and got **parked/deferred** when we
re-scoped — not rejected. To add: perturb `refractUv` by the ripple normal (world-space,
zero-mean on flat water) on top of the existing depth-gate.

### Snell-correct refraction direction
The offset *direction* is currently the geometric `vWorldNormal.xz` (depth-gated). More
correct is `refract(viewDir, normal, 1.0/1.33)` — folds in view angle + IOR and is nonzero
on flat water at grazing angles. The depth-gate (the important fix) is done; this is a
direction refinement.

### Foam / whitewater
Shoreline foam + open-water whitecaps — the single strongest "it's breaking" signal to the
eye (see `sea-conditions.md` §6). Needs a *breaking scalar* and, for the shoreline, a
seabed. **Biggest visual payoff** on this list.

### Sun-driven veil brightness
Veil brightness is fixed at the dusk value; it could track **sun elevation** (dim dusk →
brighter noon). We prototyped and reverted this. Caveat: the veil is composited **after
tone mapping**, so a linear ramp clips to washed-white at high sun — it must **roll off**
(sublinear/capped). Best done *with* the auto-exposure fix (see the `KNOWN ISSUE` in
`scene.ts`) so the whole frame adapts to the sun together.

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
