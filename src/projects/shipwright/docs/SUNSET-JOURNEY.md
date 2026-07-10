# Shipwright — the sunset journey: what we tried, what we learned, the way forward

This document exists because a long, winding investigation into "make the sunset beautiful" produced
more *lessons* than *code*, and the lessons must not be lost. It is written for a **fresh session** —
a new agent, or a future you with a clean head — to pick up and finish the work from a written plan
instead of a tired memory. Read this top to bottom before touching the lighting.

The experimental code lives on branch **`sunset-aureole`** (pushed). The commit map is at the bottom.
Nothing here has been merged to `main`.

---

## 0. Read this first — the verdict

The task was framed as *"make the sunset beautiful by finishing the physics rather than fighting it,"*
on the thesis that the washed sunset was caused by leftover physics bugs (Preetham's phase function,
the ported Rayleigh remap, the `pow(Lin, 1.5)` "look hack", coefficient mismatches), not by a real
physics-vs-beauty tradeoff.

**That thesis was falsified in practice.** Finishing the physics made the sunset *worse*, not better,
at every stage, confirmed by two independent blind reviewers and by Kyle's own eye. The uncomfortable
truth the whole journey converged on:

> The beautiful sunset everyone prefers is the **pre-overhaul three.js `Sky`** (Preetham + `pow(Lin,
> 1.5)` + `horizonMix`). That `pow(1.5)` is **not a bug — it is an art-direction operator**, and it is
> what makes the sunset beautiful. "Correct" single-scattering physics is flatter and, to the eye,
> washed. This is a genuine physics-vs-beauty tradeoff, and beauty wins because **this is a game.**

Two more findings that close whole avenues:

- **Online research (Kyle + agent): nothing available beats three.js `Sky`'s sunset.** Not HDRI skies,
  not `@takram/three-geospatial` (MIT, WebGL, excellent but geospatial/still-physics), not
  `sky-cloud-3d` (WebGL, non-commercial OK, *fantastic clouds* but GPU-heavy), not Three.js Sky Pro
  (WebGPU + paid — off the table; the project is deliberately WebGL for old-device support). **So the
  sunset to use is three.js `Sky`, which we already had — before the overhaul replaced it.**
- **The clouds are the real weak point**, not the sky. Both blind reviewers said so; Kyle confirmed
  `sky-cloud-3d`'s volumetric clouds are dramatically better than ours (but too costly as-is). Better
  clouds are the highest-value *future* work, separate from the sunset.

---

## 1. The recommended path forward (the actual plan)

The overhaul was a **2,439-line rewrite** of the sky *and* the lighting. Its fatal error: it rewrote
**two separable things** when it only needed to fix one.

- The **beautiful sunset** lives in the sky **rendering** (three.js `Sky` / Preetham — the dome you
  look at).
- The bug the overhaul existed to fix ("buoys and islands look like they're in different worlds") lived
  in the **lighting** (the PMREM sky env out-lit the sun ~21:1 when lighting *objects*).

These do not have to be solved together. So the plan is **not** "re-derive a giant physical system." It
is:

1. **Restore three.js `Sky`'s rendering** (the pre-overhaul dome, commit `d284f33`). The beautiful
   sunset returns for free — it is the best available, confirmed.
2. **Fix only the real bug — the sun:sky *lighting* balance — as a small, targeted change.** Keep the
   *one* genuinely good idea the overhaul had: **the sun's brightness should come from air mass**
   (Kasten–Young → Meinel & Meinel DNI), so a low sun is dim and a high sun is bright. Give the
   `DirectionalLight` that air-mass-driven intensity, set `scene.environmentIntensity` to a fixed value
   that balances it (~5:1 sun:sky the *right* way, not 1:21 the wrong way), and delete the band-fitted
   `envIntensityForSun` / `veilForSun` fudges. This is tens of lines against the good sky, not a rewrite
   that touches the dome.
3. **Keep the pre-overhaul's darker exposure feel** — a big part of the drama. The old build metered
   darker at sunset (`key / (ambient + sin(elevation))`), which let the sky saturate. If the new
   scene-luminance meter is kept, bias it darker; if not, the old heuristic is fine for a game.

Honest tradeoffs of going this way, so they are chosen with open eyes:

- You **give back** the overhaul's **twilight** (below-horizon dusk) and its **cloud-τ system** (cloud
  shadows, genus presets, overcast lighting). Twilight can be re-added deliberately later. The clouds
  you *want to replace anyway* with something better, so losing the τ system is not a real loss.
- You **keep** the good sky and, via step 2, a *consistent* object-lighting balance — the thing the
  overhaul actually needed to deliver.

### The one physics win worth carrying forward: **ozone**

The dome's zenith was **cyan**, not blue, because its view-path extinction was pure Rayleigh + aerosol
with **no ozone**. The Chappuis ozone band absorbs green and red far more than blue, which is exactly
what makes a real clear zenith deep blue. This is a real, small, universally-agreed improvement and it
is worth re-applying to three.js `Sky` after the restore. Implementation, verified and cheap, is on the
branch: add `OZONE_ZENITH_TAU = [0.0395, 0.025, 0.0048]` (300 DU) to the dome's `Fex`, using ozone's
**own thin-shell (~25 km) air mass** (bounded ~11 at the horizon, not the sea-level ~38 — the naive
sea-level slant over-dims the warm twilight horizon and breaks the arch). See commit `63bc7fd`.

---

## 2. What was tried, and what each attempt taught

Staged, in order, with the lesson. All of this is on the branch; none of it should be merged (except
ozone).

1. **Two-term Henyey–Greenstein aerosol phase + fixed the ported `rayleighPhase(cosθ·0.5+0.5)` bug.**
   Physically correct (aureole falloff 6× → 30×, matching measurement; Rayleigh backscatter restored, a
   real Belt-of-Venus appeared). **But** with `pow(1.5)` still on, the concentrated aureole clipped to a
   white blob (aureole:zenith 25 → 216 vs a real ~50). *Lesson: a "more correct" phase function is not
   automatically more beautiful; it interacts with the look hacks around it.*

2. **Deleted `pow(Lin, 1.5)`, `horizonMix`, and Preetham's `sunIntensity`.** This gave textbook
   single-scattering, and the numbers landed on reality (aureole:zenith 54, zenith blue:red 3.75, a
   twilight arch that favours the horizon). **But** the render went *milky and desaturated* — measured:
   sunset sky saturation dropped to **9.6%** vs main's 28.5% and the pre-overhaul's **53.6%**. Two blind
   3-way reviews ranked this build **dead last**. *Lesson: `pow(1.5)` was doing load-bearing aesthetic
   work — it deepens and spreads colour. Deleting the "fudge" deleted the beauty. This is the crux
   finding: the physics-vs-beauty tradeoff is real here.*

3. **Ozone in the dome.** Zenith cyan → blue. *Lesson: a genuine, small win. Keep it. (See §1.)*

4. **The "drama" dial — a per-channel radiance power `L → L^drama`, energy-preserving via `domeScale`.**
   An attempt to bring `pow(1.5)`'s beautifying effect back as an honest, tunable, art-direction knob.
   **But** a *per-channel* power distorts hue — Kyle: *"it makes it look fake and wrong, like someone
   messing with camera settings trying to boost colors and just messed it up."* *Lesson: per-channel
   powers shift hue; they are not a clean "saturation" control. The reason the reference's `pow(1.5)`
   looks good and ours looked fake is that it was tuned on a specific radiance distribution — you cannot
   graft it onto a different one and expect the same result.*

5. **The exposure lever (lower the key; then a "meter for the highlights").** Darkening the sunset
   *does* help (golden hour became a "beat", 2.5° a "meet"), and the highlight meter is a principled way
   to darken high-contrast scenes without a per-elevation branch. **But** Kyle's eye caught the ceiling:
   *"the higher exponent made the scene darker overall, contrast stayed about the same, and because it's
   darker it looks less saturated."* *Lesson: **exposure is a brightness dial only.** It cannot add
   contrast or saturation; it just scales the image. Darkening has diminishing returns (a single-humped
   curve — too bright washes, too dark crushes, `key → 0` is black) and a darker image can read as *less*
   colourful. Exposure is not the saturation lever.*

6. **Online alternatives (HDRI, `@takram`, `sky-cloud-3d`, Sky Pro).** See §0. *Lesson: three.js `Sky`
   is the best sunset available; the opportunity is clouds, and it is costly.*

---

## 3. The measurements that mattered

- **Sunset sky (upper 38%), at e00:** pre-overhaul luma **77**, saturation **53.6%** (dark, saturated —
  beautiful). Main luma **183**, saturation **28.5%**. The "finished physics" branch luma 170,
  saturation **9.6%** (washed). *The beautiful sunset is dark and saturated; the overhaul made it bright
  and pale.*
- **Exposure is single-humped, not a ramp.** Lowering the key past a point stops adding vibrance and
  just marches to black. `key = 0` is an all-black frame.
- **Ozone:** zenith blue:red at a 40° sun 3.75 → 3.04 (into the real 2.5–4 band); zenith goes from
  green-dominant (cyan) to blue-dominant.

---

## 4. The comparison assets (look at these, they carry the argument)

Under `src/projects/shipwright/.shots/aureole/` (gitignored — regenerate with the tools if gone):

- `drama-review.html`, `exposure-compare.html`, `camera-character.html` — the branch vs main vs the
  pre-overhaul reference, across the sunset ladder.
- `highlight-meter.html` — proves the highlight meter only darkens (key held at 0.125 throughout).
- `exposure-to-black.html` — the single-humped exposure curve down to black.
- `followups.html` — noon comparison (the overhaul *fixed* the bleached noon), clouds-vs-clear (the
  color bands are there under clear sky; cirrus was covering them), and the water/SSR-res difference.

The **pre-overhaul reference build** is served for A/B by a second dev server:
`git worktree` at `../nw-preoverhaul` (commit `d284f33`), `npx next dev --port 3005 --webpack` OR a real
`npm install` + Turbopack (see the worktree-node-modules memory). `tools/ab-shots.mjs --port 3005`
captures from it.

---

## 5. What the overhaul got RIGHT — do not lose these ideas

The overhaul was not worthless; it fixed real bugs. When re-doing the lighting balance (§1 step 2),
carry these forward:

- **Sun brightness from air mass** (Kasten–Young → Meinel & Meinel DNI). This is the core, correct idea.
- **One consistent lighting model** — no per-material `envMapIntensity` exceptions (`grep` must stay
  empty). The "two different worlds" bug is a per-material-hack smell; keep it deleted.
- **Twilight to −18°** and the **cloud-τ / cloud-shadow** infrastructure exist and work — if a future
  effort wants them back, they are in `main`'s history, not gone.
- The **calibration rig, the linear-HDR probe (`tools/probe.mjs`), and the blind-reviewer loop** are
  genuinely good instruments. Use them. (Caveat learned: a reviewer only reports what the frames *show*
  — a bright clipped aureole reads as a "blob/smear" even when the model is correct. Measure, don't only
  squint.)

---

## 6. The code map (branch `sunset-aureole`)

Newest first. Everything after `3f3961d` (main) is experimental; only ozone is worth keeping.

- `e391bd3` — preserve the highlight-meter experiment (exposure meter that weights the highlights).
- `63bc7fd` — **Reset the branch to main's sky + ozone only.** This is the cleanest "keep ozone" state
  if someone wants just that. It reverted the phase/pow/drama work and kept ozone (with the thin-shell
  air mass).
- `b3b105a` — the "drama" dial (per-channel radiance power). *Rejected: distorts hue.*
- `b23067b` — ozone applied to the *finished-physics* dome. (Superseded by `63bc7fd`, which applies
  ozone to main's dome instead.)
- `5610c95` — delete `pow(1.5)` / `horizonMix` / `sunIntensity` (stage 2). *This is where the render
  went washed.*
- `9d23276` — two-term aerosol phase + Rayleigh backscatter fix (stage 1).
- `3f3961d` — `main` (the overhaul). The washed-vs-pre-overhaul sunset starts here.
- `d284f33` — **pre-overhaul three.js `Sky`. The beautiful sunset. The restore target for §1.**

---

## 7. Handoff note

This investigation ran a very long session with many build/measure/revert cycles, and the agent driving
it accumulated enough context to start making mistakes (a screenshot-filename collision that faked a
non-monotonic exposure result; conflating `main` with the pre-overhaul build). The revert-and-fix work
in §1 is best done **fresh**, guided by this document, not continued on a saturated context. This doc is
the deliverable that makes that clean handoff possible.
