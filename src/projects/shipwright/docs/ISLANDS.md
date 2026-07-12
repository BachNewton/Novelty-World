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

### The spectrum rule: an archipelago needs a scale ABOVE the island

Cutting a continuous field with sea level is necessary but **not sufficient**. What the field's
*amplitude spectrum* looks like decides whether you get an archipelago or a gravel field, and the
failure is invisible from inside a small window.

The first field's largest scale was 520 m — *smaller than the structures an archipelago is organised
into*. Nothing modulated land on and off across kilometres, so it produced noise-cap islands at
uniform density forever. Measured over 9 km²: **1,568 islands, not one above 10 ha**, largest 9 ha,
and every 500 m tile holding 11–13 % land. No open basins. No dense inner archipelago. No landfall
worth sailing toward, and — critically — **no exposure gradient for any of the zoning rules below to
hang on**, because every part of the world was equally exposed.

> A real archipelago has a **size hierarchy** and **zoning**. Both come from spectral power at a scale
> *above* the island scale. `SUPER_RELIEF` (35 m at 2100 × 1250 m) is that scale, and it is what makes
> a region be inner archipelago, outer skerry field, or open basin.

At 35 m the same 9 km² yields 3 islands over 10 ha (largest 50 ha), 9 of 25 tiles open water and 6
dense — while the skerry fringe survives. At 50 m the mid-size class collapses and the count halves:
the archipelago stops being Finnish. `terrain.test.ts` pins the zoning, so a regression to the flat
spectrum fails a test instead of quietly looking boring.

**Corollary, and it bites:** `SEA_LEVEL_BIAS` is **solved against the field, not chosen**. Add power at
any scale and it must be re-solved, or the new relief simply floods or drains the world. It moved
−8.8 → −15.0 when `SUPER_RELIEF` landed, for *no change* in land fraction.

**Second corollary:** a single 600 m window may now legitimately contain **no land at all**. That is
the zoning working. Anything measured about the field's character has to be measured over kilometres —
one window proves nothing, and two tests that sampled one window had to be rewritten when this landed.

**And it is not finished — the same failure exists ONE LEVEL UP.** Charted at 50 km
(`npx tsx tools/map.ts wide.png --span 50000 --px 1600 --ss 3`), the world is **statistically
homogeneous**: the same texture edge to edge, no mainland, no coast, no edge to the archipelago, no
open Baltic. The largest scale in the field is `SUPER_RELIEF`'s 2100 m, so beyond a couple of km
nothing organises anything. Whether that matters is a **scope** question and should be settled before
anyone picks a world size: invisible if the playable world is a few km, felt if players can sail tens
of km. The fix would have the same shape — a scale *above* `SUPER_RELIEF`, a coastline/basin scale
that says "here the archipelago ends." See `MAPS.md`, which is also where the tool lives.

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

- **The sun:sky lighting balance was inverted scene-wide — FIXED.** The sky used to out-light the sun
  ~21 : 1 in linear terms, so rock had no form and shadows had almost nothing to remove; the islands read
  as smooth cream dunes. The land dodged it with a per-material env scale (0.22 bedrock, 0.3 spruce) plus
  a `Terrain.setEnvironment` that re-pointed the PMREM texture onto those materials just so three would
  honour the value. **All of it is deleted.** The land is now lit by the same sun and the same sky as the
  buoys, the raft and the sea, and a blind reviewer's verdict on the after-frames was: *"rock now has real
  form — lit sun-facing slopes, shadowed lee sides, legible whaleback relief"*. See `docs/lighting-log.md`.

  ⚠ **The three.js trap that forced the hack, kept because it will catch someone again:**
  `material.envMapIntensity` is IGNORED on any material that has no `envMap` of its own and merely
  inherits `scene.environment` — the renderer overwrites the uniform with `scene.environmentIntensity`,
  and only restores the material's value inside `if (material.envMap)`.

  ⚠ **Watch item.** The rock's albedos were dialled under a sky-dominated light. Under a correct
  sun-dominated one, a reviewer flagged sunlit bedrock as reading a touch pale ("snow-cap risk", the very
  failure this doc warns about). Re-check the palette against wet-and-dry Baltic granite now that the
  light is right; do not re-introduce a per-material lighting exception to fix it.

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

## The realism-vs-gameplay tension (OPEN — a design choice, not a bug)

`SUPER_RELIEF` is where realism and playability may actually pull against each other, and it is worth
being honest that this is **a design decision, not a technical one**.

- **`SUPER_RELIEF = 35` (shipped).** Accurate: main islands with scattered skerries around them, dense
  inner archipelago, open basins between. Matches the real Archipelago Sea. But it means the world is
  **uneven** — some regions are rich and some are empty water, and a player can sail into a basin with
  nothing in it.
- **`SUPER_RELIEF = 0` (the old field).** Inaccurate — no size hierarchy, no zoning — but the islands
  come out evenly sized and roughly evenly spaced, which may make for **more consistent gameplay**: a
  steadier drip of landfalls, gathering sites, and things to do, wherever the player goes.

Kyle raised this and it is genuinely open. The mitigations if realism wins (dense regions being
*worth* sailing to; basins being short; nav marks and charts making the emptiness legible rather than
frustrating) are gameplay work, not terrain work — so this cannot be settled from inside `terrain.ts`.

The saving grace: it is **one constant**, so the choice stays cheap and reversible right up until
resource gathering (roadmap #8) tells us how empty water actually feels to play. Don't let it calcify
into a fork.

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

**Chart it first.** `npx tsx tools/map.ts out.png --span 3000 --window` renders the field top-down
and prints the island size distribution + the zoning statistic — no browser, no GPU. Anything about
the field's *structure* is invisible from inside a 600 m window and obvious on a map; that is how the
flat-spectrum bug survived. See `MAPS.md`. Then, for anything about light, material or silhouette:

Same loop as the water (see `FIDELITY.md`):
1. **Capture** `node tools/shots.mjs 05-islands <label>` with the dev server on :3001. Use
   **`SHOTS_GPU=1`** for anything judged on material or lighting — SwiftShader renders darker/greener
   and would have you tuning against a lie. Leave it off for pixel-exact A/B regression.
2. **Re-review** with **fresh, blind reviewer agents** — no code context — grounded in *this* file's
   checklist. Ask for a per-frame verdict (PLAUSIBLE / QUESTIONABLE / WRONG / ARTIFACT + a physical
   reason) and a ranked list of what still looks wrong.
3. **Judge against the real Archipelago Sea**, not against taste and not against the brand palette.
