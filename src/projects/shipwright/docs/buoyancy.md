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

**Shipped.** `physics.ts` `findTrappedAirCells` flood-fills each build (exported + unit-tested
in `physics.test.ts`), and `applyBuoyancy` gives the trapped-air cells buoyancy at zero mass +
zero drag. **The flood models the sea rising up + sideways but never falling *down* over a rim**,
so it recognises not just fully-sealed boxes but **open-top hulls** — the raft's interior air
layer and the boat hull below its gunwale both count (an intact upright hull floats on the air it
holds). Side/bottom breaches flood; dynamic rim-overtopping (a storm swamping a boat) stays
Stage 3, so this assumes rims sit above the waterline. A `TEST_SHAPES` "Sealed hull" (a dense box,
ρ = 1400 > water, that floats on its cavity) demonstrates the extreme case; a **"trapped-air cells"
Debug toggle** x-rays the classified air through the hull, and a **Physics "air-cavity buoyancy"
A/B switch** turns it off to watch a dense hull sink without it. The classifier is a **pure
function of the cell list** (not baked into the colliders or merged mesh), so the coming voxel
builder can re-run it per place/break to keep cavities correct in real time — the one runtime piece
still to add there is reallocating the buoyancy-point / air-overlay arrays when a build's cell
count changes (they're sized once today).

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

- **Orientation-correct trapped air (subsumes the Stage 1 static classifier).** Stage 1 classifies
  trapped air ONCE at build time, in the body's local frame with local +Y as "up" — only correct
  near the upright design pose. As a hull rolls/capsizes, its down-face changes: a `Bucket`'s open
  top swings under and its air should glug out, but the static set keeps floating it on phantom air.
  Stage 3 fixes this by recomputing the trapped-air/flooded split **each step against the actual
  world-space water surface and world-down** — flood the sea in from wherever it can reach at the
  hull's current orientation + draft; whatever enclosed pocket is left above the waterline is the
  buoyant air. (Fully-SEALED cavities are pose-independent, so they need no per-step recompute — an
  optimisation: only builds with openings need the dynamic pass.) A cheap interim stopgap is to gate
  open-pocket air off once a hull tilts past a threshold, but the world-space flood-fill is the real
  fix and is roughly the same work as the per-compartment tracking below.
- Track water **per sealed compartment**. When the ocean height at an **opening** (a gap in
  the shell, or the gunwale rim) exceeds that rim, water flows in: convert that compartment's
  sealed-air cells to **flooded** → buoyancy lost, water mass gained → the boat sits lower and
  can sink.
- Render interior water in flooded compartments at the flooded level (builds on Stage 2's
  interior-water path).
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
is pure and standalone, so the edit path is just — on a cell change, re-run `findTrappedAirCells`,
swap the per-body air-cell list, and reallocate the buoyancy-point + air-overlay arrays for the new
count (those are sized once at spawn today). No entanglement with the collider/mesh rebuild.
