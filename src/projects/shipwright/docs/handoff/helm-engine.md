# Handoff: helm + engine fixtures — VISUALS/PLACEMENT/STEERING done, PROPULSION + MASS next

**Goal.** Let a player build and *sail* a voxel ship. Two functional parts: a **helm** (a ship's wheel
that turns) and an **electric outboard engine** whose pod steers with the wheel and, eventually, drives
the hull through the water. The original ask was the mechanism (wheel turns → engine responds) with a
diegetic, no-hotbar/no-HUD feel. The mechanism is done; making it actually *move the boat* is next.

Code lives in `fixtures.ts` (the meshes), `builder.ts` (placement + steering input), with small hooks in
`physics.ts`, `player.ts`, `scene.ts`. The `fixtures.ts` module header documents the data model in full.

---

## DONE (committed) — fixtures, placement, steering

**Fixtures as meshes (`fixtures.ts`).** Helm (spoked wheel on a binnacle; brass **king spoke** points
straight up when centred) and engine (electric outboard: clamp bracket + powerhead + shaft + torpedo pod
+ prop). Built **list-first**: a body owns a *list* of fixtures and steering is a body-level scalar, so
multiple helms/engines "just work". Each `Fixture` exposes animation handles — `wheel` (helm), `steer` +
`prop` (engine) — in a canonical **+Z-facing local frame**; `fixtures.test.ts` pins that contract.

**Placement (`builder.ts`).** First-person: dev keys **1** = helm ghost, **2** = engine ghost (press
again to exit — NOT Esc, which releases pointer-lock). A translucent ghost tracks the aimed **top face**
and faces the ship-cardinal nearest your look (no rotation key). **Right-click** commits (same button as
placing a voxel); **left-click** removes a fixture you aim at, in any mode. Placement is refused unless
the whole **footprint** is free (`occupiedCells` — helm = a T; engine = its outboard column), so an
engine can't be driven into the hull. `Debug → fixture cells` overlays footprints.

**Steering (`builder.ts` + `player.ts`).** Stand at a helm (**distance + facing**, ~1.5 m and within
~53°, NOT a mesh hit — the wheel's open hub counts; it **glows** warm when grabbable) and press **E** to
take the wheel. **A/D** turn it and the angle **HOLDS** (no auto-centre). Steering is a per-body `Map`;
each frame every helm spins its `wheel` and every engine yaws its `steer` to match. Walking is suspended
at the helm via `player.ts` `controlLocked` (routed through a forward holder in `scene.ts` since builder
is created after player).

**Startup (`scene.ts`).** The raft spawns with a default helm (mid-deck, `[4,0,2]`, facing −Z/bow) and
outboard (stern gunwale, `[4,1,8]`, facing out) via the new read-only `physics.visuals()` +
`builder.placeFixture(...)`, so you can steer on load. Player starts facing the bow (`player.ts`
`yaw = 0`).

**Physics hooks (`physics.ts`).** Two read-only queries added: `hasVoxel(visual, cell)` (footprint
validity) and `visuals()` (seeding). Nothing else in physics changed.

### The critical caveat
**Fixtures are VISUAL-ONLY.** They are builder-owned, ridden by calling `physics.poseVoxel` every frame
(the same trick as the selection highlight), with **no mass, no Rapier colliders, and no physics
lifecycle.** Steering yaws the pod but does **nothing physical** — the boat does not move. The
`occupiedCells` build-blocking is a **builder-side stopgap**, not real collision.

---

## NEXT — propulsion + physics-ownership (one connected step)

1. **Fixture mass into the Rapier body/COM.** A helm/engine has weight. Add it so `body.recomputeMass…`
   folds it into the COM — an engine is heavy and mounts *low* (ballast), a helm's weight rides *high*
   (tippier). This is the shipwright tension Kyle wants; it's why mass matters before thrust.
2. **Engine thrust.** Apply a force to the hull in the pod's facing (fixture facing ± steering angle),
   at the engine's location, so the boat accelerates and steers. Add a throttle control (forward/reverse).
   The engine's `steer.rotation.y` already IS the physical yaw to push along.
3. **Make fixtures physics-owned.** Move the reserved cells + fixture lifecycle into `physics.ts` so they
   survive hull splits and so occupancy/removal/steering stop being a builder stopgap. Today, breaking the
   voxel under a fixture is unhandled (stale `visual` ref → `poseVoxel` on a dead cell) — this fixes it.
4. **Buoyancy participation.** AGREED model: a fixture's cells stay **VOID (air + floodable)**, NOT solid
   — a helm on a deck *inside the boat's side walls* is already enclosed buoyant air (see
   `../../flooding.ts` / `analyzeBuildVoids`); the fixture contributes only **mass**. **Open question Kyle
   raised:** the flood model today only fills *enclosed* compartments, so a helm open on deck wouldn't
   flood when submerged — extend flooding to fill any air-capable cell that goes underwater (open or
   enclosed) so a rolled-under helm space fills. Decide this when wiring buoyancy.

---

## Decisions made — do NOT relitigate

- **No hotbar, no HUD — diegetic throughout.** Dev keys summon a ghost; the ghost *is* the info; the helm
  glows to signal "grabbable". Dev keys are unshown on purpose (we memorise them; revisit for controllers).
- **Fixtures are meshes, not voxels** — a 0.5 m-voxel wheel can't spin or read as a wheel.
- **Orientation = look direction snapped to ship cardinals; no rotation key.** Engine facing is further
  constrained to the aimed outboard face.
- **Engine mounts by clamping to a deck-edge / gunwale outboard face** — this sidesteps the "player can't
  swim to the outside of the hull" problem. It mounts at the **centre** of the mount voxel.
- **Engine visual: electric outboard, ONE clamp bracket, STRAIGHT motor column.** The mid-motor
  "bracket-arm jog" (an L-bend) was tried and rejected; the powerhead-on-top restructure was also
  rejected — powerhead hangs below the clamp, motor column straight, only the top clamp bracket is
  horizontal. An above-water heading indicator (a handle) was tried and **removed** — deferred until the
  pod visibly steers, which is the honest cue.
- **Steering HOLDS (no auto-centre)**, like a real helm — the king spoke reads centre. The wheel spins
  `WHEEL_TURN_RATIO`× the pod yaw, kept **< π** so "king spoke straight up = centred" is unambiguous.
- **Helm grab = distance + facing, not a mesh hit** — precise crosshair-on-a-spoke felt wrong.
- **Buoyancy: fixtures add MASS, cells stay VOID.** (Corrected an earlier wrong assumption that a helm
  above the deck is never enclosed air — it is, if it's inside the hull's rim.)

## Gotchas / constraints

- **Tunables (`builder.ts` consts):** `MAX_STEER` (0.6 rad), `WHEEL_TURN_RATIO` (4), `STEER_RATE`
  (0.8 rad/s), `HELM_REACH` (1.5 m), `HELM_REACH_COS` (0.6 ≈ 53°), `HELM_HIGHLIGHT` (glow colour).
- **Default fixture positions** are cell coords in `scene.ts`'s `init().then()`. The raft is a 9×9 deck
  at y=0 with a y=1 perimeter wall (`shapes.ts` `RAFT`), so a helm needs an interior deck cell (top free)
  and an engine clamps to a stern *wall* cell (its top is free above the wall).
- **`builder.update(dt)`** takes the **render delta** (real seconds) for the hold-to-turn rate — steering
  is a control action, independent of `simSpeed`.
- **Steering SIGN** was flipped once (D turns wheel + pod the same way). If it feels inverted, the wheel
  sign is `s * WHEEL_TURN_RATIO` and the engine is `s`.
- **`poseVoxel` needs the body's post-step transform** (`prevPos`/`currPos`); seeding at `init` works
  because those are spawn-initialised before the first step.
- **Parallel water work is uncommitted** in the tree (`ocean.ts`, `../FIDELITY.md`, `../PERFORMANCE.md`,
  `public/shipwright/ripples/`, and `water-fidelity.md` here) — that's a *different* effort; don't stage
  or touch it when committing fixture work.
- **Working style (important):** Kyle wants concrete value *picks* with rationale, applied live, and he
  judges the RESULT — never a rack of sliders to "tune to taste". Own the calibration.
