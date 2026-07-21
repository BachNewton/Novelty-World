# Handoff: helm + engine fixtures — VISUALS/PLACEMENT/STEERING + anisotropic hull drag done, PROPULSION + MASS next

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

## NEXT — the agreed ordering (a design pass narrowed the plan; see "Hydrodynamics" below)

Steps in the order we settled on. **The load-bearing decision is #1** — everything else is judged
against how the hull feels once drag has direction.

**Where we paused (this session).** Step 1 (anisotropic face drag) is landed and the debug thrust is
wired; Kyle drove the raft and **validated it by feel** — control + turning feel natural (so the debug
thrust's turn sign is good), and the two "off" feelings are both physically *correct*, not bugs:
- the engine feels a touch **underpowered** → right for an electric outboard on a 5.6 t barge;
- the boat **stops fast** when the throttle cuts → the square raft's high wetted-face-count drag vs. its
  low momentum. A sleeker hull would coast, and only *then* does the skeg have way-on to bite — so we
  can't really feel skeg-without-thrust on this hull, and that's the honest result.

**Open before he's fully confident:** see it across **different engine powers** and **different hull
shapes** (his words). The next move was put to him but **left undecided** when we stopped — resume by
picking one: **(a)** a directional *default* hull to drive + a quick engine-power debug knob (serves both
variables cheaply — NB a *separately* spawned boat is unreachable, the sailor can't swim to it, so
"different shape" means changing the default platform or extending the raft by placing voxels); **(b)** the
full engine model (step 4 below); **(c)** fixture mass → COM first (step 3). Nothing decided; nothing
committed to git yet either.

1. **Anisotropic face drag (DONE — landed + felt good, validated via the debug thrust).** The foundation.
   Was: per-voxel drag **isotropic** — one
   coefficient applied to the relative-velocity vector in all axes (`physics.ts` `applyBuoyancy`), so a
   voxel resists forward motion exactly as much as sideways. That gives hulls **zero directional
   behaviour**: thrust would just shove the hull in the pod's direction and it would crab and spin. Fix:
   drag per **exposed voxel face**, projected onto the face normal (`½ρ·Cd·A·(u·n)²` along −n on windward
   faces only). Anisotropy then falls out of geometry *for free* — a long thin hull shows little frontal
   area moving ahead (few windward faces at the bow) but its whole flank moving sideways (lateral
   resistance = an emergent keel). A square raft stays symmetric → handles like a barge, which is
   *correct*. Angled faces (the future wedge voxel) deflect flow and generate lift under the same model.
2. **Lighter default platform.** The raft is a 5.6 t solid-timber barge (see Mass below) — a small
   outboard pushes it at ~0.1 m/s², barge-sluggish. Pick a lighter default (smaller footprint, or partly
   hollow like the `TEST_SHAPES` boat) so the *first* engine experience feels like a boat, before we tune
   thrust. Do NOT lower `RAFT_DENSITY` — 400 kg/m³ is honest; shape is the lever.
3. **Fixture mass into the Rapier body/COM.** A helm/engine has weight; fold it into the COM via
   `recomputeMass…`. Low-drama for the raft (GM ≈ 6 m, near-untippable), but it matters for **trim**
   (stern squat) and for future **narrow/tippy hulls** where a high engine genuinely can capsize.
4. **Engine thrust + throttle + skeg.** Apply thrust along the pod's yaw (`steer.rotation.y` IS the
   physical yaw), at the engine's location, so it drives AND turns (off-COM force). Add a throttle
   (fwd/reverse). **Add a skeg to the engine mesh** and give the pod+skeg aft lateral drag area: it becomes
   an emergent rudder (turns with the pod) + weathervane, from the same physics-owned-fixture setup — no
   special rudder code. **Scale thrust and steering by prop/skeg submersion** (one `ocean.sampleHeight` at
   the prop, ~free, same machinery as buoyancy) so a prop lifted out by a wave / bad mount / heel stops
   biting. It's diegetically visible (you SEE the prop thrash in air), so it teaches placement without a
   HUD. Model this from the start — an airborne prop that still drives looks broken.
5. **Make fixtures physics-owned.** Move the reserved cells + fixture lifecycle into `physics.ts` so they
   survive hull splits and so occupancy/removal/steering stop being a builder stopgap. Today, breaking the
   voxel under a fixture is unhandled (stale `visual` ref → `poseVoxel` on a dead cell) — this fixes it.
6. **Buoyancy participation.** AGREED model: a fixture's cells stay **VOID (air + floodable)**, NOT solid
   — a helm on a deck *inside the boat's side walls* is already enclosed buoyant air (see
   `../../flooding.ts` / `analyzeBuildVoids`); the fixture contributes only **mass**. **Open question Kyle
   raised:** the flood model today only fills *enclosed* compartments, so a helm open on deck wouldn't
   flood when submerged — extend flooding to fill any air-capable cell that goes underwater (open or
   enclosed) so a rolled-under helm space fills. Decide this when wiring buoyancy.

**Deferred (agreed, not dropped):** the **wedge voxel** (angled hulls — needed, but its whole payoff is
through the drag model, so build that first; orientation likely look-snap-to-cardinal + a scroll-cycle
fallback, and note building a hull from *on* the deck may be awkward — "feel it out"); **engine trim**
(pitch about the mount, same mechanism as yaw-steer on another axis — feeds the submersion model and
enables a shallow-water "trim up to clear the bottom" mechanic against the terrain heightfield; cheaply
reachable once submersion-scaling exists); **prop ventilation** subtlety (thrust dropping off *before* the
prop fully clears) as polish on the linear submersion floor; **materials of varied mass** (wood is just the
base test material — steel/etc. come with the material system).

---

## Mass & hydrodynamics — the design pass (numbers, so nobody re-derives them)

**Mass reality (the raft is a barge, and that's fine).** 113 voxels (81 deck + 32 rim) × 0.125 m³ =
14.125 m³ of softwood at `RAFT_DENSITY` 400 → **~5,650 kg**. That is *not* a bug: 400 kg/m³ is correct dry
softwood and the arithmetic is right — it's just that a voxel can't be thinner than 0.5 m or gappy, so the
"raft" is a **solid half-metre timber slab**, ~2–3× the wood of a real lashed-log raft (thinner, cylindrical,
air between). Consequences that DO matter: reserve buoyancy before the deck goes awash ≈ **4,475 kg** (you'd
pile four tonnes on it to sink it); roll stiffness is enormous (flat 4.5×4.5 m waterplane → **GM ≈ 6 m**), so
a realistic **15–40 kg** outboard heels it ~0.15° — **mass will NOT flip or sink the raft**. Mass matters for
trim and for future narrow hulls, not for the raft. Wood is the **base test material**; other materials bring
other masses later. (Don't fudge density down to make it lighter — that breaks the honest-freeboard math; use
shape.)

**Why anisotropic face drag is the answer to "voxel creativity vs. hydrodynamic realism."** You don't ask the
player to design a hydrodynamic hull — you make *water reward hull shape*, so even a blocky boat behaves
plausibly (badly if boxy, better if pointed) and real hull design is the skill ceiling. Confirmed in code that
today's drag has no directional preference (isotropic). Face-normal drag makes the whole thing emergent:
lateral resistance, tracking, and (with the wedge) lift all come from the geometry the player builds.
**Planing / lifting strakes / hydrofoils are deferred** — a nonlinear lift regime that needs this drag
foundation underneath it anyway; displacement-mode hulls with a soft hull-speed drag wall first.

**Skeg + engine = both steering mechanisms, from one setup.** Thrust vectoring (prop pushes along the pod
yaw, works at **zero boat speed** — prop wash) AND skeg-as-rudder (aft lateral area, needs **flow** over it —
works underway, and holds the bow straight when centred) both fall out of "physics-owned fixture with a
thrust vector + submerged lateral area." The pod yaws when you steer, so the skeg turns with it = a real
outboard skeg. The skeg must actually be **underwater** to act — verify the shaft length puts pod+skeg below
the waterline for the mount (true today on the flat-water raft; not guaranteed for a bad mount / big wave /
heel — which is exactly why thrust & steering scale with submersion, step 4).

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

- **Anisotropic face drag is LANDED** (`physics.ts`: `FACE_NORMALS`, `facesFor`, the per-face form drag in
  `applyBuoyancy`; the linear damper stayed isotropic at the voxel centre). Typecheck/lint/157 tests green.
  It's hard to *feel* on the calm, **square** raft (symmetric → no forward/side contrast, and nothing
  drives it), so a **TEMPORARY debug thrust** is wired to exercise it: at the helm, **W/S** throttle the
  hull fwd/reverse (`builder.ts` `applyDebugThrust` + `THRUST_DEBUG_N` 8000 N/engine, via `physics.onFixedStep`
  and the new `physics.addBodyForce`). **Delete the debug thrust when step 4 (real engine model) lands.** To
  feel the *anisotropy* specifically, extend the raft into a long rectangle (place voxels) and note it tracks
  straighter along its length than across its beam. Face drag ~doubles force-application calls in the hot
  loop — accumulating one force+torque per body is an easy follow-up if the benchmark shows it.

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
