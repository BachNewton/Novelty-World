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
- **Veil brightness (downwelling) is DERIVED, not tuned.** `veilForSun` is gone. The water body's
  displayed radiance is Gordon's `R∞ × E_d / π`, where `E_d` is the real downwelling irradiance just
  below the surface — the Fresnel-transmitted beam plus the Fresnel-transmitted skylight, computed by
  `lighting.ts` from the sun's air mass and the sky's own irradiance. Its colour is derived too, so the
  old fixed cool-neutral `uWaterLight` tint is gone as well. It is split into beam and sky halves so the
  shader can attenuate the beam half per-fragment by the cloud shadow map: a passing cumulus now darkens
  the sea's BODY, not merely its glitter. The whole composite runs in **linear HDR**, before the tonemap.
- **The IBL sheen roll-off is gone, because the sheen is gone.** `envIntensityForSun` existed only
  because the sky env out-lit the sun ~21:1. `scene.environmentIntensity` is a constant 1.0. Verified by
  blind review after the overhaul: the 0.04-albedo sphere stays black at the tropical zenith, the 0.90
  sphere keeps its shading instead of clipping, and the buoys keep their hue. See `lighting-log.md`.
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

- **Hard bright horizon seam.** A near-white hairline runs the whole sky↔water join, worst under a flat
  overcast (`06-lighting/c-cloud/stratus/e10`) and clear at `06-lighting/a-elevation/e00`. It reads as an
  edge-highlight where the water plane terminates against the sky dome, not a natural horizon. Named the
  **single worst defect** by the 2026-07 blind artifacts review (see the review loop below). Not
  diagnosed; first place to look is the water plane's far-edge / horizon fade against the dome. Parked.

- **Finite water-plane edge curls into the frame corners — RESOLVED 2026-07-17** by the shipped
  camera-following LOD grid: the sea is now one welded mesh reaching **16.25 km, centred on the camera**
  (`ocean-lod.ts`), so its far edge sits beyond the horizon from any deck-height framing. Only relevant
  again if a debug camera flies kilometres up, or with `Performance → ocean LOD` switched OFF (the old
  uniform plane, kept as the A/B baseline).

## Tweaks & enhancements (backlog — none are blockers)

### Refraction offset — dropped; revisit only *with a seabed* (which EXISTS now — 2026-07-17)

> The precondition below has flipped: chunk streaming ships continuous drowned bedrock under
> every stretch of water (docs/ISLANDS.md), so the parked seabed-aware offset — and shoreline
> foam — are genuinely revisitable.
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

### Sun glitter / microfacet sparkle — still the top photoreal gap at mid/high sun

**Update after the lighting overhaul.** It improved, exactly as `LIGHTING.md` predicted it would if the
diagnosis ("a sun-too-weak symptom") was right. A blind before/after reviewer, unprompted: *"baseline's
low-contrast milky lane is replaced by a higher-contrast, more legible sun-glitter path"*. It is still a
smear rather than thousands of discrete sparkles — so the remaining gap really is the microfacet term
below, and not the light.

The single biggest remaining "it doesn't look real" at mid-to-high sun (independent reviewers,
`01-sun-heading/e25-front`, `03-sea-state/3–5`, `04-beauty/low-grazing-chop`): the sun's specular
lane on the water is a **smooth milky low-contrast smear**, where real rippled water breaks a high
sun into **thousands of discrete sparkles**. It reads correct at *low grazing* sun (`sunset-backlit`)
— the deficit is specifically at mid/high elevation. Needs a **microfacet sun-glitter/sparkle** term
(sub-pixel normal variance → many bright glints), likely with **dual-scale normals** (finer + coarser
ripple layers) feeding it. Root `CLAUDE.md` future rungs.

### HDR bloom → warm sun disc + warm glitter — RESOLVED, and the answer was AgX, not bloom

The 2×2 was run and graded blind (see `lighting-log.md`). **AgX fixes the glitter's hue; bloom does
not.** Same pixels, same frame: the 4° glitter road is neutral silver under ACES and gold under AgX,
with bloom off in both — because ACES desaturates a highlight *before* it clips, so bloom then spreads
an already-white pixel into a white halo. Shipwright now runs AgX with bloom off. The disc's blown CORE
is unfixable (its radiance is `E/Ω`, thousands of times the white point); AgX saves its falloff, which
is what a viewer actually reads as "the sun is orange". The original statement of the problem follows.

#### (original)
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

### Far-water ripple aliasing (mitigated) — and the LOD grid was NOT its fix
Faint diagonal streaks in mid-far water at grazing angle were the ripple normal map minified with
too little anisotropic filtering; bumped `detailNormals.anisotropy` to 16 (real GPUs). Note the
SwiftShader capture tool ignores anisotropy (its max ≈ 1), so shot-suite frames still show it — judge
on a real GPU. This entry used to name the camera-following LOD grid as "the proper far-field fix";
the LOD grid shipped 2026-07-17 and the far-glitter dotted moiré is **pixel-identical with it on and
off** — the aliasing is per-pixel normal-map minification and never cared about vertex density. The
real remaining fixes are **dual-scale normals** (below) and/or a distance fade of ripple strength.

### Procedural ripple normal — PROTOTYPED (WIP, behind the `procedural ripples` toggle, default on)
Replaces the sampled `waternormals.jpg` with a per-fragment **procedural** normal (`OCEAN_RIPPLE_PROC`
in `ocean.ts`): analytic gradient noise (the slope, hence the normal, is exact — no extra taps),
**dual-scale** (a fine ~0.35 m capillary layer leading, a ~0.16 m glint octave, a ~1.8 m undulation),
**animated** (layers scroll different directions → shimmer, not a sliding sheet), **seamless by
construction** (no tile → no seam ever), and **uniform-scale** (no baked photo perspective). It won a
blind-eye A/B over the crumpled JPG, the OGA sea photos, AND the three.js default. *Why the photos
lost:* the JPG was crumpled-foil crinkle (not water, with a seam + chop-scale features); the OGA sea
normals bake in camera perspective (near waves big, far small) so they don't tile as a flat surface.
Far-field aliasing (procedural normals have no mip-map, so distant/zoomed-out fine noise point-samples
into "static") is handled by a **Nyquist fade** keyed off `fwidth` — each layer dies once a pixel
spans its wavelength; keys off pixel-footprint not distance, so it tracks zoom, and fading capillaries
at distance is physically right anyway.

**Perf cost is unmeasured** — it trades a texture fetch for per-fragment noise over full-screen water.
Tracked (with how to measure it) in `PERFORMANCE.md` "Open threads"; measure before this ships.

**Also still open on it:** the SSR reflection distortion still samples the old texture (`uReflectRipple`)
— switch it to the procedural slope for consistency if this ships; fading ripples flat at distance
re-raises the far **mirror** (the parked `uFarRough` distance→roughness ramp is its ready partner — a
matte far field, physically the "lost ripple detail → roughness" pairing); and this field is what a
future **microfacet sun-glitter** term should sample for the discrete-sparkle "diamonds."

### Hull interiors — mask the sea out, and render flooded water in
The buoyancy/flooding **simulation** is complete (`physics.ts`: dense hulls float on enclosed air,
breached hulls flood through their holes and founder). What's left is the **visual** half — two
coupled rendering jobs, neither of which touches the physics:

- **The known glitch:** the ocean is one global Gerstner height field drawn **everywhere**, including
  inside a hull's footprint. On a hard slam/heave the rendered sea pokes up **through the deck** into a
  dry interior. Purely rendering — it happens even with perfect buoyancy, because the shader doesn't
  know that volume is enclosed air.
- **Mask the sea out of enclosed interiors.** A sealed / un-flooded compartment should show **no**
  interior sea. Two ways: a **stencil / depth mask** (render the hull interior to a mask, discard ocean
  fragments inside it) — but it has to play with the screen-space water composite (refraction/depth/SSR
  off one shared capture; see `PERFORMANCE.md` "Architecture"), the trickiest integration point in the
  ocean, not a clip; **or** drive it off the sim — a compartment simply has no interior surface unless
  it's flooded.
- **Render flooded interior water.** Where a compartment **is** flooded, draw a water surface at its
  fill level. The sim already computes it: the pose-invariant fill fraction realizes to a world flood
  height per compartment (`physics.ts` `compartmentWater` → `compartmentFloodLevel`, ≈ `dryFloor +
  fraction·span`). So this is rendering that **reads** physics state and adds none.

**Payoff:** completes the storm-swamping stakes *visually* (you watch water climb inside a breached
hull → a reward for good, well-sealed hull design) and the **below-deck** feature (a sealed compartment
reads as dry, walkable air). Both are real shader/compositing work because the water is screen-space —
budget against the fill/SSR cost in `PERFORMANCE.md`.

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

### Future: collapse sea-state into ONE wind control
Wind roughens the water at **every scale at once**, but for rendering we split that into three
separate representations, each with its own debug dial today — and they overlap in meaning, which is
confusing (both "ripples" and "roughness" read as "how choppy"):

| scale | representation | current dial |
|---|---|---|
| big (m) | Gerstner geometry | wave height / spectrum (`sea-conditions.md`) |
| fine (sub-m) | ripple normal-map | Surface → **ripples** (normal strength) |
| sub-pixel | microfacet roughness | Surface → **roughness** |

All three are *conditions* (legitimately live sliders — see the read-only-physical-constants rule in
`scene.ts`/`ocean.ts`), but they are all **the same cause: wind**. The clean future is a single
**wind / sea-state master** that drives all three together — plus whitecaps and (per above) turbidity
— so you set "Force 4" and every scale moves coherently instead of hand-juggling overlapping proxies.
Roughness in particular is today doing double duty: real capillary roughness *plus* compensating for
sub-normal-map detail we don't resolve; deriving it from wind is what makes it stop being a feel-it-out
knob. This is the same weather-coupling seam noted in `LIGHTING.md` (cloud genus ↔ wave spectrum ↔
turbidity); build it as one system, don't wire the axes independently.

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

### The multi-lens blind review (repeatable — used 2026-07 for the lighting settle)
When you want a critical read on the **whole render** (not just water), dispatch **one subagent per LENS**
in parallel. Each catches a *different* failure mode, so the lenses don't collapse into one:

- **Photorealism** — "Does it look like a real photograph? What are the exact CG tells?" Frames: the
  hero/beauty set (`04-beauty/*`, `06-lighting/d-hero/*`) + a few sea-states + islands.
- **Physical plausibility** — "Is the LIGHT correct? Sun:sky balance (objects hold form, the 0.04 sphere
  stays black), shadows real + universal, blacks black, highlights not washed, twilight believable?"
  Frames: the calibration ladder `06-lighting/a-elevation/*` + `b-azimuth/*` + `02-clarity` samples.
- **Aesthetic beauty** — "Is it beautiful? Would a player stop and screenshot it?" Frames: the sunset /
  golden-hour heroes.
- **Artifacts & coherence** — "Find defects (banding, clipping, seams, torn reflections, aliasing) AND
  check every object looks lit by the SAME sun (no 'two different worlds')." Frames: reflections,
  islands (objects+land+water together), clouds, rough sea.

Rules that keep it honest, and MUST be in each prompt:
- **Blind:** the reviewer may read ONLY the `.png` frames — no source, no docs (these docs contain the
  team's own rationalisations and will bias the verdict). Judge only what is SEEN, against real-world
  reference.
- **Told what it should look like** — put the physical/aesthetic target *in the prompt*, not by pointing
  at these files.
- **Critical, not kind** — the reviewer's job is to find what's wrong; ask for per-frame verdict + score,
  a ranked list of what's wrong, and the best/worst frame.
- Give each lens a **focused frame subset** — the full ~126-frame suite is too much for one agent.

Then **synthesise across lenses**: agreements (2+ reviewers naming the same thing) are the real signal;
the *split* between the lighting-lenses and the whole-scene-lenses tells you where the work is. First run
(2026-07, on the settled baseline): photorealism **5**, physical plausibility **7**, beauty **7** (sunset
**8.5**), artifacts **5.5** — i.e. the **light is the strength; clouds, sun-glare/bloom, water
micro-detail, and object/island materials are the next work**. Full findings folded into
`docs/lighting-log.md` and the backlog above.

**Fix these CAPTURE-TOOL bugs before re-running** (they distract reviewers; they are NOT render defects):
(a) the `06-lighting/d-hero/dappled-sea` frame is mis-framed — the camera is buried under the water; and
(b) a small **black square leaks into the top-left of every frame** (a debug/HUD stub caught in the
capture). Both live in `tools/shots.mjs` / the debug surface it drives.
