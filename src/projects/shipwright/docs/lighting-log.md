# Shipwright — the lighting overhaul, as it landed

The running log of the overhaul specified in `LIGHTING.md`. That doc is the *brief*; this one is what
was actually built, what was **measured**, what was **rejected**, and what is **still wrong**.

Read `LIGHTING.md` first. Blind reviewer agents are grounded in both.

---

## What the model is now

One physical model, in three files, with a hard split between what is physics and what is a picture.

| file | what it is |
|---|---|
| `lighting.ts` | the physics. Pure, no three.js, 40 unit tests. One `computeLighting(input) → state` that everything reads. |
| `sky-model.ts` | the CPU twin of the dome's GLSL (Preetham + Earth's shadow), so we can **integrate the sky we actually render**. |
| `clouds.ts` | one 2-D cloud field, defined once, evaluated by the dome, by the shadow map, and by the CPU. |
| `sky.ts` | the three.js side: the dome, the sun, the PMREM bake, the shadow frustum, the cloud shadow map, exposure, and the **one global `lights_fragment_begin` override**. |
| `lighting-rig.ts` | the calibration rig (spheres of albedo 0.04 / 0.18 / 0.90 + chrome + rough dielectric) **and** the linear-HDR probe. |

Every number is either a **published model** or a **measurement of what we render**. Nothing is fitted
over elevation bands.

| quantity | source |
|---|---|
| air mass | Kasten–Young (1989) |
| direct normal irradiance | Meinel & Meinel, `DNI = 1353·0.7^(AM^0.678)` |
| beam **colour** | Rayleigh (612/549/465 nm) + Ångström aerosol + Chappuis ozone, with `β` **solved** so their luminance-weighted transmittance at AM = 1 is exactly Meinel's 0.70 |
| diffuse skylight | Haurwitz (1945) clear-sky GHI, minus the beam |
| twilight | the standard measured horizontal-illuminance table |
| Earth's shadow | `z = R·(sec d − 1)`, `exp(−z/H)` per scale height |
| cloud transmittance | two-stream, conservative scattering, `g = 0.8` |
| sky distribution + chromaticity | Preetham |

---

## The headline result

### Sun : sky irradiance ratio, on a HORIZONTAL 0.18 diffuse surface

Measured on the **real GPU**, by rendering a Lambertian card into an off-screen HalfFloat target with
each source isolated (`tools/probe.mjs`). Three applies no tone mapping when the destination is a
render target, so these are **true linear radiances** — no sRGB to undo, no ACES to invert.

| sun | before | **after** | doc target | notes |
|---|---|---|---|---|
| 90° | ~1 : 21 | **10.34** | 8.5 | tropical zenith |
| 70° | ~1 : 21 | **9.22** | — | |
| 53° | ~1 : 21 | **7.02** | 6.5 | Finland's maximum |
| 40° | ~1 : 21 | **5.15** | — | |
| 30° | ~1 : 21 | **3.76** | 3.5 | |
| 22° | ~1 : 21 | **2.73** | 2.5 | |
| 15° | ~1 : 21 | **1.88** | 1.6 | |
| 10° | ~1 : 21 | **1.31** | 1.0 | |
| 7° | ~1 : 21 | **1.00** | 0.6 | the crossover |
| 4.5° | ~1 : 21 | **0.78** | 0.3 | |
| 2.5° | ~1 : 21 | **0.63** | — | |
| 1° | ~1 : 21 | **0.20** | — | |
| 0° | ~1 : 21 | **0.00** | 0 | beam foreshortens to nothing |
| −2° | ~1 : 21 | **0.00** | 0 | no beam at all |
| −4° | ~1 : 21 | **0.00** | 0 | |
| −6° | ~1 : 21 | **0.00** | 0 | |
| stratus, 90° | — | **0.05** | 0 | overcast: the sun goes to zero |
| stratus, 22° | — | **0.00** | 0 | |

**The 1 : 1 crossover lands at ~7°** (the doc's derived target is 10°). That is the physically
meaningful number, and the difference is entirely the DHI model — see "Where we disagree with the
brief", below.

On a **sun-facing** card the ratio is always higher (the beam is not foreshortened), and it is
*non-monotone* at very low sun: 10.3 at the zenith, 3.4 at 10°, 7.6 at 2.5°. That is correct — at 2.5°
a sun-facing card is nearly vertical, so it takes the beam head-on while seeing only half a very dim
sky. Always say which surface you measured.

### Model vs render

The CPU model predicts; the GPU render measures. They agree to within **−4 % at the zenith and +9 % at
1°**. The whole residual is **three's PMREM**: `getIBLIrradiance` samples the roughness-1 mip, which is
a GGX lobe, not a cosine convolution, so it under-weights a horizon-bright sky. The **beam** agrees
exactly at every elevation (`5.43e-2` measured against a predicted `0.18/π × 0.947 = 5.427e-2`).

Not corrected: the fix would mean drawing the sky 8 % too bright to compensate for an IBL bug.

### Twilight

Exposure is a real photographic meter, `key / L_avg`, pinned below a floor of **400 lx** — the
horizontal illuminance at the instant the sun's disc leaves the refracted horizon. The exposure is set
by the last of the *direct* light, and after that the world simply gets darker:

| sun | illuminance | stops below middle grey |
|---|---|---|
| 0° | 400 lx | 0 (a properly exposed sunset) |
| −2° | 130 lx | −1.6 |
| −4° | 33 lx | −3.6 |
| −6° | 3.4 lx | −6.9 (civil twilight ends) |
| −12° | 0.008 lx | −15.6 (night) |

### Overcast (the acid test)

τ drives the sky, the beam, the cloud shadow map and the exposure. Measured at 40°:

| genus | covered | beam factor | single-scatter share | base vs clear sky | illuminance | % of clear |
|---|---|---|---|---|---|---|
| clear | 0.00 | 1.000 | 1.00 | — | 70,827 lx | 100 % |
| cirrus | 0.52 | 0.945 | 0.93 | 0.6x (brighter) | 67,701 lx | 96 % |
| cumulus | 0.33 | 0.726 | 0.43 | 0.3x (brighter) | 60,010 lx | 85 % |
| stratus | 1.00 | 0.0018 | 0.20 | 0.5x (brighter) | 17,500 lx | **25 %** |
| cumulonimbus | 0.75 | 0.174 | 0.02 | **6.2x darker** | 13,430 lx | 19 % |

Stratus lands in the brief's 10-25 % band straight out of the two-stream solution, and the sun goes to
zero *because there is no beam*, not because a flag was set. Cumulonimbus's mean illuminance is near
stratus's, and that is correct: 25 % of its sky is gaps, so the drama is **contrast**, not mean.

A white cloud is *brighter* than the blue sky beside it; only a thunderhead's base is darker (a real one
runs ~500 cd/m2 against a ~3700 cd/m2 sky, i.e. 7-10x; ours is 6.2x). The **exposure fights you** here:
the meter reads the scene's mean illuminance, which under a 72 %-covered deck is dominated by its sunlit
gaps, so it lifts the frame ~4.5x and the cloud with it. A photographer exposes for the gaps and lets the
base go black; a middle-grey meter cannot. This is the one place where "expose for middle grey" and "a
thunderhead looks like a thunderhead" pull apart, and we chose the meter.

---

## The three curves

- **`envIntensityForSun` — DELETED.** `scene.environmentIntensity` is a constant 1.0. The sheen it
  fought existed only because the env out-lit the sun ~21 : 1.
- **`veilForSun` — DELETED.** The water's downwelling veil is now derived:
  `E_d = (1 − F(θ))·E_beam,h + (1 − 0.066)·E_sky`, split into beam and sky halves so the shader can
  cloud-shadow the beam half per-fragment. Its "perceptual choices (not derived)" comment is gone.
- **`exposureForSun` — SURVIVED, rewritten.** It is now `key / L_avg` on the scene's *own* measured
  irradiance, with the adaptation floor above. It never divides by the sun.
- **`hemiLight` — DELETED.** It was a second sky stacked on the PMREM sky. The half of it that did real
  work — bounce off what lies below the horizon — is now the dome's own `groundRadiance`.
- **`AMBIENT_FLOOR = 0.2` — DELETED.**

`grep -rn envMapIntensity src/projects/shipwright --include=*.ts --include=*.tsx --include=*.mjs`
returns **nothing**.

---

## Tier-2 decisions, with their justifications

### The water composite moved into linear HDR — and it was a BUG FIX, not a trade

`CLAUDE.md` asserted the composite had to run *after* `<tonemapping_fragment>` because "three
tone-maps in-material regardless of render target". **That is false in three 0.185**, and it is
checkable: `WebGLPrograms.getParameters` sets `toneMapping = NoToneMapping` unless
`currentRenderTarget === null`. The scene capture is a render target, so it was **always** linear HDR —
and the old code composited it into an already-tone-mapped base. It looked plausible only because both
sat near [0, 1] at the old exposure.

The composite now runs **before** the tonemap. The SSR target went `HalfFloat` with it; at 8 bits every
reflected highlight clamped to 1.0 before the water ever saw it.

**Blind review of the water, before vs after, 61 frames:** *no regression.* The whole Jerlov clarity
ladder survives — visibility read straight off the Secchi pole: Oceanic I ~35–40 m, Coastal 5 ~3 m,
Coastal 9 <1 m, monotonic. And **both** effects `LIGHTING.md` predicted would improve "for free" did:
"noon goes white" is fixed, and the milky sun-glitter is measurably less milky. The hot shallow rim
over sand clips *less* than baseline, not more.

### AgX, not ACES

Settled by the 2×2, graded blind on five hero frames. **The two levers are not complementary.**

- **The gold comes from AgX, not from bloom.** Same pixels, same frame: the sun's glitter road at 4° is
  neutral silver-white under ACES and warm gold under AgX, with bloom off in both. ACES desaturates a
  highlight *before* it clips, so bloom then spreads an already-white pixel into a white halo.
- Neither saves the disc's blown **core** (as the doc predicted). AgX saves its **falloff**, which is
  what a viewer reads as "the sun is orange".
- AgX's cost, stated honestly: whole-image saturation drops a little — a paler blue sky, slightly softer
  primaries, and the sunset's red band is more vivid under ACES. Blacks stay black.

### Bloom: built, measured, OFF

| cell | GPU total (1080p, AMD 780M, `low-grazing-chop`, median of 60) |
|---|---|
| ACES, bloom off | 5.59 ms |
| ACES, bloom on | 9.28 ms |
| AgX, bloom off | 5.96 ms (+0.37, noise) |
| AgX, bloom on | 9.29 ms |

**But the cost is not the blur.** Isolated:

| | GPU delta |
|---|---|
| bloom + a 4×-MSAA HDR target | +3.64 ms |
| bloom + a 1×-MSAA HDR target | +3.44 ms |
| bloom, **no MSAA** on that target | **+1.18 ms** |

2.5 of the 3.6 ms is the MSAA **resolve** of a 1080p HalfFloat target (~66 MB/frame on a 512 MB UMA
iGPU). Halving the bloom pyramid's resolution changed nothing, which is what pointed at it.

Reviewer's verdict on the look: *"mild improvement at sunset, essentially neutral at the zenith"*, and
as tuned it is a **net negative** on the very frames it was meant to save (`aces-bloom-on/glitter-low-sun`:
"a huge white bloom washes the entire center, erasing the two central buoys into ghosts"). So bloom
defaults **off**, with the switch, the tuning and the numbers left in place. Turn it on in
Environment → Display.

Two things bloom needed that stock three does not give:

1. **An energy clamp on the high-pass.** `UnrealBloomPass` adds `strength × blur(highpass)` with no
   bound. A physically scaled sun disc's radiance is `E/Ω` — several hundred times the sky — and the
   first bloom frame was a **solid white rectangle**. A real lens throws only a bounded fraction of a
   source into its wide glare tail. The clamp scales the colour rather than clipping per channel, so a
   1.84 : 1 : 0.21 sunset sun glows orange around a clipping core.
2. **A knee that tracks the exposure.** Bloom sees the *unexposed* linear image while "bright" is a
   statement about the *display*, and the exposure ranges over 300× across a day. At the stock knee
   (1.3× white) the sunset **sky** is above threshold and the whole frame veils to milky pastel. At
   knee 32 the deep-red horizon band, the buoy saturation and the dark water all survive.

   And the clamp must sit **above** the sky's bright aerosol glow: at clamp 50 the orange disc was
   clamped *below* the white Mie aureole beside it, so the halo was the sky's, and white.

---

## Where we disagree with the brief, and why

**The doc's derived ratio table pairs Meinel's DNI (947 W/m² at AM 1) with a flat DHI of 110 W/m².
Those two do not close** against a real clear-sky GHI of ~1035 W/m². Enforcing closure —
`DHI = GHI_Haurwitz − DNI·sin h` — gives 88 W/m² at the zenith and hence 10.8 : 1, not 8.5 : 1. Both
are inside the spread of real clear-day measurements; we chose closure. The consequence is that our
ratio runs 10–25 % above the doc's targets in the 15–53° band, and the 1:1 crossover sits at ~7°
instead of 10°.

**Preetham is unusable as an energy source, and this is measured.** Calibrate three's `Sky` so its
diffuse horizontal irradiance is 110 W/m² at the zenith and it then delivers **11.7 W/m² at 10°** and
**0.6 W/m² at 0°**, against a real ~61 and ~4. Its `pow(Lin, 1.5)` is a look hack, not radiative
transfer. Using it directly would have put sun:sky at **6.4 : 1 at 10°**, where the physics says ~1 : 1
— i.e. it would have silently re-created the very bug this overhaul exists to remove.

So: **Preetham gives the dome its angular distribution and its colour; the clear-sky irradiance model
gives it its energy.** The dome is renormalised per elevation. A side effect, stated plainly:
`turbidity` and `rayleigh` now reshape and recolour the sky without changing how much light it
delivers. That is the one place where the rendered sky and a textbook disagree by construction.

---

## Twilight: what was chosen, and why

Preetham is undefined below the horizon — its `sunIntensity` cutoff drives the dome to black by −2.3°.
So the dome's **shape** is frozen at the sunset geometry (`skyShapeElevation`), and the measured
twilight illuminance table scales its **energy** down to −18°.

Freezing the shape alone was not enough, and a blind reviewer caught it: a chrome ball still reflected a
bright, sun-shaped highlight at −2°, −4° and −6°. It was not the disc (which is zero there by
construction) — it was Preetham's Mie **aureole**, keeping its razor-sharp forward peak at any
depression, rendering at sRGB 0.75.

The physics that was missing: when the sun is `d` below the horizon, the air along a horizontal line of
sight is in the planet's shadow up to `z = R·(sec d − 1)`, so only `exp(−z/H)` of each scatterer's
column still scatters direct sunlight. **The aerosol scale height is 1.2 km and the air's is 8.4 km**,
and that 7× is the whole story of twilight:

| depression | shadow z | aerosol lit | air lit |
|---|---|---|---|
| 1° | 0.97 km | 0.45 | 0.89 |
| 2° | 3.9 km | 0.04 | 0.63 |
| 4° | 15.6 km | ~0 | 0.16 |
| 6° | 35 km | 0 | 0.015 |

The aureole dies almost at once; the Rayleigh glow lingers, broad and blue. Applied to the in-scattering
**source** only — the extinction along the view path does not care where the sun is. Above the horizon
both fractions are exactly 1, so not one daytime frame changes.

**Still not modelled:** the Earth's shadow *rising* through the atmosphere (no Belt of Venus, no
narrowing arch), and no night bodies. The night *look* is deliberately not invented; there is one
adaptation knob (Environment → Lighting → adaptation floor).

---

## The seam for the moon

- `sources` is a **list**. Nothing assumes exactly one directional light.
- Nothing divides by the sun's intensity. Exposure divides by the scene's *measured* irradiance,
  floored. At −18° the source list is **empty** and the exposure is still finite — there is a test.
- The cloud shadow chunk multiplies **all** directional lights, so a moon is cloud-shadowed for free.

---

## Bugs found, and how

The probe and the blind reviewers between them found six real bugs that no amount of squinting would
have caught. Kept here because each is a trap someone will re-lay.

1. **A permanent hole in the clouds over the world origin.** `hash(0,0) = fract(sin(0)·43758) = 0`
   exactly, and fbm doubles `p` each octave, so `(0,0)` stayed on that degenerate lattice corner in all
   five. Under total overcast the deck was half-transparent at the origin — where the raft spawns. The
   probe card sits there and read a beam **8.9× its own model**. (three's own `Sky` has this bug.)
2. **Disabling the cloud shadow map turned the sun back on.** Below 1° the shader returned a literal
   `1.0` instead of the field's mean, so a stratus deck at 1° let the sun blaze through at 85 : 1.
3. **Black clouds, and a black wall at the horizon.** `E_overcast` subtracted the coverage-*averaged*
   beam from a single cloud's transmitted total, so under broken cumulus it clamped to zero. Two blind
   reviewers called it independently; the math agreed exactly.
4. **`coverage` was a raw noise threshold, not a sky fraction.** Five octaves of averaged value noise
   are bell-shaped (σ ≈ 0.12), so `coverage = 0.3` covered **5 %** of the sky and `0.72` covered 97 %.
   Coverage is now mapped through the noise's own quantile function, keyed on `billow` and `shear`
   (both of which reshape the distribution). Same latent bug in three's `Sky`.
5. **Bloom's high-pass was reading a texture I never bound.** My clamp patch declared
   `uniform sampler2D colorTexture`; three's `UnrealBloomPass.render()` binds `tDiffuse`. It compiled,
   sampled whatever was on unit 0, and produced a plausible glow that ignored every parameter. Found
   because a reviewer md5'd a 12-cell sweep and reported all twelve images byte-identical.
6. **The probe's own card was a `MeshStandardMaterial`.** Its F0 = 0.04 GGX lobe at roughness 1 does not
   vanish with the beam's cosine, and it inflated the beam reading by 5 % at the zenith and 17 % at 1°,
   growing exactly as the sun dropped. It is now `specularIntensity: 0`: a true Lambertian irradiance
   meter.

Also: **the sailor was standing in the middle of every hero frame.** Rapier is frozen for capture, so
he hung in mid-air at his spawn; two reviewers described him as "a floating glassy dome".

---

## Tried and REJECTED

- **`adaptationFloorLux = 3`** (the *bottom* of civil twilight). It auto-exposed all the way through
  dusk, so −2°, −4° and −6° all rendered at middle grey — a "bright dusk" that three blind reviewers
  independently called the one thing that was actually wrong. Now 400 lx.
- **A fixed single-scatter share (0.45) for cloud shading.** It gave a τ = 250 thunderhead the same
  phase-driven brightening as a wisp of cirrus; the Cb rendered as a pale lilac blob and a reviewer
  scored it **1/10** for "recognisable as this genus". Now `s = 1/(1 + τ(1−g))` — 0.93 for cirrus, 0.03
  for a thunderhead, because a photon in a thick cloud scatters dozens of times and arrives from
  everywhere.
- **The similarity transform `(1 − g)` on a cloud's *visual* opacity.** It belongs to the beam alone.
  With it, cirrus at τ = 0.5 was a 7 % veil and a reviewer described the cirrus frames as "a
  cloudless-looking sky".
- **Approximating aerial perspective's airlight by the clear-sky radiance.** Right for isolated clouds;
  wrong under overcast, where there is no blue sky to shine down through the deck. At low sun a stratus
  cloud is 14 km away along a near-horizontal ray, so 40-70 % of the "clear sky" leaked back in and the
  dome dissolved into a clean blue gradient — *the light said overcast and the sky said clear*, the one
  failure this whole model exists to prevent. The airlight is now interpolated between the clear sky and
  the deck's own radiance by the field's mean thickness: ~0 for sparse cumulus, ~1 for stratus.
- **Cumulonimbus at τ = 120, then 250.** At 120 the base was only 2.3x darker than the clear sky beside
  it, and at 250 it was 4.2x, where a real thunderhead is 7-10x. Two blind reviewers, two builds apart,
  independently used the words "pale lilac blob". Now τ = 500 (real Cb run 100-1000); the base is 6.2x
  darker and the frame finally reads as a storm.
- **Shooting the squall hero with the sun BEHIND the cloud** (azimuth 135). The cell was backlit and
  showed a beautiful silver lining, which is not a squall. Sun behind the *camera* (azimuth 315) shows
  its shadowed near face — its base — which is.
- **Bloom at the stock threshold.** Every cell of that sweep row was graded WASHED OUT.
- **Halving the bloom pyramid's resolution to save GPU.** Changed nothing — the cost is the HDR MSAA
  target, not the blur.
- **`envMapIntensity` and `specularIntensity: 0` on the raft's wood.** Both were the buoy/island seam in
  another costume: the deck went white not because dry wood is non-reflective (no dielectric is) but
  because the sky out-lit the sun. With the light balanced, wood is allowed to be wood.

---

## Cost

Measured with `tools/bench.mjs`, real GPU, AMD 780M, visuals mode.

- **Cloud shadow pass: 0.14 ms** (a 512² fullscreen quad). Under the brief's own 0.1–0.2 ms estimate.
- **Overall GPU total: ~10.5 ms p50**, against ~9.5 ms before the overhaul. The delta is the cloud pass
  plus one texture fetch per lit fragment in `lights_fragment_begin`.
- **CPU:** `computeLighting` is 1.0 ms with a clear sky and ~5.5 ms with cloud (the dome integral plus
  the self-shadow taps), **per sun move, not per frame** — and memoised on a quantised key, so a
  day-sweep hits the cache on most frames.
- AgX vs ACES: 0.37 ms, inside the noise.

---

---

## The second pass: what a question about the sun disc turned up

The overhaul above shipped. Then Kyle asked *"where did the sun disc go?"* and pulling that thread
found four more bugs, each one a place where a fudge factor or an unphysical assumption was still
holding the model together. Every one was caught by measurement or by a blind reviewer, never by taste.

### 1. `turbidity` reshaped the sky but never touched the beam

You could crank the haze and the sun kept burning at full clear-air strength. Turbidity **is** the
aerosol load, so it now drives the Angstrom coefficient (`beta` proportional to `T`, anchored at the
solved reference). Because `clearSkyDhi = GHI - beam`, the light the haze steals from the beam
reappears as diffuse skylight for free -- which is what haze does. Illuminance holds; the beam reddens
`R/G 1.38 -> 2.58` across `T = 3 -> 8` at 3 degrees.

### 2. Preetham's in-scattering source is a SCALAR, so its aureole cannot redden

`sunE` is one number. The halo around a horizon sun was therefore rendered **white** -- a halo made of
light whose blue Beer's law had already eaten. The source spectrum has to be the beam's spectrum.

A single dome-wide tint was tried first and is **wrong**: the anti-solar sky at sunset went olive, and
a blind reviewer given the three variants and no code called it *"a hue that does not occur in that
direction."* The beam lighting an aerosol at 1.2 km has crossed nearly the whole column; the beam
lighting a Rayleigh scatterer at 8.4 km has not. Nothing is fitted -- for exponential columns the
density-weighted mean optical depth crossed is exactly `tau_j * H_j / (H_s + H_j)`:

| scatterer | of Rayleigh | of aerosol | tint at a 0 degree sun |
|---|---|---|---|
| Mie (1.2 km) | 0.875 | 0.500 | 1.385 : 0.954 : 0.324 |
| Rayleigh (8.4 km) | 0.500 | 0.125 | 1.091 : 1.006 : 0.670 |

So the aureole reddens and the zenith stays blue. Mixed by the same weights `ratio` is already built
from, applied **outside** Preetham's 1.5 power (a fit artefact of its magnitude -- scattered radiance is
linear in the incident beam). Both tints carry unit luminance and `domeScale` re-measures the tinted
dome, so this moves **hue and never energy**.

### 3. `L0 = 0.1 * Fex` -- a fudge that drew twilight upside down

three's `Sky` floors the dome at a bare constant times the **view-path** transmittance. `Fex` is about 1
at the zenith (a short path out) and about 0.008 at the horizon (a long one), so the floor is brightest
straight overhead and darkest exactly where the sun set. Daylight buries it. Below the horizon `Lin`
collapses with the Earth's shadow and the floor does not, **because it never depended on the sun at
all**:

| sun elevation | `L0` share of the zenith's radiance |
|---|---|
| 0 | 15 % |
| -2 | 32 % |
| -6 | **99.9 %** |

Civil twilight rendered as a warm glow above a black horizon: the sunset, drawn upside down. Three
blind reviewers flagged the -6 degree frames independently; one named the glow's position outright. It
is a fudge factor, so it was **deleted, not tuned**, and the dome is now pure in-scattering.

Measured after (luminance):

| sun | toward-sun horizon | anti-sun horizon | zenith |
|---|---|---|---|
| 0 | 75x | 1x | 4.5x |
| -6 | 4x | 1x | 4.1x |

The 75:1 azimuthal contrast at sunset and the 4:1 that survives to -6 (the Rayleigh phase function's
forward:back, once the Mie aureole has died with its 1.2 km scale height) are both pinned by tests, as
is *"the zenith never outshines the sunset"*.

**Honest residual:** below -4 degrees the arch is nearly uniform in *altitude* (zenith within a few
percent of the sunward horizon) where a real twilight still favours the horizon. That is Preetham's
frozen shape, not a constant someone chose, and the test asserts what is true rather than what would be
nice.

### 4. The exposure meter was not physical, and THAT was the "ugly sunset"

Reviewers kept reporting the same trade: physics up, sunsets down. *"A pale wash."* *"A wet firework."*
It was not a trade. Exposure was `key / ((0.18/pi) * E_horizontal)` -- an incident-light meter with a
cosine receptor, reading a grey card lying flat on the ground. **No camera and no retina is one.**

| sun | exposure | sky 2 deg from sun | sea | % of sky hemisphere over white |
|---|---|---|---|---|
| 40 | 4.9 | 0.96 | 0.07 | 0.0 % |
| 5 | 64.6 | 13.50 | 0.07 | 17.2 % |
| 0 | 863.9 | 5.07 | 0.07 | **35.8 %** |

To hold the sea at a rendered 0.07 *forever*, it drove a third of the sunset sky above the white point
-- and AgX then did exactly its job and desaturated the clipped sky to cream. The reviewers were not
expressing a preference; they were reporting an over-exposed sky.

A real meter integrates the **luminance of the field of view**, and so does the eye:

```
L_field = 0.5 * (mean sky radiance) + 0.5 * (sea radiance)
```

the scene's own average luminance, `(1/4pi) * integral L dw`, split at the horizon. The sky half needed
a quantity nothing computed: the solid-angle **mean radiance** of the dome -- no cosine, because *"how
bright does the sky look"* is a different question from *"how much light does it deliver"*. Near a low
sun the two differ by an order of magnitude, because the aureole sits exactly where `cos(theta)` is
nearly zero. That gap **was** the bug.

| sun | exposure | sky 2 deg from sun | sea | % of sky hemisphere over white |
|---|---|---|---|---|
| 40 | 6.2 | 1.22 | 0.09 | 0.5 % |
| 5 | 27.0 | 5.64 | 0.03 | 4.1 % |
| 0 | 230.3 | 1.35 | 0.02 | **4.4 %** |

At noon the field is an even dome over a dark sea and the answer barely moves. At sunset the field *is*
the sky, the meter stops down about 1.9 stops, the sea falls toward silhouette, and the sky lands in
the tonemapper's sweet spot with its colour intact.

The sun's **disc is excluded from the meter**, for the same reason it is excluded from the env bake:
`6.8e-5` sr and a million times middle grey, so a camera turning toward it would stop the whole world
down. Real meters clamp it and real eyes squint -- that is glare, and glare is a separate model.

**Corollary, pinned by a test because someone will "fix" it back:** a grey card no longer renders at
middle grey. An averaging meter places the *scene's* average there, and a sea of albedo 0.07 under a
bright sky is not a grey card. `MIDDLE_GREY_ALBEDO` went dead and lint found it -- a fitting tombstone.

A three-way blind review (old / overhaul-before-the-meter / overhaul-with-the-meter) ranked the new
meter first overall and first on sunset physical plausibility, calling it *"the only system that is
never broken."* It also said the old system still owns the single hero into-sun frame. That is recorded
below, unresolved.

---

## The instruments, rebuilt

You cannot judge a lighting model against flat vertex colours. A painted buoy tells you the light
**arrived**; it cannot tell you the light is **right**.

- **`materials.ts`** -- measured reflectances with their sources (physicallybased.info, Google Filament,
  Frostbite, the EPA rock-reflectance study), and an explicit `derived: true` on every value that is
  physically reasoned but not traceable to a measurement. Two findings worth carrying forward:
  - **18 % grey encodes to sRGB 118, not 128.** Both balls are in the rig, side by side, so a
    transfer-function error cannot hide.
  - **The measured values break the published authoring ranges.** Chromium's red F0 is 0.654 against a
    stated metal floor of 0.66; gold's blue is 0.307. Those ranges are heuristics for hand-painting a
    texture, not statements about reflectance. The guard checks what is *impossible* and demands a
    justification from anything outside the heuristic, rather than clamping measured data to it.
- **`material-rig.ts`** -- spheres *and* cubes, at three depths, **in one frame**. The obvious design
  (photograph "above water", "at the waterline", "submerged" separately) cannot find the bug it most
  needs to find: if one reviewer approves the above-water frames and another approves the submerged
  ones, both can be right while the seam *between* the two models is broken, because that seam is in
  neither picture. A sphere half in and half out of the sea is the test. Depends on `three` and
  `materials.ts` alone, so it drops onto the old build unchanged and the A/B is honest.
- **`tools/ab-shots.mjs`** and **`tools/material-shots.mjs`** -- capture the same frames against two
  builds, driving only the debug API both share, with anything newer behind `?.()` so the older build
  keeps its own default rather than being handed a nicer starting position.

---

## The second light source

`iala.ts` and the lit navigation marks. Everything in this renderer had exactly one emitter; the brief
said nothing may assume that, and nothing may divide by the sun's intensity. A lit buoy is the test.

- **Photometry is real.** A chart prints a light's *nominal range* in nautical miles -- its luminous
  range at 10 NM meteorological visibility (`T = 0.74/NM`). Allard's Law inverts it to candela at the
  night threshold illuminance `E_t = 2e-7 lux` (agreed at Paris in 1933, and still what every List of
  Lights is computed against): `I = 0.686 * d^2 * 0.74^-d`. IALA's own anchor, 500 cd ~ 8 NM, comes out
  at 488. A test closes the loop the other way: a lamp rated for `d` NM must put exactly `2e-7` lux on
  the eye at `d` NM.
- **Units close.** three multiplies `color * intensity` and divides by `d^2`, so a `PointLight`'s
  intensity is an irradiance times m^2 -- the same quantity the sun's `DirectionalLight` carries, times
  metres squared. `cd -> renderer = cd / (efficacy * 1000)`. Test: 100 cd at 5 m is 4 lux, in our units
  as in anyone's. And because three multiplies the *colour* in, a saturated green lamp would emit only
  `luminance(green)` of its rating; that is divided back out, so **candela means candela at any colour**.
- **Colour.** IALA E-200-1 gives CIE chromaticity boundaries, not RGB. Signal green is a **blue-green**
  (the standard explicitly excludes yellow-greens); signal yellow is an **amber**. Blue appears on
  exactly one mark in the whole system -- the emergency wreck buoy -- and a test pins that.
- **Rhythm.** Cardinals by the clock face: 3 flashes = East, 6 = South, 9 = West, North continuous.
  **South's long flash is a safety feature, not decoration** -- it exists so six flashes can never be
  miscounted as three or nine. It has its own test. The period test immediately caught a real error: the
  hand-written `Fl(2+1)` group summed to 9.5 s, not 10.
- **Blondel-Rey is deliberately NOT applied.** A 0.25 s flash *looks* dimmer because the eye integrates
  over about 0.2 s. That is a property of the observer. We render the lamp's instantaneous intensity and
  let the person looking at the screen do their own integrating; baking in an effective-intensity factor
  would count the eye twice.
- **Region A.** Finland is Region A: **port is red, starboard is green.** "Red right returning" is the
  American rule and is wrong here.
- The lanterns are switched by a **photocell on the model's own illuminance** (about 50 lx), not by a
  clock, so they are dark by day and lit through dusk at any latitude or season -- which matters at 60
  degrees north. Measured: dark at -2 (130 lx), lit at -4 (33 lx).
- Two consequences fall out of the physics rather than being special-cased: the global cloud-shadow
  override multiplies **directional** lights only, so a cloud cannot shadow a lantern beneath the deck;
  and the exposure meter does not see the lanterns, because a lamp that could stop the whole world down
  by drifting into frame would be a bug.
- **Cost: nothing.** `main` 6.38 ms -> 6.23 ms with six lanterns lit; totals 11.05 -> 10.96.

---

## Still wrong, ranked

Re-ranked after the second pass. Items 1-3 are what four independent blind reviewers, given only images
and the fidelity docs, kept naming without prompting.

1. **The old build still owns the single hero into-sun sunset.** A three-way blind review put the new
   meter first overall and first on sunset *plausibility*, and still called the old system's
   `a-sunward-e00` "the best frame in the whole set". The new one has a white bloom hotspot around the
   disc and a sea that is a notch less silhouetted. Part of that is unfixable (the disc's core is
   `E/Omega`), and part is real: our aureole-to-zenith contrast at a 0 degree sun is about 10:1 where
   the real sky is nearer 50:1, because Preetham's single Henyey-Greenstein lobe at `g = 0.8` is too
   broad to be an aerosol aureole. A real Mie phase function has a sharp forward diffraction peak. That
   is the next physics to attack, and it must be A/B'd -- a two-term phase reshapes every frame.
2. **Sun glitter is still a smear at mid/high sun.** Named "the top remaining CG tell" by two reviewers
   independently. It needs a microfacet sparkle term with sub-pixel normal variance (`FIDELITY.md`), not
   more light.
3. **Directional contrast on the islands is a little flat.** The sky-fill that (correctly) rescues the
   back-lit rock also lifts its shadow side, so the sun does less *shaping* than it should. The old
   build over-responded to the sun and crushed the shadow side to black; ours errs the safe way, but it
   errs.
4. **Golden-hour rock ignores the warm low sun** -- it stays cool-neutral while the sky around it goes
   gold. Same class of bug as the ones this overhaul exists to kill: a surface not receiving the light
   the model says is falling on it. Worth chasing.
5. **Cumulus does not read as sparse fair-weather cumulus** from a low camera; blind reviewers name it
   "stratocumulus" or "a mackerel sheet", and scored it 3/10 for recognisability. Real cumulus at 1200 m
   seen from 3 m up genuinely covers the low sky — the deck stacks up toward the horizon — but the deeper
   cause is that a 2-D field has no vertical extent, so there are no *heaps*, only patches. This is the
   genus that most wants the next increment of work.
6. **Dappling needs kilometres.** Cumulus cells are ~650 m across; a frame showing 2 km of sea shows
   three of them. The mechanism is verified working (the probe reads beam = 0 under a cell and full
   beam in a gap at the same elevation), but a hero frame has to be shot from high and wide or the
   pattern is not a pattern. Reviewers reported "no dappling" three times before this was understood.
7. **The clouds have no vertical structure.** Self-shadow taps along the sun's *horizontal* direction
   give lit and dark *sides*; they cannot give a lit *top* and a dark *base*. That is the honest limit
   of a 2-D field, and the reason the doc's own genus table asks only for "recognisable", not "correct".
8. **Cloud edges are still hard-ish**, especially on the optically deepest genera, where the opacity
   saturates a few noise units past the threshold no matter how gently the thickness tapers.
9. **The sun disc's core still clips to white** at every elevation. AgX saves the falloff, bloom (as
   tuned) does not save the core, and nothing will: the disc's radiance is `E/Ω`, thousands of times
   over the white point. Dimming it was tried before this overhaul and rejected — it becomes a weak dot.
10. **three's PMREM under-delivers a horizon-bright sky by ~8 %** (see above). Uncorrected on purpose.
11. **The Earth's shadow does not rise.** No Belt of Venus, no narrowing twilight arch.
12. **Below -4 degrees the twilight arch is nearly uniform in altitude** (see `L0`, above). Preetham's
    frozen shape does not know that a real arch still favours the horizon.
13. **The midday zenith is a touch milkier** than the build immediately before the meter change -- the
    honest cost of metering the field instead of the ground, about a third of a stop. Two reviewers
    noticed; both still preferred the new meter overall.

---

## The final blind review, for the record

Graded on the last-but-one build (before the airlight and τ = 500 fixes), 21 frames, no code:

| genus | sailor names it? | light agrees? | recognisable |
|---|---|---|---|
| cirrus | yes (streaks a touch faint) | yes — disc and illuminance intact, shadows crisp | 6/10 |
| cumulus | no — reads as stratocumulus | n/a | 3/10 |
| stratus | at high sun yes; at low sun the cover collapsed | **fixed since** (the airlight) | 5/10 |
| cumulonimbus | no — pale base | **fixed since** (τ = 500) | 2/10 |

Their verdict on the balance itself, which is what this overhaul is actually for:

> "`tropical-zenith` and `civil-twilight` prove the sun:sky ratio is fixed — spheres finally have form,
> the 0.04 sphere stays black under a zenith sun, the beam vanishes cleanly below the horizon, and
> shadows are real and universal. That is a large, genuine improvement."

and on the frame the whole cloud-shadow apparatus exists for:

> "`dappled-sea` — legible dark serpentine cloud-shadow bands sweeping across the water against lit sea.
> Delivers its name."

---

## What this unlocks

- **Volumetric light shafts / god rays.** Universal shadows and a cloud shadow map are both in place,
  and the chunk override drops straight into a view-ray march. ~1–3 ms, a separate piece of work.
- **The moon**, per the seam above.
- **Solar position from `(lat, lon, date, time)`** — `suncalc` outputs `(elevation, azimuth)`, which is
  already the model's only input. The sun API was never changed.
- **Weather**, coupling cloud genus to wave spectrum and water turbidity (`FIDELITY.md`,
  `sea-conditions.md`). The seam exists; nothing is wired.
