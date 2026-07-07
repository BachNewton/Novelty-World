# Shipwright — Buoyancy / displacement overhaul (plan)

**Status: not started.** This is the next big physics/rendering effort for Shipwright.
A fresh session can pick it up from here. Read the repo-root `CLAUDE.md` "Water
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

### Stage 1 — Air-cavity buoyancy (foundational, moderate)

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

**Stage 1 → Stage 2 → Stage 3.** Stage 1 is the foundation (and immediately enables
dense/creative hulls + below-deck volume); Stage 2 fixes the visible water-inside-the-hull
glitch and is needed no matter what; Stage 3 is the rich gameplay and depends on both.
