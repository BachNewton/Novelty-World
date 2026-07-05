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
3. **Screen-space water** ✅ — refraction, depth-based colour (turquoise→navy),
   soft edges, and SSR reflection, all off one shared scene colour+depth capture.
   *(done — see "Water architecture" for why SSR over planar.)* Still open on this
   rung: shoreline **foam** (we have soft edges but no foam line yet).
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

Further water-fidelity rungs (layer on as polish, not blockers): shoreline foam,
dual-scale normal detail + sun glitter, and — only if we outgrow Gerstner
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
- **Water is screen-space: refraction + depth + SSR reflection, off ONE shared
  capture.** Each frame `scene.ts` renders the scene *with the water hidden* into a
  colour+depth render target (the shared hook's opt-in `sceneCapture`), then the
  ocean fragment shader reads it to (a) **refract** — sample the scene behind the
  water, nudged by the world wave normal; (b) **absorb** — Beer–Lambert over the
  water column from the depth texture (red dies first → turquoise → navy) with soft
  edges where geometry meets the surface; and (c) **reflect** — screen-space
  reflection ray-marches the reflected ray against that same depth buffer, sampling
  the colour on a hit, falling back to the **env-map sky** on a miss. All three ride
  the real per-pixel normal, so they track the displaced waves with no mismatch.
  Composited **after `<tonemapping_fragment>`** because the captured colour is
  tone-mapped (three tone-maps in-material regardless of render target) — matching
  spaces avoids a double tone-map.
- **Why SSR, not planar reflection (a hard-won decision).** Planar reflection
  (mirror camera + `textureMatrix`, three's `Water`/`Reflector`) is **fundamentally
  incompatible with a vertex-displaced surface**, and we proved it the slow way:
  - `Water.js` looks perfect only because its mesh stays **flat** (all waves live in
    its normal map); the mirror plane always matches the surface. Ours has real ~1.7 m
    displacement, so a sea-level mirror can't line up on crests.
  - Sampling the planar RT by the **`textureMatrix`** (mirror-cam projection) is the
    only way to get the mirror's handedness right — sampling by main-camera
    **screen-space** coords looks inverted as you orbit. But `textureMatrix` × the
    **flat** base position anchors the reflection to y=0 (slides off the waterline on
    waves), and × the **displaced** position detaches into a floating "curtain."
    There is no good planar option on a displaced mesh.
  - SSR sidesteps all of it: it reflects off the *actual* per-pixel surface via the
    depth buffer, so it's displacement- and orientation-correct **and** reflects
    dynamic objects (the cube, later ships/islands). It shares the refraction capture,
    so it was nearly free to add. The old `reflection.ts` planar module was **deleted**.
  - Distortion is driven by the **world** wave normal (0 on flat water → clean; grows
    with chop → the sea scatters its own reflection). Do NOT use the view-space
    `normal.xy` for distortion — it's nonzero even on flat water and shifts everything.
- **Lighting is intentionally simple** right now (a hemisphere fill + a
  directional sun aligned with the sky) so it complements the water without being
  a thing to troubleshoot. Beautify later. The env map is the water's sky reflection
  (correct on the displaced surface — it reflects per-pixel by the real normal) and
  the SSR fallback; `material.envMapIntensity` tunes it in `ocean.ts`.
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
  per project. Options added for the water: **`sceneCapture`** (opt-in colour+depth
  target on the context; `{ resolutionScale }` renders it below screen res — SSR/
  refraction hide the softening and it saves bandwidth+VRAM), **`antialias`**
  (default true; false drops MSAA — redundant when the device-ratio render scale
  already supersamples), and **`maxPixelRatio`** + live **`ctx.setPixelRatio`** for a
  render-scale control.
- **Performance is fill/bandwidth-bound, and on a small-VRAM iGPU it's memory-bound.**
  The water shades the whole screen with PBR + the screen-space composite, so cost
  scales with pixel count. Findings from tuning on an AMD 780M iGPU (512 MB dedicated
  UMA pool): "high FPS but laggy input" was **VRAM spill to shared system memory** —
  the desktop already fills most of a 512 MB pool, so the water's working set
  overflowed to the slow shared path. Not a compute bottleneck. Levers, in order of
  impact: **render scale** (fill scales with pixels²; biggest lever), **MSAA off**
  (frees the 4× framebuffer), **half-res `sceneCapture`** (~4× less capture VRAM +
  bandwidth), lower **tessellation**. The SSR march is **Fresnel-gated** — skipped on
  pixels where the reflection would be invisible (most of a top-down sea), the main
  reason SSR isn't the dominant cost. The real fix for a small-VRAM iGPU is raising
  the BIOS UMA buffer (or a dGPU); our job is just to stay frugal.
- **Sky** comes from three.js's `Sky` addon (`three/examples/jsm/objects/Sky.js`)
  with clouds, baked to an env map via `PMREMGenerator`. The env map is the water's
  sky reflection (per-pixel, correct on the displaced surface) and the SSR fallback.
  (`public/shipwright/waternormals.jpg` is the fine ripple normal map the ocean uses.)
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
  lights, camera, GUI, the buoy, debug overlays). Owns the **scene-capture pass**
  (hide water → render into `sceneCapture` → bind to the ocean) and the render-scale
  control. New non-water systems (voxels, islands) grow here or in sibling modules,
  kept free of React.
- `ocean.ts` — `createOcean`, the analytic Gerstner ocean: the patched
  `MeshStandardMaterial` (GPU) **and** `sampleSurface` (CPU), which must stay in
  lock-step. `sampleSurface` inverts the horizontal displacement (Newton-Raphson)
  so it returns the height at a WORLD point, not a grid point. Also holds the
  fragment-side **refraction / depth absorption / SSR** composite and its uniforms,
  plus the Water/wave/reflection GUI and debug toggles (wireframe / tessellation /
  water FX). Single source of truth for the surface — buoyancy will read
  `sampleSurface`.

## Status

- **Gerstner wave ocean + verified CPU/GPU sync (step 2).** The sea is a metric
  tessellated plane displaced by 4 summed Gerstner waves in a patched
  `MeshStandardMaterial`. The **same** wave field is mirrored on the CPU
  (`ocean.sampleSurface`), and `sampleSurface` inverts the horizontal displacement
  (Newton-Raphson) so it's correct at any world point — a fresh-eyes audit
  confirmed the GPU GLSL and CPU math are term-for-term identical and the
  inversion is correct. A 1 m³ test cube rides the surface off `sampleSurface`.
- **Screen-space water shipped (step 3).** Refraction + Beer–Lambert depth
  absorption (turquoise→navy) + soft edges + SSR reflection, all off one shared
  colour+depth `sceneCapture` (rendered at half res). The env map is the sky
  reflection + SSR fallback. Runs shaded and clean by default. Bloom still parked.
  Debug GUI: wireframe, probes, **sea floor** (a sloped seabed to exercise the
  depth gradient + shallows), tessellation, and perf-isolation toggles **water FX**
  (the whole refraction/SSR composite) + **scene capture**; **render scale** slider
  and an **Advanced ▸ Reflection (SSR)** folder (enabled / strength / reflectivity /
  distance / thickness / cutoff). (The `sampleSurface` inversion is confirmed
  necessary, always on; its debug toggle was removed.)
- **Tessellation is uniform 1024×1024** (`PLANE_SEGMENTS`), ~9.8 m quads, ~1 M
  vertices — dropped from 2048² to ease the GPU vertex load (the ocean is
  vertex-bound: every vertex runs the 8-wave Gerstner loop). Trade-off: ~9.8 m
  quads are coarser than the shortest (48/70 m) waves, so their crests facet
  slightly and the rendered GPU surface can dip below the analytic crest — which
  is why the CPU-placed cube sometimes reads as floating a touch high. Accepted:
  it's a visual artifact of kinematic placement, and once the ship is a Rapier
  buoyancy body (roadmap #6) alignment is a physics concern, not a mesh-density
  one. 2048² removes the faceting at ~4× the vertices if a crisp waterline is
  ever needed for a demo.
- **FUTURE IMPROVEMENT — camera-following LOD ocean.** The uniform grid
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
- **Next:** shoreline **foam** (we have soft edges, not a foam line), then the
  voxel core / ships. Rapier (collision/players/momentum) at roadmap #6. No gameplay
  yet.
