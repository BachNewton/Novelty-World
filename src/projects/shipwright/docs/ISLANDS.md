# Shipwright Islands — the Finnish Archipelago target

What the islands are **supposed to look like**, and why. This is the companion to `FIDELITY.md`
(how the water looks) and `sea-conditions.md` (the wave spectrum). Ground blind reviewer agents in
this file when judging island frames — the same way `FIDELITY.md` grounds the water reviewers.
**Keep it updated** as terrain work lands.

The first target is the **Finnish archipelago** (Archipelago Sea / Åland / Turku). Caribbean is a
later, second archetype — see "The Caribbean tension" at the bottom, which is a real architectural
fork, not a parameter tweak.

---

## The thesis: a Finnish island is a DROWNED landform, not an ERODED one

The bedrock is Precambrian granite and gneiss — among the hardest rock there is — so erosion runs
*significantly slower than the post-glacial rebound* lifting the land 4–10 mm/year. The Baltic is
near-tideless. There is no surf machine grinding sand and cutting beaches.

> The shape of a Finnish island is **the shape the ice sheet left**, now being slowly hoisted out of
> the water. The waterline is not a landform — it is just where today's sea surface happens to cut a
> continuous, rolling sheet of ice-scoured bedrock.

Every visual rule below is a consequence of that one sentence. If a proposed change contradicts it,
the change is wrong.

**The generative consequence, which is why this doc exists.** An island is not a primitive. There is
no "mound, centred here, fading out." A radial falloff mask cannot produce a lineated chain of
skerries and will always read as a muffin — we built one and confirmed it. Instead: generate **one
continuous bedrock height field** and let **sea level cut it**. Islands, sounds, chains, and the
thousands of tiny skerries all fall out for free, with the right grain and the right size
distribution, because that is how the real ones formed.

A pleasant side effect: the underwater shelf stops being a separate "beach slope" primitive. It is
the same rock, continuing down.

---

## What it must look like

- **Never a broad light sand beach.** Rock meets water directly. No sediment supply, no tide to sort
  it. Loose material, where it exists, is boulder and cobble (washed glacial till) plus erratic
  boulders perched on smooth rock. **Rarely**, a small partial pocket of *dark, coarse, gravelly*
  sand in a sheltered hollow — this does happen and is worth having, but it is a pocket, not a
  shoreline. (An earlier draft of this doc said "no beach, ever", which is the kind of absolute that
  gets enforced in code and then defended. Corrected from first-hand Gulf of Finland observation.)
- **Smooth whaleback rock, with a GRAIN.** Glacial abrasion left elongate, smooth, striated bedrock.
  Islands are *lineated* — stretched and roughly parallel, running with the ice flow and the joint
  sets. **The archipelago has a direction.** (A Caribbean cay field does not. This is the single
  most diagnostic silhouette cue.)
- **Asymmetric profiles** (*roches moutonnées*): gently sloping and polished on the stoss side the
  ice came from; steeper, rougher, plucked on the lee side. *(Not yet implemented.)*
- **Very low relief.** Outer skerries 1–4 m above water. Medium islands 5–20 m. Åland's extremes
  rarely exceed 130 m. Profiles are low, undulating and **multi-summited** — never a single dome.
  Steep faces are short and occasional, not the whole flank.
- **Absurd island count, zoned by exposure.** ~50,000 islands, the largest archipelago on earth by
  count. Sheltered inner archipelago = large islands; outer = treeless rocks and storm-washed
  skerries. Most islands are small.
- **Banded shorelines, not gradient ones.** A near-continuous **black belt of _Verrucaria maura_**
  lichen at the water's edge, yellow *Caloplaca* above it, then grey and acid yellow-green map
  lichen on dry rock, then moss, heather, crowberry, juniper. Because there is **no tide**, the black
  band is **thin and crisp** — a sharp dark line, not a wide intertidal smear. Getting this band's
  *thinness* right is most of what sells the shoreline.
- **The surface is an EXPOSURE gradient, and it runs the opposite way to elevation.** This is the
  rule most easily got backwards, and we got it backwards: a first pass ramped pale lichen coverage
  *up* with height, which is a snow-line function, and the islands rendered as snow-capped peaks.
  The palest part of a real island is its **shoreline**, not its summit. Walking inland and upward
  from the water you pass:
  1. bare wave-scoured rock and rock faces at the waterline,
  2. a pale **lichen-crusted rock ring** just above the splash zone,
  3. **greyish-brown undergrowth** — heather, crowberry, lichen-heath, dead needles (grey-BROWN,
     not green),
  4. **densely packed spruce** on any ground with soil.
- **Vegetation is the island's visual MASS, not later polish.** Above the rocky rim, an inner- or
  middle-archipelago island is *forest*. Bald rock islands read as snow no matter how the rock is
  coloured. Zonation by exposure still holds — outermost skerries treeless; outer archipelago
  stunted, gnarled pine + juniper; inner archipelago dense spruce — but the zone the GAME is set in
  (the one you land on and gather from) is the forested one.
- **Height is the wrong gate for vegetation; SHELTER is.** A skerry is bare because it is exposed and
  holds no soil, not because it is short — so "trees above height X" would plant spruce on every 4 m
  rock. The generator separates the two for free: bedrock is `broad + detail`, and a skerry is a
  place where `broad` sits near or below sea level and only the metre-scale `detail` pokes it above.
  Gate soil and forest on **`broad`**, and skerries stay bare while island interiors forest up, at
  zero extra noise cost.
- **Palette.** Pink-grey rapakivi and grey gneiss; white-grey and acid yellow-green lichen mottling;
  the black waterline band; grey-brown undergrowth; dark spruce green; silver deadwood. Rock albedo
  is LOW (0.2–0.35) — a first pass near 0.6 rendered as bone-white. Nothing is saturated or tropical.
- **Water: Coastal 5** — brackish, CDOM-stained, dark green-brown, visibility a few metres. This is
  already Shipwright's default water type (`ocean.ts` `WATER_TYPES`), and it is the correct one.
  Clear turquoise shallows are a **Caribbean** look and are WRONG here.

### The checklist reviewers should score against

| Quality | Target |
|---|---|
| Silhouette | Low, undulating, multi-summited; elongated along a shared grain |
| Relief | Skerries 1–4 m; medium islands 5–20 m; steep faces short and occasional |
| Shoreline | Rock into water; crisp thin black lichen band; boulders; rare dark-gravel pocket |
| Underwater | Same rock, continuing down; dark, not sand |
| Surface | Bare rock at the water → pale lichen ring → grey-brown undergrowth → spruce. Never paler with height. |
| Vegetation | Skerries bare; sheltered interiors densely forested. Gated on `broad`, not height. |
| Water | Coastal 5, dark green-brown, visibility a few metres |
| Count | Many, clustered, mostly small |

**Fastest sanity check:** if the tops of the islands are the palest part of the frame, it is wrong.

---

## Known issues at the island/water boundary

- **Sawtooth waterline (open).** A regular triangular fringe rings land at exactly sea level. Its
  period matches the ocean's **~4.9 m quad size**, not the terrain's 1 m sampling: the ocean's coarse
  displaced mesh interpenetrates the slope. Invisible on open water. **Predicted to get WORSE with
  the Finnish target**, because a gentle polished slab meets the water at a near-tangent angle, so the
  cut line is far more sensitive to where the ocean's vertices land than a steep flank was.
  The fix at the source is **depth-attenuated waves** (waves must shoal and flatten as the water
  shallows, in the vertex shader **and** in `sampleSurface`, kept in lock-step per `CLAUDE.md`).
  A camera-following LOD ocean and a foam line both also help.
- **Blown-out shallow rim — RESOLVED.** The shallowest water clipped to near-white cyan over the v1
  island's bright *sand*. Finnish bedrock is dark above and below the waterline, which removed the
  bright background. No shader change was needed. Watch for it returning anywhere pale rock meets
  shallow water.

- **The sun:sky lighting balance is inverted, scene-wide (open, and it is not only an island bug).**
  Measured on a sun-facing slope at fixed exposure, with each source isolated:

  | source | intensity | land luma |
  |---|---|---|
  | directional sun | 2.5 | 15.1 |
  | hemisphere | 0.5 | 4.7 |
  | **PMREM sky env** | **1.0** | **87.5** |

  The sky out-lights the sun ~5.8 : 1 on land. Reality is the other way round — direct sun on a
  facing surface is roughly 4–6× the skylight. Consequences: lit from every direction by a bright
  dome, rock has no form and shadows have almost nothing to remove (the sun contributed **1–8 %** of
  the land's brightness at *every* azimuth tested). The islands read as smooth cream dunes. This is
  the **diffuse twin** of the specular "IBL sheen / noon goes white" problem in `FIDELITY.md`.

  Not fixed scene-wide, because `scene.environmentIntensity` is global and the water's whole look
  (veil, SSR fallback, `envIntensityForSun`) is tuned around it. Instead the land dims its own share
  via a per-material `envMapIntensity` (0.22 bedrock, 0.3 spruce). **The proper fix — raising the sun
  relative to the sky — is a water-side decision and would probably also close `FIDELITY.md`'s "sun
  glitter is a milky smear" gap, since that too is a sun-too-weak symptom.**

  ⚠ **three.js trap:** `material.envMapIntensity` is IGNORED on any material that has no `envMap` of
  its own and merely inherits `scene.environment` — the renderer overwrites the uniform with
  `scene.environmentIntensity`, and only restores the material's value inside `if (material.envMap)`.
  The land's materials therefore explicitly own the same PMREM texture (`Terrain.setEnvironment`,
  re-pointed on every sun re-bake). Setting `envMapIntensity` alone changed *nothing*, byte for byte.

- **Shadows exist now, and their frustum follows the VIEW, not the camera.** A directional shadow
  frustum anchored at the camera's *position* silently drops every shadow when an overhead look-at
  camera sits 300 m from what it frames. Because this world is a sea at y = 0, the frustum is
  anchored where the view ray meets the water (falling back to a fixed distance ahead when the eye
  looks level or up). Only the terrain and spruce cast/receive; the ocean deliberately does not.

## What islands unlock (from the `FIDELITY.md` backlog)

Islands are the seabed that three parked items were waiting for:
- **Shoreline foam** — needs a breaking scalar and a seabed. The water already computes column
  thickness for its soft edge, so a foam band keyed on that is a small fragment-shader addition.
- **Seabed-aware refraction offset** — the lateral see-through offset was dropped because it shears
  discrete objects straddling the waterline. A continuous seabed is the background the technique
  needs; revisit it *only* gated on a large, continuous water column.
- **Wave shoaling** — see the sawtooth above. This is a correctness issue, not only a looks one: a
  2 m swell must not lift a hull floating in 30 cm of water over a skerry, and `sampleHeight` will
  cheerfully agree with the shader that it should.

---

## The Caribbean tension (a fork, not a slider)

A Finnish island is **erosional/drowned**: cut a continuous bedrock field with sea level.
A Caribbean cay is **constructional**: a carbonate reef platform grew upward, and a sand cay
accumulated on top. That genuinely *is* a discrete radial form, placed — the primitive Finland
does not have.

So "biome" cannot be only a struct of numbers interpolated along a climate axis. It is a **strategy**:
which generative primitive builds the land. Two archetypes can still coexist in one world (a climate
field choosing which generator runs in a region, blended at the boundary), but the interface must
admit that from the start rather than assume a lerp between parameter sets.

Finland is the priority. Do not compromise it to keep a Caribbean lerp cheap.

---

## Validating island changes (the review loop)

Same loop as the water (see `FIDELITY.md`):
1. **Capture** `node tools/shots.mjs 05-islands <label>` with the dev server on :3001. Use
   **`SHOTS_GPU=1`** for anything judged on material or lighting — SwiftShader renders darker/greener
   and would have you tuning against a lie. Leave it off for pixel-exact A/B regression.
2. **Re-review** with **fresh, blind reviewer agents** — no code context — grounded in *this* file's
   checklist. Ask for a per-frame verdict (PLAUSIBLE / QUESTIONABLE / WRONG / ARTIFACT + a physical
   reason) and a ranked list of what still looks wrong.
3. **Judge against the real Archipelago Sea**, not against taste and not against the brand palette.
