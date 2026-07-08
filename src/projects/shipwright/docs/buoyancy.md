# Shipwright — Buoyancy / displacement overhaul (plan)

**Status: Stages 1 + 3a + 3b shipped.** Air-cavity buoyancy AND compartment flooding are in
(`physics.ts`): dense sealed hulls float on their enclosed air, and a breached hull floods to the
waterline through its holes (orifice-rate inflow) and founders. **Still open: Stage 2** (stop the
ocean drawing inside a slammed hull) and **Stage 3c** (render interior water in flooded compartments).
A fresh session can pick those up from here. Read the repo-root `CLAUDE.md` "Water architecture" (the
HYBRID floating decision) and `physics.ts` first.

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
pose. That static classifier has since been **replaced** by the per-step world-space model
(`analyzeBuildVoids` build-time graph + the buoyancy loop's per-compartment water level, Stage 3a→3b)
— which is orientation- and waterline-correct. What remains from Stage 1: buoyancy at zero mass + zero drag applied at each
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

- **Stage 3a — orientation-correct trapped air. ✅ DONE (per-step flood since replaced by 3b's level).**
  `analyzeBuildVoids` pre-builds two things
  per build ONCE: the void graph, and a static **`enclosed` mask** (air-*capable* cells — those the
  sea can't reach by rising + moving sideways, i.e. below a rim; orientation-free shape geometry).
  Then each step (in 3a) a `floodSea` BFS flooded the outside sea through the voids whose centre is under
  the live ocean surface, seeded from the ones exposed on the bounding-box faces. **Trapped air = enclosed
  AND not flooded**, buoyant by submerged fraction. The two masks split the labour: `enclosed` rules out
  *open* volume so decorative geometry (a `Crown raft`'s merlons) never counts as air, while the
  per-step flood makes flooding orientation- + waterline-correct: capsize a `Bucket` → its mouth goes
  under → floods (phantom air gone); swamp a rim → floods; a sealed pontoon → air in any pose. Visible
  live in the "trapped-air cells" x-ray as shapes roll. Same per-cell cost as the static version, so
  no perf change. Deterministic (pure of body pose + sim clock). Unit-tested in `physics.test.ts`.
  Test shapes for it: five **stability buckets** (open-top, dense, wall heights h3→h10 → a spectrum
  from "swamps on the splash-down" to "takes the plunge and bobs back up") and the **crown raft**
  (decorative merlons that add no air). A shallow bucket sinking on a hard drop is EXPECTED — the
  entry force drives its low rim fully under and it ships water.
- **Stage-3a flooding was ALL-OR-NOTHING per cell (`floodSea`), now SUPERSEDED by 3b.** Each step a BFS
  flooded the sea through fully-submerged voids from the exposed cells; a cell the sea reached lost its
  air that frame. A per-cell finite-fill `voidWater` had been tried before that and dropped (it faked a
  slow inflow the visuals didn't back). Stage 3b below replaced the BFS entirely with a per-compartment
  water LEVEL, which gives an honest finite fill (backed by a real level, not a fudge) — so `floodSea`
  and the wet/all-or-nothing gate were deleted.
- **Runaway guard (robustness).** The water model is tuned for gentle seas; cranking the wave sliders
  hard launches bodies and can pump energy until Rapier's WASM solver hits a non-finite value and
  traps (`"unreachable"`), which used to hard-freeze the app. Now each step clamps any body's speed
  back under a cap (`MAX_LINVEL`/`MAX_ANGVEL`) so the solver's inputs stay finite, and the whole
  stepping loop is wrapped so a trap (if one ever slips through) stops the sim and freezes the bodies
  instead of crashing the scene.
- **Stage 3b — compartment fill level + water weight. ✅ DONE.** Replaces the all-or-nothing flood with a
  per-compartment fill level (stored as a pose-invariant FRACTION), so a breached hull fills through its
  holes and founders while a sealed one stays dry. As built (model confirmed with Kyle):
  - **Compartments.** `analyzeBuildVoids` now also returns a `compartment` id per void — connected
    components of the ENCLOSED void graph (a bulkhead makes two). `groupCompartments` (pure, at setup)
    lists each compartment's cells + **openings**.
  - **Openings** = where the sea meets a compartment: (a) its own EXPOSED cells (a hole flush with the
    hull, e.g. an open-top rim — the only openings an upright bucket has, since nothing sits above it),
    plus (b) OPEN voids face-adjacent to it (a side/bottom breach). A **fully sealed** compartment has
    NO openings → it never floods, keeping its air at ANY depth (seal your hull to survive submersion).
  - **Fill FRACTION per compartment** (persistent sim state, 0..1, integrated at `FIXED_DT`, reset dry
    on respawn). The state is a *fraction*, NOT a world height, so it's **pose-invariant** — it tracks
    the hull as it bobs/sinks/rolls. (A world-height level was tried first and was buggy: frozen at
    spawn, it spuriously flooded a compartment's cells one layer at a time as the body settled *down*
    into the sea — even a sealed box sank.) Each step: sample the sea at the compartment centroid
    (`ext`, a representative waterline — the surface varies per x,z); if any opening is **below `ext`**,
    the sea pours in toward **sea level**; else drain out the lowest opening. The fraction then realizes
    to a world FLOOD LEVEL for the current pose (`dryFloor + fraction·span`); a cell is flooded iff its
    centre is below it (world-horizontal, so water pools to a heeled hull's low side). This is Kyle's
    condition — *a cell holds water iff it's below the current wave surface AND reachable from a
    submerged opening* — evaluated at compartment granularity, plus the gradual fill rate below. **We
    deliberately DON'T cap the fill at the highest hole to trap air above it (a diving-bell seal)** — at
    0.5 m voxels that edge case isn't worth simulating, so any submerged hole just floods (an upside-down
    bucket sinks). Air is trapped ONLY in a fully sealed compartment.
  - **Orifice (Torricelli) fill rate.** `dL/dt = fillRate · Cd · Σ_holes √(2g·head) / footprint`, so how
    fast a compartment fills depends on how open it is (a wide mouth ≈ its own cross-section → floods in
    ~a second; a small cannon hole → trickles) and how deep the hole sits (bigger head → faster; deeply
    submerged → near-instant). Draining is the same law with head = the interior water above a hole.
    `footprint` = mean cells per vertical layer; `params.fillRate` (GUI "flood rate") scales it live.
  - **Water weight.** A flooded cell carries `ρg·(1−submerged)·V` **downward** at its point: a submerged
    flooded cell nets ~zero (its lost air lift equals the water's weight), while water perched above the
    sea (a heeled/awash hull) pulls down for real. Because `L` is world-horizontal, water pools to the
    low side of a heeled hull → the "extra water → submerges more openings → cascade" capsize feedback.
- **Still TODO — render interior water** in flooded compartments at level `L` (Stage 3c; builds on
  Stage 2's interior-water path). This is the "water only enters over the edge" behaviour and the
  storm-stakes gameplay; a sealed, un-flooded compartment is dry walkable below-deck air.

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
