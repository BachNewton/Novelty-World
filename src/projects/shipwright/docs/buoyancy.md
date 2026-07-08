# Shipwright — Buoyancy / displacement overhaul (plan)

**Status: Stage 1 shipped.** Air-cavity buoyancy is in (`physics.ts`): dense sealed hulls
float on their enclosed air. Stages 2 (ocean interior masking) and 3 (compartment flooding)
are next. A fresh session can pick those up from here. Read the repo-root `CLAUDE.md` "Water
architecture" (the HYBRID floating decision) and `physics.ts` first.

## Why (the goal)

We want **real displacement buoyancy**, so that:

- **Dense hulls float by the air they enclose**, not by being built of light,
  individually-buoyant voxels. A steel-heavy shell around a big air cavity should float
  high — like a real boat — which frees ship-building from "every block must be less
  dense than water."
- **A below-deck exists** — sealed interior air volume you can build and (later) walk in.
- **Water only enters a hull when it actually crests an edge** (the gunwale, or a gap in
  the shell), not through the hull bottom. Rough seas that wash over the rail should
  genuinely swamp and sink a boat — real stakes, and a reward for good hull design.

## What's wrong today

`physics.ts` `applyBuoyancy` gives **each solid (material) voxel** an Archimedes up-force
proportional to *its own* submerged fraction (`ρ_water·g·submergedVol` at the voxel's
point; torques emerge because each force is at its own point). A hollow hull floats only
because its **shell** voxels displace water and the total mass is low; the **enclosed air
does nothing** — it contributes no buoyancy. Consequences:

- A boat must be built so its *shell alone* displaces enough — you can't float a dense
  hull on trapped air, and there's no notion of a sealed compartment.
- **The visible glitch Kyle reported:** when the raft slams down hard, the water surface is
  seen *inside* the hull. That is a **rendering** problem, separate from the buoyancy math:
  the ocean is a single global Gerstner height field drawn **everywhere**, including inside
  the hull's footprint, so on a slam the rendered surface pokes up through the interior. It
  will still happen with perfect buoyancy — the renderer has to be told that volume is
  enclosed air.

## Target model

Buoyancy = displaced water volume of the **watertight hull, including its enclosed air
cavity**, applied at the centre of buoyancy (emergent from per-cell forces). Weight = only
the **material** cells' mass. A sealed compartment that floods loses its air's buoyancy and
gains water mass, so it sits lower / sinks.

## Staged plan

### Stage 1 — Air-cavity buoyancy (foundational, moderate) — ✅ DONE

**Shipped, then superseded by the Stage 3a dynamic model below.** The first cut classified trapped
air ONCE at build time in the body's local frame (a "sea rises + sideways, never down over a rim"
flood). It floated open-top hulls (raft, boat) as well as sealed boxes, but only near the upright
pose. That static classifier has since been **replaced** by the per-step world-space flood (Stage 3a)
— `analyzeBuildVoids` (build-time graph) + `floodSea` (per-step) — which is orientation- and
waterline-correct. What remains from Stage 1: buoyancy at zero mass + zero drag applied at each
air cell's point, the `TEST_SHAPES` "Sealed hull" (ρ = 1400 > water) + edge-case demos, the
**"trapped-air cells"** Debug x-ray, and the **"air-cavity buoyancy" A/B switch**. The build-time
graph is still a **pure function of the cell list**, ready for the voxel builder to re-run per
place/break — the one runtime piece still to add there is reallocating the buoyancy-point /
air-overlay arrays when a build's cell count changes (they're sized once today).

Original spec, for reference:

Classify every cell of a build as **material** / **sealed-air** / **open-water**:

- Flood-fill empty cells from *outside* the build's bounding box. Empty cells the fill can't
  reach = **sealed air** (an enclosed cavity). Cells it reaches = open (real water lives
  there). Recompute when the build changes (add/remove a voxel) — cheap at these sizes.
- In the buoyancy loop, give **sealed-air cells buoyancy too** (they displace water, gated
  by submerged fraction like material cells) but **zero mass**. Now a small dense shell
  around a big air volume floats high — a real boat — and below-deck volume falls straight
  out of this.
- This is a local change to `applyBuoyancy` (add the classified air cells to the force loop)
  plus the classification pass. The collider set is unchanged (still one cuboid per material
  voxel); only the buoyancy sampling gains the air cells.

### Stage 2 — Ocean interior masking (fixes the visible glitch; separate rendering work)

Stop drawing the global ocean surface inside sealed interiors. Options to evaluate:

- **Stencil / depth mask:** render the hull interior to a mask and discard ocean fragments
  inside it. Has to play with the screen-space water composite (`ocean.ts`) — the trickiest
  integration point.
- **Per-compartment water level:** a sealed compartment simply has *no* interior water until
  it floods (Stage 3); render interior water only where a compartment is flooded, at that
  compartment's level.

Needed **regardless** of the buoyancy math — even perfect Stage 1 buoyancy leaves the global
surface visually intruding into a slammed hull.

### Stage 3 — Compartment flooding + interior water (the gameplay layer, largest)

- **Stage 3a — orientation-correct trapped air. ✅ DONE.** `analyzeBuildVoids` pre-builds two things
  per build ONCE: the void graph, and a static **`enclosed` mask** (air-*capable* cells — those the
  sea can't reach by rising + moving sideways, i.e. below a rim; orientation-free shape geometry).
  Then each step `floodSea` floods the outside sea through the voids whose centre is under the live
  ocean surface, seeded from the ones exposed on the bounding-box faces. **Trapped air = enclosed AND
  not flooded**, buoyant by submerged fraction. The two masks split the labour: `enclosed` rules out
  *open* volume so decorative geometry (a `Crown raft`'s merlons) never counts as air, while the
  per-step flood makes flooding orientation- + waterline-correct: capsize a `Bucket` → its mouth goes
  under → floods (phantom air gone); swamp a rim → floods; a sealed pontoon → air in any pose. Visible
  live in the "trapped-air cells" x-ray as shapes roll. Same per-cell cost as the static version, so
  no perf change. Deterministic (pure of body pose + sim clock). Unit-tested in `physics.test.ts`.
  Test shapes for it: five **stability buckets** (open-top, dense, wall heights h3→h10 → a spectrum
  from "swamps on the splash-down" to "takes the plunge and bobs back up") and the **crown raft**
  (decorative merlons that add no air). A shallow bucket sinking on a hard drop is EXPECTED — the
  entry force drives its low rim fully under and it ships water.
- **Flooding is ALL-OR-NOTHING per cell (a rate-limited version was tried and dropped).** A per-cell
  `voidWater` that filled at a finite rate was implemented, but it made hulls look like they floated
  too long after the rim went under — faking a slow inflow the visuals/physics didn't back. A fully
  open hole floods fast, so we reverted to honest all-or-nothing: a cell the sea reaches loses its air
  that frame. The realistic finite fill (and *where* the water stops) comes with the compartment
  water-level model below, not a fudge factor. (A sealed below-deck is still never sea-reachable, so it
  keeps its air at any depth — that's from the `enclosed`/flood split, not the rate.)
- **Runaway guard (robustness).** The water model is tuned for gentle seas; cranking the wave sliders
  hard launches bodies and can pump energy until Rapier's WASM solver hits a non-finite value and
  traps (`"unreachable"`), which used to hard-freeze the app. Now each step clamps any body's speed
  back under a cap (`MAX_LINVEL`/`MAX_ANGVEL`) so the solver's inputs stay finite, and the whole
  stepping loop is wrapped so a trap (if one ever slips through) stops the sim and freezes the bodies
  instead of crashing the scene.
- **Stage 3b — compartment water level with air-trapping (NEXT — the big one, model confirmed with
  Kyle).** The current flood fills *every* submerged sea-reachable cell. The real model fills a
  compartment only up to its **opening level, trapping air above** — Kyle's "a cannon hole below the
  waterline fills up to the height of the hole, air stays above." Plan:
  - **Group** the enclosed voids into **compartments** (connected components of the enclosed void
    graph — the bulkhead already makes two). Precompute a compartment id per void, alongside
    `analyzeBuildVoids` (static; re-run on build edits).
  - Track a **water level `L` per compartment** (persistent sim state, integrated at `FIXED_DT`).
    Each step: find the compartment's openings (its exposed cells) and their world heights; if any is
    **below the external waterline** (submerged → an inflow path), raise `L` toward
    **`min(external waterline, highest opening height)`** at a finite rate; else drain. A cell is
    flooded iff its centre is below `L`. (This replaces the current all-or-nothing per-cell flood.)
  - **Water mass / weight.** A *submerged* flooded cell is already neutral — losing its air buoyancy
    equals the water's weight, which is why dense hulls sink and light ones swamp awash today. What's
    still missing is water carried **above** the external waterline (a heeled/pitched boat, or water
    perched above sea level inside the hull): add its **downward weight** `ρ·g·V` at that cell so a
    tilted, part-flooded boat is pulled down realistically. This is the "extra water lowers the boat →
    submerges more openings → cascade" feedback in full.
  - **Wave/waterline caveat to handle:** the external surface varies per (x,z) with the waves; pick a
    representative level per compartment (surface at its centroid, or per-opening) — don't assume a
    flat sea. Also note the coarse ocean-mesh tessellation can render the surface a touch below the
    analytic CPU height on sharp crests (see root `CLAUDE.md`), so "rendered water looks over the rim
    but CPU says not quite" is a known cosmetic mismatch, not a physics bug.
- **Render interior water** in flooded compartments at level `L` (builds on Stage 2's interior-water
  path).
- This is the "water only enters over the edge" behaviour and the storm-stakes gameplay.
  It also completes below-deck: a sealed, un-flooded compartment is dry walkable air.

## Hard parts (call these out when scoping)

- **Sealed-vs-open connectivity** — the flood-fill classification, kept correct as the ship is
  built and (later) damaged. Openings (where water can enter) come out of the same analysis.
- **Ocean masking with screen-space water** — the water is a patched `MeshStandardMaterial`
  screen-space composite (refraction/depth/SSR off one capture; see root `CLAUDE.md`), so
  masking it out of hull interiors isn't a trivial clip — plan this integration carefully.
- **Per-compartment water sim** — level, inflow over rims, draining, and its effect on mass +
  centre of gravity.

## Constraints to keep

- **Determinism** (host-authoritative multiplayer): buoyancy + flooding must stay a pure
  function of body/world state + the fixed sim clock — no wall-clock, no `Math.random`. The
  sim already runs a fixed timestep; keep it that way.
- **Metric, 0.5 m voxel** (see root `CLAUDE.md` "Scale & units").
- Buoyancy stays scoped to physics (`physics.ts`) and its rendering to `ocean.ts` — don't
  entangle the two beyond the masking hand-off.

## Suggested sequence

**Stage 1 → Stage 2 → Stage 3.** Stage 1 (✅) is the foundation (and immediately enables
dense/creative hulls + below-deck volume); Stage 2 fixes the visible water-inside-the-hull
glitch and is needed no matter what; Stage 3 is the rich gameplay and depends on both.

**Interaction with the voxel builder (roadmap #5, likely next).** Players placing/breaking
voxels will change the sealed-air classification live. Stage 1 was built for this: the classifier
is pure and standalone, so the edit path is just — on a cell change, re-run `analyzeBuildVoids`,
swap the per-body air-cell list, and reallocate the buoyancy-point + air-overlay arrays for the new
count (those are sized once at spawn today). No entanglement with the collider/mesh rebuild.
