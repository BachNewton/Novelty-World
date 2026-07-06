# Shipwright — Sea Conditions & the Breaking-Wave Roadmap

> **What this doc is.** A design + onboarding brief for the Shipwright ocean: the
> real-world sea-state vocabulary, how each concept maps onto the sim's actual
> parameters, what the code does *today*, and a costed roadmap for the big target
> feature — **crossing a breaking reef to reach an island**. It is written so a
> fresh session can pick it up cold and take the reef work on as a project.
>
> **Scope.** Everything here is about the *ocean model and how it's driven*. It does
> **not** re-document the Gerstner GPU/CPU math (that's audited and commented in
> `ocean.ts`) or the buoyancy solver internals (commented in `physics.ts`). It
> documents the *why*, the *vocabulary*, and the *plan*.

---

## 1. The one idea underneath everything: a sea is a sum of wave trains

The ocean surface is **not** "waves of height X." It's many simple wave trains laid
on top of each other, each with its own **direction, wavelength, height, and
steepness**. Sum them and you get the messy real surface. That stack is the
**spectrum**, and the sim models it literally — each wave component is one train and
they are summed as Gerstner waves.

Two families every sailor knows by feel, and the sim expresses both as spectrum
choices:

- **Swell** — long, smooth, rounded hills from a *distant* storm. Long wavelength,
  low steepness. Keeps marching after the local wind dies.
- **Wind sea** (**chop**) — short, steep, disorganized, made by the *local* wind
  *now*. Short wavelength, high steepness, spread across several headings.

A real sea is almost always **both at once**, layered. The punchline that justifies
the whole "conditions" feature: **two seas at the same height can look and feel
completely different** depending on the swell/chop mix. That's why a condition drives
a whole *spectrum*, not one height knob.

---

## 2. Terminology → what it feels like → the sim parameter

| Term | What it is on the water | Sim parameter |
|---|---|---|
| **Heading** | Direction a wave train travels. Several at once → **confused / cross sea** (pyramidal peaks). Relative to *your course*: head sea (pitch), beam sea (roll), following sea (surge/surf). | `angle` (deg) per component |
| **Wavelength** | Crest-to-crest distance. The biggest driver of *feel*: long vs your hull → you contour over it; short vs your hull → the boat can't follow, bow slaps. It's the *hull-length ÷ wavelength* ratio that matters. | `wavelength` (m) per component |
| **Amplitude** | Half the wave height. **Terminology trap:** *wave height* = trough-to-crest (what you'd radio in); *amplitude* = half that (what the math uses). | `amplitude` per component |
| **Significant wave height (Hs)** | *The* reported number. Average height of the **highest one-third** of waves — defined that way because it matches what a trained eye naturally calls out. Consequence: individual waves reach ~**2× Hs**; "Hs 2 m" means occasional 3.5–4 m sets. | target `hs` per condition |
| **Steepness** | Height ÷ wavelength — how *peaked* the crest is. Low = rounded swell you glide over; high = sharp, and past ~**1:7** it **breaks** (whitecaps). In Gerstner it also pinches crests / flattens troughs (the real **trochoidal** shape). | `steepness` per component |
| **Orbital motion** | As a wave passes, each water particle rides a **closed circle** (deep water): up, forward, down, back — the *waveform* travels, the water mostly doesn't. The "surge toward you and back" you feel. | **Already simulated** — Gerstner *is* the orbital model |
| **Shoaling** | In water shallower than ~½ the wavelength, the seabed drags: orbits flatten to ellipses, the wave slows, shortens, and grows taller; the surge intensifies. | **Not in the sim** — no seabed |
| **Whitecapping** | Open-water, wind-driven breaking. First whitecaps ~Beaufort 3–4; widespread by 5–6. | **Not in the sim** |
| **Depth-induced breaking** | Shoaling taken to its end: at height ≈ **0.78 × depth** the crest outruns the trough and the wave breaks (surf; the bar/reef danger). | **Not in the sim** |
| **Cat's paws / ripple** | Fine capillary texture and gust-prints on top of everything. | ripple normal map (see §3) |
| **WMO Sea State** | The standardized international ladder, code 0 (calm-glassy) → 9 (phenomenal), banded by Hs. The shared "how rough" vocabulary. | the condition presets (§4) |

---

## 3. What the ocean model does *today* (current `main`)

Files: **`ocean.ts`** (surface + rendering + samplers), **`physics.ts`** (buoyancy /
capsize solver), **`scene.ts`** (wires them together, kinematic probes).

**It is NOT a heightmap — it's a Gerstner surface.** A heightmap is single-valued
(`y = f(x, z, t)`). Gerstner displaces each point *horizontally too*: the particle at
rest `(x, z)` rides to `(x + ox, y, z + oz)`. That horizontal displacement is what
makes crests pinch and troughs flatten — and it's what carries the **orbital motion**
the boat actually feels. This distinction governs almost everything below.

- **GPU + CPU in lock-step.** The GLSL in `OCEAN_PARS` and the JS `sampleSurface`
  implement the *same* formula and MUST be kept identical, or the boat floats off the
  rendered waves. Because the surface is a closed-form function of position + time,
  it's also trivially multiplayer-synced: every client computes the identical sea
  from the shared clock, no state to send.
- **Deep-water dispersion.** Phase speed comes from wavelength alone:
  `ω = √(g·k)`, `k = 2π/λ`, `g = 9.81`. There is **no depth term** — the ocean is
  implicitly infinitely deep with a flat bottom. (This is the reason shoaling and
  depth-induced breaking are absent, not a knob that's turned off.)
- **`sampleSurface(x, z, t)`** answers "how high is the water here?" by inverting the
  horizontal displacement with **Newton's method** ("which rest point landed here?").
  ⚠️ **This inversion requires the surface stay single-valued.** The moment a wave
  loops/overturns, there's no unique answer, the Jacobian goes singular, and buoyancy
  breaks. **The physics forbids an actually-overturning wave.** (See §7.)
- **`sampleParticle(x, z, t)`** returns the Gerstner particle's ridden position
  (orbital) + surface normal — how a floating object rides the waves.
- **Buoyancy / capsize solver (`physics.ts`).** A Rapier hybrid model: dynamic bodies
  built from **0.5 m³ voxel** cubes (compound collider), floated by sampling water
  height under **each voxel** and pushing up in proportion to how submerged it is.
  Wood-like density (600 vs 1000 kg/m³) → settles ~60% submerged. Drag is per-voxel,
  **water-relative** (quadratic form drag + a small linear floor), computed against
  the analytic time-derivative of `sampleParticle` — so bodies **track the orbital
  motion** and only resist *deviation* from it. Fixed 1/60 s timestep, deterministic,
  no wall-clock / no `Math.random` — kept that way for future host-authoritative
  multiplayer.
- **Ripple detail — two independent axes** (reworked on main, plane-independent):
  - *ripple **strength*** = `material.normalScale` (the "ripples" GUI slider) — how
    pronounced the fine texture is. **Shading only** — perturbs light, never geometry,
    so the **hull feels nothing from it.**
  - *ripple **size*** = `rippleMeters` / `applyRipple` — world size of one ripple
    tile, held constant as the plane resizes.

### Two behaviors are already emergent (important, and easy to miss)

1. **The orbital surge is real and felt.** Gerstner encodes the orbit; the
   water-relative drag couples its **horizontal** component to the hull. The
   "toward-you-and-back" motion near an incoming swell is already a force on the boat
   in deep water.
2. **Torque / tipping is free.** Because buoyancy is applied *at each voxel's own
   point*, righting/heeling torques emerge from geometry — shapes self-right, tip, and
   bob differently by shape. **Capsize is not something to script; it's latent in the
   model** (subject to the deliberate constraint below).

### The deliberate "gentle sea" constraint — READ THIS before expecting capsize

The current tuning **intentionally cannot throw or flip a float from the wave field
alone.** By design, the sea "can never out-accelerate gravity" at these sea states
(`ω²·a ≈ 0.6 ≪ 9.81 m/s²`), so there's no launch/capsize pump to fight. That keeps the
buoyancy testbed calm and stable — but it means **the ambient waves will never capsize
a boat as-is.** Capsize/pitchpole (§5–6) therefore requires *both* much steeper local
waves (shoaling at the reef) *and* the impulsive breaking force. The emergence is real;
it's currently damped out on purpose.

---

## 4. Parked WIP — named sea-condition presets

**Branch `shipwright-sea-conditions`** (commit `84c0f88`, pushed to origin), **not
merged**. As of this writing it is **3 behind / 1 ahead** of `main`
(merge-base `7b6d659`). All changes are in `ocean.ts`; it does **not** touch the
Gerstner math or the buoyancy solver.

**What it adds:** a **"conditions" dropdown** in the Sea GUI that loads a full wave
**spectrum** per preset (not a single height knob). Presets follow the **WMO Sea State
ladder (codes 0–8** by Hs) plus three "character" seas — **Long groundswell** (long,
clean), **Wind chop** (short, steep, multi-heading), **Cross sea** (two trains
crossing → the confused pyramidal look). Each preset lists its components (heading,
wavelength, relative weight, steepness) + a target Hs. Default is **SS4 Moderate
(Hs 1.9 m)**. The manual height/wavelength/steepness sliders become **1× fine-tune
multipliers** on top of the selected preset.

**The Hs scaling (`applyCondition`).** For a sum of sinusoids, surface-elevation
variance is `Σ(aᵢ²/2)`, and `Hs = 4·σ`, giving:

```
Hs = 2√2 · √(Σ aᵢ²)   ⇒   aᵢ = wᵢ · Hs / (2√2 · √(Σ wⱼ²))
```

So each preset stores *relative* weights `wᵢ` + a target `Hs`, and `applyCondition`
solves for the absolute amplitudes that hit that Hs. Clean and physically grounded.

**Merge caveat.** The branch predates main's ripple rework. It writes a per-preset
`detail` value into `normalScale` and edits the Sea-GUI `detail` object — exactly the
region main changed (`tiling` → `ripple`, plus the new size axis). **Expect a
conflict confined to the ripple / GUI block**; the spectrum data + `applyCondition`
are conflict-free. To resume: rebase onto main, reconcile that block, then visually
tune each preset across sea states. **Opportunity while merging:** presets currently
set ripple *strength* only — they could also set ripple *size* (finer in glassy calm,
coarser in a building wind sea), now that size is its own axis.

---

## 5. The target experience — crossing the reef to an island

The north-star scenario: you're in your boat, you see an island, and between you and
it is a **reef where the waves break.** Two requirements, and they pull on different
machinery:

1. **Visual dread** — "oh *shit*, look at those waves crashing down — I need to take
   this seriously." This is **mostly faked** and that's fine (§6).
2. **Physical challenge** — if your boat is too small, or you take the wave at the
   wrong angle, you **actually capsize or pitchpole.** This is **mostly emergent**
   from the existing rigid-body physics (§6).

The pleasant inversion: **the part you'd assume must be faked (capsizing) is the part
that's real; the part that feels most real (the crash) is the part you fake.**

---

## 6. Fake vs. simulated — the design principle, with costs

### Visual crash — mostly faked, cheapest-first

The strongest "it's breaking!" signal to the eye is **foam, not the curl.** A steep
wall of water topped and trailed by whitewater reads as breaking even if the geometry
never overturns.

1. **Shoaling silhouette** — waves visibly grow/steepen in a line at the reef (falls
   out for free once §"shoaling" lands). Reads as "shallow, dangerous, *there*."
2. **Foam / whitewater** driven by a **breaking scalar** — on the peaking crest, a
   spreading sheet after break, lingering "soup." *The biggest visual win.*
3. **Spray + sound** — cheap, disproportionately convincing.
4. **True curling barrel geometry** — expensive, low marginal payoff from a boat's
   eye, and fights the single-valued-surface constraint. **Skip it.**

### Physical challenge — mostly emergent

Capsize falls out of torque: a boat rolls when heeling torque exceeds righting torque
(righting torque ∝ beam, hull shape, and how low the center of mass sits — the naval
term is **metacentric height**). Two death modes, **same underlying mechanism, chosen
by orientation**:

- **Roll knockdown (beam-on).** A steep face beam-to → buoyancy differential across
  the width → roll torque → over.
- **Pitchpole / endo (bow-on).** End-over-end about the pitch axis. A big breaking
  wave taken head-on can bury the bow ("pearling"/"submarining") and somersault the
  stern over — **head-on is not a free pass**, it just changes the axis you die on.
  Boats resist pitch far more than roll, so pitchpole needs a *bigger* provocation →
  it naturally becomes the "the wave was genuinely too big for this boat" failure.

The lovely consequence: **there is no single safe angle.** Beam-on risks rolling,
bow-on risks pitchpoling, and the skill becomes matching *approach angle + boat size +
timing* to the wave. All emergent — none scripted.

### What actually has to be built (and rough cost)

| Element | Fake or sim | Cost | Notes |
|---|---|---|---|
| Capsize from steep/beam waves | **Sim (emergent)** | ~free* | Torque per voxel already exists |
| Pitchpole, bow-on | **Sim (emergent)** | ~free* | Same mechanism, pitch axis |
| Angle & size dependence | **Sim (emergent)** | free | Falls out of rigid-body physics |
| Steep waves *at the reef* | Sim (**shoaling**) | **Medium** | Needs a **depth field / seabed** |
| The breaking "slam" | Sim | **Small** | One impulsive `addForceAtPoint` term, gated by the breaking scalar, applied high (above CoM) so it produces roll *or* pitch by orientation |
| Foam / whitewater | Fake | Medium (art) | Biggest visual payoff |
| Spray + sound | Fake | Small | High immersion per unit work |
| Buoyancy loss in foam | Sim | Small | Aerated water is less dense → boat sinks into it; scale an existing term. Optional |
| True barrel geometry | Fake (hard) | High | Skip |

\* "Free" in *mechanism*, but see §3's **gentle-sea constraint**: capsize only
*happens* once waves are steep enough (shoaling) **and** the breaking impulse exists.
And it only *feels right* with a real tuned hull (proper beam / CoM / voxel
resolution), not the testbed's tetromino plates. Free mechanism, real tuning work.

**Everything hinges on one new thing: a depth field / seabed.** It gates shoaling, the
localized steepness, the breaking scalar, and the foam line. And conveniently, a
seabed *is* just a heightmap — the representation we're already comfortable with. The
irony: you can't break the *water* with a heightmap, but you break it *because of* a
heightmap underneath it.

---

## 7. Hard limits — what extending this model will NOT give you

These need either a fake or a *different* simulation; they are not knobs on Gerstner:

1. **True plunging barrels** (a tube you can see through). The surface would have to be
   **multi-valued**, which no displaced-plane can be — *and* the Newton sampler in §3
   forbids it outright. Fake with foam; never real geometry.
2. **Wave–current interaction** — **wind-against-tide** steepening, **tide races**,
   **overfalls**, whirlpools. Gerstner has **no current field**. This is the biggest
   *real* gap a sailor would notice, and it's a separate system, not a wave knob.
3. **Reflection / diffraction / obstacles** — **clapotis** (standing waves off a
   seawall/cliff), waves bending around a headland, harbor shadowing, and **boat
   wakes**. Gerstner is a set of *infinite plane waves*; it can't reflect, diffract,
   or notice an obstacle. These need a grid-based wave solver.
4. **Nonlinear rogue waves** — you get the *linear* version for near-free (enough
   components with honest random phases occasionally superpose into a freak peak), but
   not the nonlinear focusing / modulational-instability physics.

The pattern: the model **owns "what the open sea is doing"** (the spectrum) and does
**not** own **"what the sea does when it hits currents or solid things."**

---

## 8. Can we recreate almost all sea conditions? — the verdict

**Yes, for the family that matters to this game.** Conditions split cleanly:

- **Spectrum conditions — essentially covered today.** Glassy → storm along the WMO
  ladder; swell, wind sea, and any mix; cross/confused seas; even linear rogue peaks.
  Gerstner's home turf.
- **Breaking & reef conditions — reachable with §6.** Whitecaps, shoaling, shore/reef
  break, capsize + pitchpole. The full island-approach arc (calm offshore → building
  sea → whitecaps → the breaking reef gauntlet) is in reach.
- **The honest asterisk — currents.** Wind-over-tide, tide races, and clapostic /
  wake effects are *not* reachable by extending this model. Of these, **current/tide
  is the one a sailor would actually miss**, and it's a separate system for later.

---

## 9. Suggested order of attack (for a fresh session)

1. **Decide the world shape first.** Open boundless ocean (whitecaps only, no seabed
   needed) vs. an **island world with a seabed** (unlocks the reef gauntlet). This
   single decision gates most of §6. *The north-star scenario needs the seabed.*
2. **Merge the sea-condition presets (§4)** — small, mostly reconciling the ripple/GUI
   conflict, then tuning presets. Gives the whole calm→storm range immediately.
3. **Couple "wind"** — one concept that raises short-wave amplitude *and* ripple
   strength/size together, so chop looks and feels like chop.
4. **Whitecaps (open water)** — breaking scalar → foam + spray + the impulsive slam.
   Works with no seabed; delivers "a rough sea can flip you" anywhere.
5. **Seabed + shoaling** — depth field modulating amplitude/steepness toward shore
   (capped below the loop threshold to keep the sampler single-valued). This localizes
   the danger to the reef and makes capsize/pitchpole actually possible.
6. **Tune a real hull** for capsizable-but-not-tippy, and verify roll *and* pitchpole
   emerge at the reef. Remember the §3 gentle-sea constraint: without steep shoaling
   waves + the slam, nothing flips.
7. *(Later / optional)* **Currents** — the one systemic gap worth its own design pass.

---

## Constraints to respect (don't break these)

- **GPU/CPU lock-step:** change the GLSL formula → change `sampleSurface` identically,
  or the boat floats off the waves.
- **Single-valued surface:** the Newton sampler needs it. Cap shoaling steepness below
  the Gerstner loop threshold; never let the *mesh* actually overturn — communicate
  "break" via the foam + force layer instead.
- **Determinism / host-authority:** fixed timestep, no wall-clock, no `Math.random` in
  the sim. Capsize is chaotic → the authoritative host must own the physics.
- **Metres everywhere:** 1 unit = 1 m; standard voxel = 0.5 m³.
- **Deep-water dispersion** is baked in (`ω = √(g·k)`). Adding real shallow water means
  a depth-dependent dispersion term, not just a taller wave.
