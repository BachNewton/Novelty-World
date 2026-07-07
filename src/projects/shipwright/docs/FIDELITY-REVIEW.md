# Shipwright Water — Visual Review Findings & Fix Backlog

> **What this is.** A punch-list from an independent, multi-agent **photorealism review** of the
> 59-shot capture suite (`tools/shots.mjs` → `.shots/`), run 2026-07-07. Five fresh reviewer
> agents — no code context, judging each frame against real-world ocean optics — split the suite
> by group. This doc records what they found so it isn't lost, prioritises the fixes, and gives a
> **re-review protocol** so the loop is repeatable.
>
> **The intended workflow:**
> 1. Fix the items below in a **fresh session** (this doc is the brief — read `FIDELITY.md` +
>    `sea-conditions.md` alongside it).
> 2. Re-run the suite: `node src/projects/shipwright/tools/shots.mjs` (dev server on :3001).
> 3. Re-dispatch the unbiased reviewer agents (protocol at the bottom) for a second opinion.
>
> Keep this doc updated as items land (strike them, note the result).

---

## ✅ Fix pass — 2026-07-07 (branch `worktree-shipwright-fidelity-fixes`)

A/B evidence: `.shots/baseline/` (before) vs `.shots/after/` (this pass), pixel-comparable
frame-for-frame. Summary of what landed — details struck through in the backlog below:

- **P1(a) turbid differentiation — RESOLVED.** Reworked the veil (`veilForSun`, `scene.ts`) from a
  ramp-UP-to-noon (0.12→0.26) into a **plateaued bright daytime value rolling DOWN to dusk**
  (~0.6 day, ~0.15 dusk, front-loaded). A dim veil × a dark `R∞` was crushing every turbid body to
  near-black; now Coastal 3→9 read a clear monotonic **green-teal → olive → grey-khaki** ladder
  (was all one dark blue-teal). See `after/02-clarity/{5,6,7,8}-coastal-*/e25`.
- **P1(b) clear-water noon — CLARIFIED, not a veil bug.** Oceanic I's `R∞` is near-zero, so the veil
  never drove its noon cyan; that cyan is the **sunlit debug seabed seen through clear water**
  (physically turquoise-over-sand). In real *deep* water clear = deep blue already (thickness→∞ →
  body→`deep`, tiny blue). The plateaued veil no longer *adds* to any noon over-brightness. The
  residual highlight clip is the seabed calibration prop at noon; left as-is (see the rig note).
- **P2 glassy mirror — RESOLVED.** Fine-ripple strength now scales with sea state
  (`applyRippleStrength`, `ocean.ts`): glassy eases to a near-mirror with a clean specular road;
  rough keeps full chop. `after/03-sea-state/1-glassy`.
- **P2 sea-state steepness — RESOLVED.** Pushed steepness at the top rungs (`shots.mjs`): 5-rough /
  6-very-rough now read as peaked/choppy, not rounded swell. `after/03-sea-state/{5,6}-*`.
- **P2 e04 reddening — RESOLVED.** Raised sky Rayleigh (2→3) + lowered turbidity (4→3): `e04` stays
  distinctly warm/golden; `e00` deepened (improved), `e25`/`e90` stay clean. `after/01-sun-heading/*`.
- **Standing checks held:** SSR grazing/horizon seam still clean (`after/04-beauty/low-grazing-chop`);
  low-sun mood + glitter geometry preserved; clear-water ordering intact.

**Second-opinion re-review** (5 fresh unbiased agents, blind to the diff, `after/` vs `baseline/`):
**net BETTER in every group, zero regressions, zero WRONG/ARTIFACT verdicts.** Highlights:
- *Turbid clarity:* "the four turbid types now differentiate — in BOTH axes"; Coastal 9 "passes the
  key test — near-opaque murky olive at every elevation including noon, no longer lifeless navy."
- *Sea-state:* glassy near-mirror "PASS" (called the single biggest correction); ladder monotonic;
  rough/very-rough steeper — trochoidal peaking a **PARTIAL PASS** (believable, but headroom, ties
  to unbuilt foam/whitecaps).
- *Sun-heading:* e04 golden-hour "the strongest, clearest improvement in the group"; no noon white-out.
- *Beauty:* SSR seam confirmed free; two low-sun frames better, grazing same.
- *Clear clarity:* ordering holds; essentially SAME (expected — clear water's veil has little leverage);
  Oceanic III/Coastal-1 noon marginally greener/better.

New watch-items surfaced (folded into P3 below): sun **disc** stays white at e00/e04 (air-mass would
redden it); Oceanic I/II **e90 pool-adjacent cyan** persists (the P1(b) seabed effect — QUESTIONABLE,
not blown); Oceanic II→III **e90 saturation step**; sunset **green belt** a touch saturated (Rayleigh
bump); Coastal 9 could read "a hair more opaque" in the sunlit mid-field (the parked extinction tweak).

---

## What's SOLID — the baseline, don't regress

- **Lighting mood + glitter geometry** (`01-sun-heading`): warm/dim/glittery at low sun → neutral
  at 25° → bright-but-not-blown at 90°; the glitter road is correctly present toward the sun on
  `front`, absent on `side`/`behind`; clean horizons; no noon white-out on the open water.
- **Low-sun end of the elevation sweep** (both clarity halves): the 0°→12° reddening + dimming is
  correct and **nonlinear / front-loaded** (the air-mass behaviour the dense low-elevation samples
  were added to expose). The `e00→e12` jump dwarfs `e25→e90`, as intended.
- **Clear-water clarity ordering** (Oceanic I–III, Coastal 1): correct, monotonic Jerlov colour +
  visibility; Oceanic III & Coastal 1 land on their `WATER_TYPES` table metres.
- **Beauty / stress frames** (`04-beauty`): all plausible, zero artifacts — independently
  **re-confirmed the SSR horizon/crest fix holds** at the worst grazing frame.
- **Sea-state ladder** (`03-sea-state`): monotonic; the mid rungs (calm→moderate→rough) read well.

---

## Fix backlog (prioritised)

### P1 — Veil model rework (the throughline) — ✅ RESOLVED (see fix-pass banner above)

Two reviewers independently converged on the downwelling **veil** (`uWaterLightIntensity` /
`veilForSun` in `scene.ts`, and the `deep = uBackscatter/(a+uBackscatter)·light·veil` term in
`ocean.ts`). It is simultaneously **too weak** in one regime and **too dominant** in another:

- **(a) Turbid types don't differentiate** — the dominant defect. `02-clarity/{5-coastal-3 ..
  8-coastal-9}` all render the **same dark blue-teal**; Coastal 9 (should be near-opaque olive
  within ~1 m) looks like Coastal 3. Physics: the per-type body colour (Gordon's `R∞ =
  b_b/(a+b_b)`) × the low veil brightness crushes every turbid body toward near-black, so only the
  identical bluish **sky reflection** shows through → they look alike. Likely compounded by per-type
  **extinction `b` being under-applied** (seabed/pole still visible to ~3–4 m in Coastal 9 when it
  should be gone by ~1 m).
- **(b) Clear water clips at high sun** — `02-clarity/1-oceanic-i/e90` = a uniform "electric-cyan
  swimming pool" with blown highlights. The veil ramps UP with sun but **doesn't roll off** at the
  top; composited *after* tone-mapping, it dominates as exposure stops down at noon. (Exactly the
  `FIDELITY.md` "Sun-driven veil brightness" caveat.)

**Fix (one rework covers both):**
- Cap / roll off the veil at high sun (sublinear near the top) so clear water resolves to **deep
  blue**, not cyan, and highlights stop clipping.
- Give the veil enough magnitude / correct per-channel weight for **turbid** water to express its
  green→olive body colour across Coastal 3→9.
- Verify per-type **extinction** actually increases visibility falloff (Coastal 9 opaque by ~1 m).
- Because the veil is post-tone-map, consider tying its brightness to the **exposed** scene level
  (so it neither clips at noon nor vanishes at dusk) rather than raw elevation.

**Acceptance (via re-review):** Coastal 3/5/7/9 are clearly distinguishable in colour + Secchi
depth; Coastal 9 is near-opaque within ~1 m; Oceanic I `e90` reads deep blue with no blown-white
clip; the low-sun sweep stays correct.

### P2 — real, smaller  (all three ✅ RESOLVED this pass — see banner)

- **Reddening fades one elevation-step early** (`01-sun-heading` strongly; clarity concurs): `e04`
  reads like a ~12–15° sky (pale pastel) when 4° should still be distinctly warm/moody. Investigate
  the `Sky` Rayleigh/turbidity (or a warm-band model) at very low sun.
  *Acceptance:* `e04` frames stay visibly warm/orange, clearly between `e00` and `e12`.
- **`glassy` isn't a true mirror** (`03-sea-state/1-glassy`): the ripple normal is too strong for
  WMO-0, so rungs 1–2 barely separate. Ease ripple **strength/size toward flat** at the calm end
  (per-sea-state ripple, now that ripple size is its own axis).
  *Acceptance:* glassy reads near-mirror with long clean specular reflections, clearly calmer than `2-calm`.
- **Sea-state steepness is the weak axis** (`03-sea-state`): height grows up the ladder but crests
  stay **rounded swell** (not trochoidal peaking), so `very-rough` reads tame. Partly the documented
  gentle-sea constraint (`sea-conditions.md` §3) — push **steepness** at the top rungs.
  *Acceptance:* `5-rough`/`6-very-rough` show sharper, more peaked crests, not just taller swell.

### P3 — minor / watch

- ~~**Faint diagonal streaks** in mid-far water at `01-sun-heading/e25`,`e90`~~ — **DIAGNOSED**
  (2026-07-07): the ripple normal map minified at a hard grazing angle with **no anisotropic
  filtering**. It's largely a **capture-tool artifact** — the shot suite renders on SwiftShader,
  whose `getMaxAnisotropy()` ≈ 1, so it can't filter the grazing minification. Mitigated for real
  GPUs by raising `detailNormals.anisotropy` 4→16 (`ocean.ts`); this **cannot be verified through
  the SwiftShader captures** (they're unchanged by it) — confirm on a real GPU. The proper far-field
  fix remains the camera-following LOD grid (see `CLAUDE.md`).
- **Bright white steep-crest highlight** at high sun (`02-clarity` turbid `e25`/`e90`) — likely a
  near-clipped sky-env reflection on a steep Gerstner face (**not** foam, which is unbuilt). Confirm
  it isn't clipping to 1.0.
- **Buoy over-brightening / white waterline halo** at high sun — cosmetic (object albedos wash pale;
  soft-edge brightening at buoy bases).
- **Sunset sky's green band** (`04-beauty/sunset-backlit`) is a touch stylized — check `Sky`
  turbidity/Rayleigh at 0° if a classic deep-blue crown is wanted.
- **Low-sun glitter reads neutral-silver** — could carry more of the warm sky tint at ~4° sun.

Added by the 2026-07-07 re-review (second opinion):
- **Sun DISC stays white at e00/e04** — **INVESTIGATED → DEFERRED** (2026-07-07). The disc term
  (`vSunE·19000·Fex` in the `Sky` shader) is so far above the tone-map clip that any warm tint still
  clips all channels to white unless the disc is dimmed to ~0.1% of its intensity — which turns the
  bright sun into a weak coloured dot. The honest fix is an **HDR bloom + physically-tinted disc**,
  and bloom is deliberately **parked** (project `CLAUDE.md`). Left white until bloom lands; the
  surrounding sky reddening already carries the sunset mood (reviewers rated e00/e04 PLAUSIBLE/BETTER).
- **Oceanic I/II `e90` pool-adjacent cyan persists** — QUESTIONABLE (not blown/uniform; legit over
  the sunlit sandbar). This is the P1(b) seabed effect; a real fix is scene-side (dimmer/deeper debug
  seabed) or gameplay uses deep water (already deep-blue). Watch, don't chase.
- **Oceanic II→III `e90` saturation step** — a visible discontinuity where III's higher scattering
  starts veiling the seabed and the body colour wins; physically defensible, not perfectly smooth.
- ~~**Coastal 9 could read "a hair more opaque" in the sunlit mid-field**~~ — **DONE** (2026-07-07):
  bumped Coastal 7 scattering `b` 1.6→2.1 and Coastal 9 3.1→4.6 (`WATER_TYPES`, `ocean.ts`). C9's
  mid-far seabed mottling is now noticeably more extinguished (near-opaque olive), C7 stays clearly
  distinct/clearer than C9, and the C5→C7→C9 spacing widened cleanly. See `after3/02-clarity/{7,8}`.
- **Trochoidal peaking has headroom** — `5-rough`/`6-very-rough` are steeper but not sharply pinched;
  ties to the unbuilt foam/whitecap + steepness work (`sea-conditions.md` §6).

### Rig limitation (not a render bug)

The **Secchi pole is too short** to bracket the clear end — Oceanic I's ~40 m visibility is
unverifiable (pole/seabed never fully extinguish, so I vs II can't be told apart absolutely). A
**longer pole** or a **deeper/steeper seabed** would let future runs validate the clear end.

### Refraction (issue 1) — RESOLVED: lateral offset dropped

Verdict: **dropped the lateral refraction offset** (sample the see-through straight through). Any
nonzero screen-space offset *shears* a discrete object straddling the waterline — its above-water
half is composited straight, its underwater half samples an offset UV, so the two detach and the
submerged part tears on a wave face (worst on steep faces, large wave normal). A/B (clear water,
large waves, ~30° down) confirmed the **Snell-correct direction still tore the buoy** — the shear is
structural to any offset, not a direction bug. Refraction's beneficial see-through wobble needs a
*continuous* background (a seabed); none is shipped, and turbid default water hides it — so the
offset was net-harmful with no upside. **Parked, not killed:** revisit a **seabed-aware** offset
(gated near discrete floaters) when shallow water / islands land. See `FIDELITY.md` "Refraction offset
— dropped" + `CLAUDE.md`; before/after evidence in `.shots/refraction/90-refraction/`.

---

## Re-review protocol (how to reproduce this review)

After fixing, regenerate and re-dispatch. Five reviewer agents, one per group (clarity split in two
for depth). Each gets the SAME shared brief + its group spec, and is told to judge against
real-world photorealism, **not** the code (read-only; no edits, no capture tool).

**1. Regenerate under a label for a clean A/B.** The reviewed suite from THIS run is preserved at
**`.shots/baseline/`** (the "before"). Capture the fix under its own label so the two sit side by
side instead of overwriting: `node src/projects/shipwright/tools/shots.mjs "" after` → `.shots/after/`.
Because every frame is a frozen wave field, `baseline` and `after` are pixel-comparable frame-for-
frame — diff them directly (and hand both to the reviewers so they can judge the change, not just the
result).

**2. Shared reviewer brief (prepend to each):**
> You are an independent photorealism & ocean-optics reviewer for a three.js sea render (a Baltic
> archipelago sailing game). Judge each frame purely against how the REAL sea/sky/light look — no
> stake in the implementation. Ground yourself in `docs/FIDELITY.md`, the `WATER_TYPES` table in
> `ocean.ts` (Jerlov types + approx Secchi metres), and `docs/sea-conditions.md` (sea state). Water
> colour + clarity derive from Jerlov optics; lighting is sun-driven (low sun = warm/dim/glittery,
> high sun = bright but exposure-stopped-down, veil ramps with elevation). For EACH image give:
> expected, observed, and a verdict PLAUSIBLE / QUESTIONABLE / WRONG / ARTIFACT with a one-line
> physical reason. READ-ONLY. Final message = a structured report.

**3. Per-group specs** (image dirs under `.shots/`; filenames encode the parameters):
- **`01-sun-heading`** (10): `eNN-{front|side|behind}` = sun elevation 00/04/25° × camera-vs-sun
  heading; `e90-noon` = zenith. Water + sea constant. Judge: mood per elevation, glitter per heading,
  reddening at low sun, no noon white-out, clean horizon.
- **`02-clarity` (clear half)** (20): subfolders `1-oceanic-i … 4-coastal-1`, files
  `e00 e04 e12 e25 e90`. High oblique cam + seabed + Secchi pole. Judge: per-type colour + Secchi
  depth vs the table; the elevation veil sweep (dim/warm low → bright high, nonlinear).
- **`02-clarity` (turbid half)** (20): subfolders `5-coastal-3 … 8-coastal-9`, same elevations. Judge:
  do C3→C9 differentiate (colour green→olive, visibility 4 m→<1 m)? Same veil-sweep check.
- **`03-sea-state`** (6): `1-glassy … 6-very-rough`. High across-view. Judge: believable calm→rough
  escalation (height, steepness/peakiness, reflection scatter, buoy heel); glassy actually glassy.
- **`04-beauty`** (3): `glitter-low-sun`, `sunset-backlit`, `low-grazing-chop`. Judge: photorealism +
  mood, and hunt for artifacts (horizon seam, black crest edges, blown highlights) at the hard angles.

**4. Compile** the five reports into one prioritised list; diff against this doc's baseline to
confirm the P-items resolved and nothing regressed.
