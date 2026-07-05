# Shipwright

Guidance for Claude Code when working in `src/projects/shipwright/`. Read the
repo-root `CLAUDE.md` first — this file only adds project-specific context.

## The big picture (the end goal)

Shipwright is an **online co-op building and exploration game**. Players:

- **Build ships out of voxel cubes** — a Minecraft-like block system, but the
  thing you build is a *vessel* that floats and sails, not static terrain.
- **Sail an open sea** dotted with a **procedurally generated archipelago** of
  islands.
- **Explore and gather** — collect resources and discover the nature scattered
  across the islands, using them to expand and improve the ship.
- **Play together** — multiplayer co-op is core, not an afterthought. Friends
  crew and build the same ship and explore the same world.

Think: *Valheim's boats × Minecraft's voxels × a cozy archipelago to explore.*

## How we build it: small iterative steps

We are **not** trying to build the whole game at once. Each step is a small,
self-contained, working increment toward the vision above. Prefer a playable
(or at least visible) result every step over large speculative scaffolding.
Update the "Status" section below as steps land so the current state is always
clear.

Rough, non-binding direction of travel (order and scope will flex):

1. **Ocean sandbox** ✅ — a rendered sea + sky you can look around. *(done)*
2. **Gerstner wave ocean** ✅ — a real, moving, choppy surface with a matching
   CPU wave field. *(done)*
3. Depth effects — shoreline foam, depth-based colour (turquoise→navy), soft
   edges. Needs a scene depth target (add to the shared hook, reusable).
4. Camera/movement — fly or sail a placeholder camera around the sea.
5. Voxel core — place/remove cubes on a grid; render a chunk efficiently
   (`InstancedMesh` / greedy meshing).
6. Buoyancy / physics — decorative floaters already ride kinematically
   (`sampleParticle`); at this step bring in **Rapier** for the player's ship as a
   collidable dynamic body with force-based buoyancy (`sampleSurface`) + player
   movement. See the HYBRID decision under "Water architecture".
7. Procedural islands — an archipelago of terrain to sail between.
8. Resources & gathering — harvest from islands into an inventory.
9. Multiplayer co-op — shared world + ship via the platform's multiplayer libs
   (`src/shared/lib/multiplayer`, host-authoritative — see root CLAUDE.md).

Further water-fidelity rungs (layer on as polish, not blockers): refraction
pass, dual-scale normal detail + sun glitter, and — only if we outgrow Gerstner
visuals — an FFT/Tessendorf surface for the *look* while keeping a cheap
Gerstner approximation as the buoyancy proxy.

## Scale & units (locked)

- **1 world unit = 1 metre.** Everything is metric: wave sizes, the plane,
  camera heights, the buoy. Ocean dispersion (`ω = √(gk)`) only looks right at
  real scale, so don't drift back to arbitrary units.
- **Standard building voxel = 0.5 m³** (0.5 × 0.5 × 0.5). This is the block size
  for the voxel ship builder (roadmap #5) — finer than Minecraft's 1 m so ships
  can have reasonable detail without being huge.
- The current **test cube is 1 m³** — a stand-in buoy and an on-screen scale
  reference, not a voxel.

## Technical approach

- **Rendering: vanilla three.js** (not React Three Fiber). A voxel game is
  perf-dominated by imperative mesh generation (instancing, greedy meshing,
  chunk workers) where R3F's reconciler gets bypassed anyway. Vanilla gives
  full control of the render loop. `three` + `@types/three` are project deps.
- **WebGL, not WebGPU (for now).** WebGPU (`WebGPURenderer` + TSL) is faster and
  the future direction, but it's a different API and support isn't universal. Our
  bottleneck will be mesh generation, not the backend, so WebGL is the pragmatic
  choice. Revisit once the game's shape is clearer.

### Water architecture (a locked decision — read before touching the ocean)

The water's *rendering* model and its *physics* model are the **same decision**,
because a ship can only float convincingly if the code that draws a wave and the
code that floats the ship agree on where the surface is.

- **Analytic Gerstner surface = the single source of truth.** The sea is a
  closed-form sum of Gerstner waves, `height(x, z, t)`, evaluated in **two**
  places that must stay in lock-step: the **GPU** (vertex shader, to displace +
  light the surface) and the **CPU** (`ocean.ts` `sampleSurface`, so buoyancy can
  ask the water's height at a point and get an answer that matches the pixels).
  Both live in `ocean.ts` — change one, change the other.
- **Why Gerstner over FFT:** FFT/Tessendorf looks better but its height field
  lives in a GPU texture, so CPU buoyancy sampling means slow readbacks. Gerstner
  is cheap to evaluate on the CPU, gives a real silhouette + moving horizon, and
  — decisive for our host-authoritative co-op — is **free to synchronise**: every
  client recomputes the identical sea from the shared clock, zero state to send.
- **Floating is HYBRID — locked decision.** Two mechanisms, chosen per object:
  - **Kinematic particle-ride** (`ocean.sampleParticle`, *forward* Gerstner). We
    place the object directly on the water particle at its rest (x, z), so it
    rides the orbital motion (surges forward on crests, back in troughs, bobs, and
    tilts to the surface normal). Dirt-cheap and looks genuinely great — no physics
    engine. This is the **permanent** approach for **decorative / non-simulated
    floaters**: foam, spray, debris, distant ambient boats, the debug probes.
    Trade-off: no momentum (can't get airtime, be pushed under, or capsize) and no
    collision — which is fine, and arguably desirable, for a deck you build on.
  - **Force-based buoyancy on a Rapier body** (later). For things that must
    collide and carry momentum — the player's ship, players standing on decks,
    ship-vs-island — a kinematic ride won't do (a teleported body ignores
    collisions). Those become **Rapier dynamic bodies**: sample water depth at hull
    points via `ocean.sampleSurface` (the *inverse*) for buoyancy up-forces, plus
    drag toward the water velocity (derivative of the particle displacement) so the
    body rides the orbit *emergently*. The kinematic ride is the visual benchmark
    to tune this against.
- **Physics engine: deferred, then Rapier.** Not needed for the water look — the
  kinematic ride already nails it. Add **Rapier** (`@dimforge/rapier3d`;
  deterministic WASM, character controllers) when we build ships + islands +
  player movement (roadmap #6), scoped to **collision / players / momentum**, NOT
  the water. Deterministic, which matters for host-authoritative sync.
- Real fluid sim is rejected (too costly / hard to sync). Cosmetic interaction
  (wakes, splashes) is later polish.
- **The ocean is a patched `MeshStandardMaterial`, not a from-scratch
  `ShaderMaterial`.** We inject Gerstner displacement + analytic normals via
  `onBeforeCompile`, keeping three's PBR sky-env reflection, Fresnel, and sun
  lighting for free. The built-in `Water` addon was **removed** — it's a flat
  planar mirror that assumes an undisplaced plane, which is incompatible with
  real wave displacement.
- **Reflections are currently PARKED.** `reflection.ts` (`createPlanarReflection`,
  a mirror-camera + oblique-clip planar reflection ported from three's
  `Water`/`Reflector`) still exists but is **not wired into the scene** — it was
  removed while debugging the waterline so nothing fancy could mislead us. On a
  displaced surface a planar reflection is only an approximation, and it's meant
  to come back later **coupled to sea state** (calm = crisp mirror → storm =
  almost none). Re-adding means importing it in `scene.ts`, driving it each frame,
  and sampling it in the ocean shader (see git history for the shader injection).
- **Lighting is intentionally simple** right now (a hemisphere fill + a
  directional sun aligned with the sky) so it complements the water without being
  a thing to troubleshoot. Beautify later. NB the water still gets a sky specular
  from the env map *and* the planar reflection — if the horizon reads
  double-bright, drop `material.envMapIntensity` in `ocean.ts`.
- **Bloom is parked.** The shared hook still supports `{ bloom: true }` (HDR
  `EffectComposer`: HalfFloat+MSAA → `RenderPass` → `UnrealBloomPass` →
  `OutputPass`, exposing the pass on the scene context), but Shipwright currently
  runs without it while we focus on the water. Re-enable for a tasteful sun glow
  once the sea is dialled in.
- **Debug overlays:** the shared hook takes `{ stats: true }` to show a three.js
  FPS/ms panel. Scene-specific tweakables use a **lil-gui** panel built in
  `scene.ts` (`three/examples/jsm/libs/lil-gui.module.min.js`, typed via
  `@types/three` — no extra dep). Both are dev affordances to strip/hide once
  there's real game UI.
- **React ↔ three.js bridge:** `src/shared/lib/three/use-three-scene.ts`. It
  owns renderer creation, the animation loop, container resizing, and disposal;
  a project passes a `setup` callback that builds the scene and returns
  `onFrame` / `onResize` / `dispose` handlers. This hook is deliberately
  game-agnostic and shared — extend it rather than re-implementing the lifecycle
  per project.
- **Sky** comes from three.js's `Sky` addon (`three/examples/jsm/objects/Sky.js`)
  with clouds, baked to an env map via `PMREMGenerator` for the water reflection.
  (`public/shipwright/waternormals.jpg` is kept for the later dual-normal detail
  rung; the current Gerstner ocean doesn't use it yet.)
- **Assets** for this project go under `public/shipwright/`.

### Lint gotchas specific to three.js

- The repo lint bans explicit `any` and flags always-true/false conditions
  (`no-unnecessary-condition`). three's `material.uniforms[...]` values are
  typed loosely, which is fine to read/write, but **don't** copy the classic
  example's `fog: scene.fog !== undefined` — `scene.fog` is `Fog | null`, never
  `undefined`, so that comparison fails lint. Pass an explicit boolean.

## Files

- `index.tsx` — re-exports `Shipwright` (registered in `PROJECT_COMPONENTS`).
- `components/shipwright.tsx` — root component; full-bleed canvas + HUD overlay.
- `scene.ts` — `setupOceanScene`, the imperative three.js scene builder (sky,
  lights, camera, GUI, the buoy + the debug probe overlay). New non-water systems
  (voxels, islands) grow here or in sibling modules, kept free of React.
- `ocean.ts` — `createOcean`, the analytic Gerstner ocean: the patched
  `MeshStandardMaterial` (GPU) **and** `sampleSurface` (CPU), which must stay in
  lock-step. `sampleSurface` inverts the horizontal displacement (Newton-Raphson)
  so it returns the height at a WORLD point, not a grid point. Water/wave GUI and
  debug toggles (wireframe / tessellation / invert sampling) live here. Single
  source of truth for the surface — buoyancy will read `sampleSurface`.
- `reflection.ts` — `createPlanarReflection`, a mirror-camera planar reflection
  pass. Currently **parked** (not imported by the scene); generic enough to move
  to `shared/` if reused.

## Status

- **Gerstner wave ocean + verified CPU/GPU sync (step 2).** The sea is a metric
  tessellated plane displaced by 4 summed Gerstner waves in a patched
  `MeshStandardMaterial`. The **same** wave field is mirrored on the CPU
  (`ocean.sampleSurface`), and `sampleSurface` inverts the horizontal displacement
  (Newton-Raphson) so it's correct at any world point — a fresh-eyes audit
  confirmed the GPU GLSL and CPU math are term-for-term identical and the
  inversion is correct. A 1 m³ test cube rides the surface off `sampleSurface`.
- **Currently in DEBUG mode.** The scene runs stripped-down for diagnosing the
  waterline: wireframe water + a magenta CPU-probe grid (spheres at
  `sampleSurface` heights) to eyeball CPU-vs-GPU agreement. Reflection and bloom
  are parked. Debug GUI toggles: wireframe, probes, tessellation (rebuilds the
  mesh), invert sampling (Newton on/off).
- **Tessellation is uniform 2048×2048** (`PLANE_SEGMENTS`), ~4.9 m quads. This
  renders the short 48/70 m waves without crest faceting, so the cube/probes sit
  on the waterline in all conditions. It's ~4 M vertices — deliberately *not*
  optimized, because it runs 60-100 FPS on desktop and premature LOD is complexity
  we don't need yet.
- **FUTURE IMPROVEMENT — camera-following LOD ocean.** The uniform-2048 grid
  spends detail on far water that doesn't need it. When we build the roaming /
  sailing camera (or if a weaker device needs it), replace it with a
  camera-following high-density patch + a coarse far plane for the horizon, so the
  fine triangles travel with the viewer. Do NOT do this pre-emptively. Tried and
  rejected: dropping the short waves and faking them with the normal map — looked
  worse (a repeating "river" of smooth swells).
- **Kinematic float works and looks great.** The test cube (and the debug probes)
  ride the water via `ocean.sampleParticle` (forward Gerstner) — real orbital
  motion + tilt, no physics engine. Confirmed the right approach for decorative
  floaters (see the HYBRID decision above). `sampleSurface` (inverse) is retained
  for the future Rapier buoyancy.
- **Next:** un-debug (restore shaded water, drop the probe overlay), then head
  toward the voxel core / ships. Reflection + the wind/sea-state master come back
  later; Rapier (collision/players/momentum) at roadmap #6. No gameplay yet.
