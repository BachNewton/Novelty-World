# Shipwright

Guidance for Claude Code when working in `src/projects/shipwright/`. Read the
repo-root `CLAUDE.md` first — this file only adds project-specific context.

## Aesthetic: photorealism, NOT the brand palette

The root `CLAUDE.md` "colorful, bold, fun, quirky" visual identity (and the
"never use raw Tailwind colors, use semantic tokens" rule) governs the **Novelty
World web-app UI** — menus, the project directory, tools, HTML/CSS chrome. It does
**NOT** govern Shipwright's **3D render**, which is a game going for a
**photorealistic sea, sky, and waves**. Judge the render against **physical
realism** (real ocean optics, real light), not the brand palette — never push
saturation/vividness in the water, sky, or objects to "match the brand." Correct
means physically plausible (e.g. at noon colours are bright but naturally less
punchy, and blacks stay dark — an unphysical washed/grey-black look is a *bug*, not
a style choice). See `docs/FIDELITY.md`. (The token rule still applies to any
Shipwright React/HTML **HUD** chrome, which is web UI.)

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
7. **Procedural islands** ✅ *(first pass)* — a seeded, world-anchored bedrock heightfield cut by sea
   level, targeting the **Finnish Archipelago Sea**. See `terrain.ts` + `docs/ISLANDS.md`.
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
  ocean fragment shader reads it to (a) **see through** — sample the scene behind the
  water **straight through** (NO lateral refraction offset: a UV nudge shears the submerged
  silhouette of an object straddling the waterline — its above-water half samples straight, its
  underwater half offset, so they detach and the submerged part slides/tears on a wave face.
  Screen-space refraction of discrete straddling objects is fundamentally approximate, and the
  default turbid water hides refraction anyway; see `docs/FIDELITY.md`); (b) **absorb** —
  Beer–Lambert over the
  water column from the depth texture (red dies first → turquoise → navy) with soft
  edges where geometry meets the surface; and (c) **reflect** — SSR (screen-space
  reflection) ray-marches that same depth buffer, falling back to the **env-map sky**
  on a miss. The SSR march runs in a **dedicated low-res pass** (`ocean.ts` `renderSsr`
  renders the water alone, layer-isolated, into a fraction-res target the water shader
  then samples) — NOT inline in the water fragment; the low-res reflection is
  re-distorted at full res by the ripple normal map (+ the analytic wave slope) at sample time.
  The depth absorption rides the per-pixel wave normal, so it tracks the displaced waves.
  Composited **before `<tonemapping_fragment>`, in linear HDR.** (This reverses an
  earlier claim that three tone-maps in-material regardless of render target. It does
  not: `WebGLPrograms.getParameters` sets `toneMapping = NoToneMapping` unless
  `currentRenderTarget === null`. The capture was ALWAYS linear, and the old code
  composited it into an already-tone-mapped base -- a real bug that looked plausible
  because both sat near [0,1]. See `docs/lighting-log.md`.) The SSR target is
  HalfFloat for the same reason; at 8 bits every reflected highlight clamped to 1.0.
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
- **Lighting is ONE PHYSICAL MODEL, with no per-material exceptions.** `lighting.ts`
  (pure physics, unit-tested), `sky-model.ts` (its CPU twin of the dome's GLSL),
  `clouds.ts` (one cloud field), `iala.ts` (navigation lights, the only emitter that
  is not the sun) and `sky.ts` (the three.js side). Air mass -> Meinel & Meinel beam
  -> Haurwitz diffuse -> the measured twilight table; clouds by two-stream optical
  depth tau. See `docs/LIGHTING.md` (the brief) and `docs/lighting-log.md` (what
  landed, what was measured, what is still wrong).
  - **Never add a per-material lighting exception.** The env-scale property must
    stay absent from source: if an object looks wrong, the MODEL is wrong.
  - **Cloud shadows reach every lit material through ONE global override of three's
    `lights_fragment_begin` ShaderChunk** (`sky.ts` `installGlobalLighting`). It
    multiplies ALL DIRECTIONAL lights, so a moon added later is shadowed for free --
    and a buoy lantern, which sits *beneath* the deck, correctly is not.
  - **Do not divide by the sun's intensity anywhere.** `sources` is a list; at
    -18 degrees it is empty and everything must still work.
  - The env map is the water's sky reflection (correct on the displaced surface --
    it reflects per-pixel by the real normal) and the SSR fallback. It is baked
    WITHOUT the sun's disc: the `DirectionalLight` already carries the beam.
- **The exposure key is 0.09 (art-directed), calibrated from 0.125 (ISO 2720), NOT 0.18.** `0.18` is a
  grey CARD's reflectance; `key` is the calibration of a reflected-light averaging meter, whose ISO 2720
  constant `K = 12.5` places the scene average near 12.5 %. A meter has never put a grey card at middle
  grey except by coincidence. `0.125` won a blind review under *earlier* conditions (pre-grade,
  pre-ozone, ACES); the shipped value is **0.09**, a deliberate ~half-stop darker, judged live by Kyle
  across 0°/10°/53° — it kills both the washed sunset sky and the over-lifted "glowing" turbid sea in one
  number (see `docs/lighting-log.md` "Where this settled").
- **Exposure meters the SCENE, not the ground.** `exposure = key / L_field`, where
  `L_field = 0.5 * mean sky radiance + 0.5 * sea radiance` -- the scene's own average
  luminance. It is NOT `(0.18/pi) * E_horizontal`; that is an incident meter with a
  cosine receptor, which no camera and no retina is, and it drove a THIRD of the
  sunset sky above the white point. The sun's disc is excluded (glare is a separate
  model). **Corollary: a grey card does NOT render at middle grey** -- an averaging
  meter places the scene's average there, and a sea of albedo 0.07 is not a grey
  card. A test pins this; if you "fix" it you have re-broken the sunset.
- **`turbidity` drives the beam as well as the dome**, because it IS the aerosol
  load. And the dome's in-scattering source carries the BEAM'S COLOUR, per species
  (`sourceTints`): the aerosol at 1.2 km has crossed nearly the whole column, the
  Rayleigh air at 8.4 km has not, so a sunset aureole reddens while the zenith stays
  blue. Preetham's `L0 = 0.1 * Fex` floor is DELETED -- it peaked at the zenith and
  drew civil twilight upside down.
- **Materials come from `materials.ts`, with sources.** Measured reflectances, each
  carrying its citation, and `derived: true` on anything reasoned rather than
  measured. Two traps it exists to prevent: 18% grey encodes to sRGB **118**, not
  128; and rust is a **dielectric** (`metalness: 0`), not a dirty metal.
- **The calibration rig (`material-rig.ts`) depends on three + `materials.ts` and
  NOTHING else**, on purpose: it has to compile against an older build so the two can
  be A/B'd. An instrument that only works on the thing it measures is not an
  instrument. It puts all three depths -- floating, straddling the waterline,
  submerged -- in ONE frame, because the seam between the above-water shading and the
  underwater absorption is exactly what separate shots can never show.
- **Navigation marks are lit, and they are the model's second light source.**
  `iala.ts` holds the standard as pure data: Allard's Law converts a chart's *nominal
  range* in nautical miles to candela at the 1933 night threshold (`2e-7` lux), and
  `cd -> PointLight.intensity` is `cd / (efficacy * 1000)` because three's point
  lights carry an irradiance x m^2. Finland is IALA **Region A: port is RED,
  starboard is GREEN** ("red right returning" is the American rule and is wrong
  here). Signal green is a **blue-green**, not a lime. South cardinal's long flash is
  a safety feature -- six flashes must never be miscountable as three or nine. The
  lanterns switch on a photocell reading the model's own illuminance, not a clock.
  - **ONE pooled light serves every mark.** three compiles the light COUNT into every lit material, so
    N point lights means every fragment of every lit surface -- including the ocean, which covers the
    whole screen -- runs the point-light BRDF loop N times. Six per-buoy lanterns cost ~3.6 ms of a
    ~12 ms frame, and the cost grows with the buoy field. So `buoys.ts` keeps a single `PointLight`
    SLOT, re-pointed each frame at the nearest lantern that is currently flashing: constant light count
    (nothing recompiles), constant cost (six marks or six hundred). In daylight it leaves the graph
    entirely -- `intensity = 0` is NOT free.
  - **The lens is not the light.** What a lantern *is* (the emissive lens, which SSR reflects off the
    water as that lovely wave-distorted streak) is separate from what it *illuminates*. The reflection
    is a ray-march of the scene COLOUR capture, which the glowing lens is already in -- it needs no
    light source. Suppressing all six `PointLight`s changed 0.19 % of pixels. The light is kept only
    because Allard's law says a 5 NM cardinal throws ~3 lux at 5 m (~12x full moonlight) and the raft
    spawns among these marks; past `LAMP_LIGHT_RANGE` (40 m) it illuminates nothing a camera can see.
- **Tone mapping is AgX + a display GRADE; bloom is built and OFF.** Settled by the 2x2 in
  `docs/LIGHTING.md`, graded blind. ACES desaturates a highlight *before* it clips, so the 4-degree
  sun-glitter road renders neutral silver; AgX renders the same pixels gold, for 0.37 ms (noise). AgX
  intentionally holds punch off the highlights, so a **post-tonemap grade** (saturation + contrast, in
  the shared hook `use-three-scene.ts` via `ctx.setGrade`) puts it back — default ON, gentle (sat 1.2,
  contrast 1.08). AgX + grade beat ACES to Kyle's eye. The grade is a CAMERA/art operator applied
  uniformly at the end of the pipeline, never physics — it is where the "beauty" of the old `pow(1.5)`
  sky belongs. Bloom spreads an already-white pixel into a halo, and as tuned it washes the hero frames
  (+3.7 ms with an MSAA HDR target, only 1.2 ms of it the blur); left OFF and **still needs work** (the
  `clamp` is the lever for the high-sun blowout). Live switches: Environment -> Display. See
  `docs/lighting-log.md`.
- **Physical constants are READ-ONLY in the debug GUI; only conditions + camera/art choices get live
  sliders.** Ground albedo and the Jerlov water optics (absorb/scatter/backscatter) are shown but
  `.disable()`d — the water-TYPE dropdown is their control. An editable slider must never imply you can
  dial a number the physics of the world fixes; conditions (sun, turbidity, sea state) and camera/art
  (key, grade, bloom) are the legitimately dialable ones.
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
  target on the context; `{ resolutionScale }` renders it below screen res),
  **`antialias`** (default true; false drops MSAA), and **`maxPixelRatio`** + live
  **`ctx.setPixelRatio`** for a render-scale control.
- **The sky is OURS, not three's `Sky` addon.** That addon is not imported anywhere.
  `sky.ts` draws its own dome and `sky-model.ts` is that dome's CPU twin. Both began
  as a port of the addon's Preetham GLSL, and most of what they inherited has since
  been replaced or deleted: the magnitude (`domeScale` renormalises to Haurwitz), the
  scalar colour source (`sourceTints`, per scattering species), the `L0 = 0.1*Fex`
  floor (deleted -- it peaked at the zenith and drew twilight upside down), and **ozone**
  added to `Fex` (the Chappuis band -- a blue zenith, not Rayleigh's cyan).
  - **What remains of Preetham is known to be imperfect, but is NO LONGER "the next work."** The washed
    sunset it was blamed for was resolved in the CAMERA (darker exposure + grade -- see
    `docs/lighting-log.md` "Where this settled"), NOT by finishing the dome physics; that path was tried
    on `sunset-aureole` and *falsified* (corrected single-scattering rendered more washed, not less). So
    the residuals below are an OPTIONAL physics refinement, not the plan: the scattering coefficients
    disagree with our own beam's optical depths by ~227x; `rayleighPhase(cosTheta * 0.5 + 0.5)` is a bug
    ported from three (`p(180)/p(0) = 0.50` where Rayleigh is symmetric and must be 1.00); and the single
    Henyey-Greenstein aerosol lobe is too broad to be an aerosol aureole (falls off 6.1x from 2->20
    degrees where the real sky falls ~30x). `pow(Lin, 1.5)` and `horizonMix` are admitted look hacks that
    entangle the coefficients -- which is why they cannot be corrected in place, and why the beauty was
    moved to the camera grade instead.
  - **The sun:sky ladder is structurally protected while you fix this.** For a clear
    sky `skyIrradiance = clearChroma * clearDhi`, and `clearDhi` comes from Haurwitz,
    not from the dome. The dome supplies distribution and colour; the irradiance model
    supplies energy. Changing how the sky LOOKS cannot change how much it LIGHTS.
  The dome is baked to an env map via `PMREMGenerator`; that env map is the water's sky
  reflection (per-pixel, correct on the displaced surface) and the SSR fallback.
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
- `scene.ts` — `setupOceanScene`, the imperative three.js scene builder (camera, GUI, the buoys, debug
  overlays; the light itself lives in `sky.ts`). Owns the **scene-capture pass**
  (hide water → render into `sceneCapture` → bind to the ocean) and the render-scale
  control. New non-water systems (voxels, islands) grow here or in sibling modules,
  kept free of React.
- `ocean.ts` — `createOcean`, the analytic Gerstner ocean: the patched
  `MeshStandardMaterial` (GPU) **and** `sampleSurface` (CPU), which must stay in
  lock-step. `sampleSurface` inverts the horizontal displacement (Newton-Raphson)
  so it returns the height at a WORLD point, not a grid point. Also holds the
  fragment-side **refraction / depth absorption / reflection** composite, the dedicated
  **low-res SSR pass** (`renderSsr`), their uniforms, and the Water/wave/reflection GUI +
  debug toggles. Single source of truth for the surface — buoyancy reads `sampleSurface`.
- `physics.ts` — `createPhysics`, the Rapier buoyancy + voxel-editing engine: per-voxel
  compound colliders, the force-based buoyancy/drag hot loop, compartment-flooding
  integration, render interpolation, and the runtime voxel editor (place/break/split/drop,
  the edit queue, `raycastVoxel`). Imports the pure model from `flooding.ts` and the build
  catalogue from `shapes.ts`.
- `flooding.ts` — the pure, unit-tested void/compartment model (`analyzeBuildVoids`,
  `groupCompartments`, `compartmentTargetFill`): a build's air-cavity graph + the per-step
  fill-fraction target math. No THREE/Rapier — just the integer cell list.
- `shapes.ts` — the voxel-build catalogue: the `Shape` descriptor, the gameplay `RAFT`, and
  the buoyancy-demo `TEST_SHAPES` (+ their builders and densities). Pure content.
- `builder.ts` — `createBuilder`, first-person build input (place/break/drop) + the aim dot.
  All world mutation delegates to `physics.ts`.
- `terrain.ts` — `createTerrain`, the procedural archipelago: the pure seeded bedrock field
  (`bedrockField` → `height` + the `broad` shelter proxy), the exposure-gradient surface colouring, and
  the instanced spruce. Pure noise helpers are unit-tested in `terrain.test.ts`. See `docs/ISLANDS.md`.
- `lighting.ts` — the physical light model, PURE (no three.js), unit-tested. Air mass, the direct beam
  and its colour, diffuse skylight, twilight, cloud optics, exposure. One `computeLighting` that
  everything downstream reads. Nothing else may invent light.
- `sky-model.ts` — the CPU twin of the dome's GLSL (Preetham + Earth's shadow), so the sky we RENDER is
  the sky we INTEGRATE. Same lock-step contract `ocean.ts` keeps with `sampleSurface`.
- `clouds.ts` — one 2-D cloud field, evaluated by the dome, by the shadow map, and by the CPU. Genus
  presets. The light reads only `cloudTransmittance` and tau, so phase 3 changed the clouds' appearance
  without touching the balance.
- `sky.ts` — the three.js side: the dome, the sun, the PMREM bake, the shadow frustum, the cloud shadow
  map, exposure, and the project's ONE global `lights_fragment_begin` override.
- `lighting-rig.ts` — the linear-HDR irradiance probe behind `measureLighting()`. No scene objects.
- `materials.ts` — the measured material library, with a source per entry. Used by the calibration rig
  AND by the game. `material-rig.ts` — the rig itself: spheres + cubes of known reflectance at three
  depths in one frame. Both depend on nothing but three, so they drop onto an older build for an A/B.
- `iala.ts` — the buoyage standard as pure data: mark colours, topmarks, light rhythms, Allard's-law
  photometry, IALA signal chromaticities. Unit-tested. `buoys.ts` renders it.
- `benchmark.ts` — the render-cost flight schedule + the benchmark **wire types**
  (`BenchmarkConfig`/`Result`/…); the driver that runs a flight lives in `scene.ts`.

## Status

- **Gerstner wave ocean + verified CPU/GPU sync (step 2).** The sea is a metric
  tessellated plane displaced by 4 summed Gerstner waves in a patched
  `MeshStandardMaterial`. The **same** wave field is mirrored on the CPU
  (`ocean.sampleSurface`), and `sampleSurface` inverts the horizontal displacement
  (Newton-Raphson) so it's correct at any world point — a fresh-eyes audit
  confirmed the GPU GLSL and CPU math are term-for-term identical and the
  inversion is correct. A 1 m³ test cube rides the surface off `sampleSurface`.
- **Screen-space water shipped (step 3).** Refraction + Beer–Lambert depth
  absorption (turquoise→navy) + soft edges + SSR reflection, off one shared colour+depth
  `sceneCapture` — with SSR now in a dedicated **low-res reflection pass** (see Water
  architecture). Patched `MeshStandardMaterial` (PBR), lit by the PMREM sky env map.
  Runs shaded and clean by default. Bloom still parked. (The `sampleSurface` inversion is
  confirmed necessary, always on; its debug toggle was removed.)
- **Tessellation is density-based.** The debug GUI holds a constant **quad size**
  (~4.9 m default) and derives the segment count from the plane size, so the grid keeps
  the same fineness as the plane grows or shrinks (`setGrid`); both quad size and plane
  size are debug sliders. The short (48/70 m) waves need this fineness to render without
  their crests faceting — a coarse grid dips the rendered surface below the analytic
  crest, which can read as the CPU-placed cube floating a touch high.
- **NEXT PERF PROJECT — camera-following LOD ocean (~8 ms, the biggest single win, and it costs no
  image quality).** The uniform grid spends detail on far water that doesn't need it: the plane is
  ~1 M vertices, its vertex shader runs 4 Gerstner waves (sin/cos ×4) + analytic normals **per vertex**,
  and it is drawn **twice a frame** (SSR pass + main pass). Measured: coarsening the quad from 4.9 m to
  20 m takes the GPU frame **15.9 → 8.6 ms**. Uniform coarsening isn't shippable (the short 48/70 m waves
  facet — that's why the fine grid exists), but a camera-following high-density patch + a coarse far
  plane keeps the near waves identical and reclaims most of it.
  **This REVERSES the old guidance** ("the ocean is not vertex-bound", "tessellation is the least
  impactful lever", "do NOT do this pre-emptively"). That came from an experiment that measured
  render-prep **CPU** — genuinely flat in tessellation — and generalised it to the GPU, which was never
  tested. See `docs/PERFORMANCE.md` → "What this doc got wrong".
  Still true: dropping the short waves and faking them with the normal map was **tried and rejected** —
  it looked worse (a repeating "river" of smooth swells). LOD is a different thing: keep the waves,
  spend the vertices where the camera is.
- **Kinematic float works and looks great.** The test cube (and the debug probes)
  ride the water via `ocean.sampleParticle` (forward Gerstner) — real orbital
  motion + tilt, no physics engine. Confirmed the right approach for decorative
  floaters (see the HYBRID decision above). `sampleSurface` (inverse) is retained
  for the future Rapier buoyancy.
- **First-person sailor on a floating raft (Rapier, step 6).** A dynamic-body sailor
  walks, rides, edge-tips, and jumps on a buoyant voxel raft (`player.ts` + `physics.ts`);
  the sea is dialled calm for it. Corner-push (momentum-conserving foot reaction +
  all-contact wall projection), fixed-timestep render interpolation (raft + camera), and a
  vsync-stride FPS cap are all in. *Optional future improvement (deferred):* a rough-sea
  **balance-loss** state machine (footed↔thrown) so storms can actually throw the sailor —
  it adds stakes + rewards stable hull design, and the dynamic body already supports it; it
  was parked because the current glued-on feel is good and it's gameplay polish, not a bug.
- **Buoyancy / displacement overhaul — air-cavity buoyancy + compartment flooding shipped (Stages 1 +
  3a + 3b).** Hulls float on the air they enclose, and a breached hull floods to the waterline and
  founders. Model in `physics.ts` (`analyzeBuildVoids` + `groupCompartments` + `compartmentTargetLevel`,
  all exported + unit-tested in `physics.test.ts`): `analyzeBuildVoids` pre-builds ONCE (pure function
  of the cell list, ready for the voxel builder to re-run per place/break) a build's void graph, a
  static **`enclosed` mask** (air-*capable* cells, below a rim), and a **`compartment` id** per void
  (connected components of the enclosed graph; a bulkhead makes two). Each fixed step every compartment
  tracks a **fill FRACTION** (0..1, pose-invariant so it tracks the hull as it moves — a world-height
  level froze at spawn and spuriously flooded a settling hull): sample the sea at its centroid, and if
  any **opening** (an exposed rim cell, or an open void adjacent to a breach) is underwater, raise the
  fraction toward sea level at the **orifice rate** `Cd·Σ√(2g·head)/footprint` (wide/deep holes fill
  fast, a small cannon hole trickles); else drain. The fraction realizes to a world flood level
  (`dryFloor + fraction·span`). **Trapped air = enclosed AND above it** → up-buoyancy at **zero
  mass/drag**; a **flooded** cell (below it) instead carries **water weight** `ρg·(1−submerged)·V` down, so a swamped/
  heeled hull is pulled under (water pools to the low side → capsize cascade). This is orientation- +
  waterline-correct (capsize → mouth floods; swamp a rim → floods). A **fully sealed** compartment (no
  openings) never floods → keeps its air at ANY depth: seal a hull and it survives underwater. We
  deliberately DON'T model a diving-bell air-trap at a lone submerged hole (not worth it at 0.5 m
  voxels — a hole below the waterline just floods). Demos in `TEST_SHAPES`: Sealed hull (ρ = 1400),
  breached / bulkhead / open-bottom edge cases, a 3×5 matrix of **stability buckets** (wall height
  h3→h10 × interior air 3×3/4×4/5×5 → a swamp-vs-bob-back spectrum), a **crown raft** (decorative
  merlons add no air). Debug: a **"trapped-air cells" x-ray** (updates live as shapes roll), an
  **"air-cavity buoyancy" A/B switch**, and a **"flood rate"** slider. A **runaway guard** (`MAX_LINVEL`/
  `MAX_ANGVEL` velocity clamp + a try/catch around the step loop) keeps heavy-sea instability from
  NaN-ing the Rapier WASM solver and hard-freezing the app. The buoyancy **simulation** is now complete;
  the remaining work is **rendering** (see `docs/FIDELITY.md` "Hull interiors"): mask the global ocean
  surface out of dry hull interiors, and draw flooded interior water at each compartment's fill level.
- **Voxel building — place / break / drop (step 5, Minecraft-style).** In first person, aim at a voxel
  face and **left-click breaks**, **right-click places** a voxel on that face, **Q drops** a fresh
  unconnected voxel ahead of you (a seed for a new raft). Creative mode: unlimited blocks, no inventory
  yet (that lands with resource gathering, roadmap #8). It works on **any** voxel body — the raft AND
  every `TEST_SHAPES` demo — via one general path, not a raft special case. `physics.ts` owns the
  editing: each voxel is its own box collider keyed by cell in a **fixed body-local frame** (retained
  voxels never shift when the ship grows/shrinks — Rapier derives the real COM from the colliders), so
  a place adds one collider + one merged-geometry regen, a break removes one. A break that **disconnects**
  a build runs connected-components and **splits** the loose chunk(s) into their own dynamic bodies
  (each inherits the parent frame + pose + velocity — no teleport); breaking the last voxel removes the
  build. `analyzeBuildVoids` / `groupCompartments` re-run per edit, and per-compartment flood fractions
  are **carried across** the re-classification by cell overlap (patch a leak and the shipped water stays
  to be bailed — not reset). A ray from the eye (voxel colliders only, player capsule excluded) drives a
  Minecraft-style selection outline; placement is blocked where it would land inside the sailor.
  `builder.ts` is just input + the highlight. Edits are **queued and applied at a fixed point in the
  step loop** — right after the riders' ray casts and just before `world.step()` — because Rapier's
  `add`/`removeCollider` DON'T touch the query BVH (only `step()` rebuilds it), so casting between an
  edit and the next step traps the WASM (`unreachable`); queuing keeps every cast consistent with the
  collider set, and makes edits discrete fixed-point events. Still *input-scheduled*, not fully
  deterministic — host-authoritative multiplayer will replay them as an ordered edit log (roadmap #9).
  A finite-but-extreme body can't diverge to Inf inside a step: velocity is clamped pre-step and the
  per-voxel drag relative-speed is capped (`DRAG_MAX_REL_SPEED`) so a fast body can't overshoot.
- **`physics.ts` slimmed by extraction (refactor).** The pure void/flood model moved to `flooding.ts`
  and the shape catalogue to `shapes.ts` (both behavior-preserving pure moves, tests green); the
  benchmark wire types moved from `scene.ts` to `benchmark.ts`. `physics.ts` is now ~1600 lines and one
  coherent thing (the Rapier buoyancy/voxel engine). *Not* split further: `ocean.ts` (GLSL + CPU
  `sampleSurface` are locked adjacent) and the voxel-editor (shares the engine's closure — would add
  indirection until `createPhysics` becomes a class).
- **Procedural archipelago — first pass (step 7).** `terrain.ts` generates ONE continuous, seeded,
  world-anchored bedrock field (anisotropic fBm stretched along a glacial grain) and lets **sea level
  cut it**; there is no per-island primitive. A radial falloff mask was tried first and cannot produce a
  lineated chain of skerries — it always reads as a muffin. The 600 m window holds 53 islands, 45 of
  them skerries under 120 m², around one 4.2 ha landfall island peaking at 12.8 m — a size distribution
  that matches the real Archipelago Sea, where only 257 of ~50,000 islands exceed 1 km². Surface colour
  is an **exposure** gradient (bare rock at the water → pale lichen ring → grey-brown undergrowth →
  spruce), NOT an elevation one: ramping lichen up with height is a snow-line function and rendered the
  islands as snow-capped peaks. Vegetation is gated on **shelter** (`broad`, the field with metre-scale
  detail removed) rather than height, so skerries stay bare while island interiors forest up. ~1,000
  instanced spruce, clumped into stands. The whole archipelago + forest is **3 scene-graph nodes**.
  Target + review loop in `docs/ISLANDS.md`. Deferred: roche-moutonnée asymmetry, boulders, rock
  micro-detail, chunking/streaming (needed before the window can grow past ~600 m; generation is
  currently ~1.65 s on the main thread and wants a Web Worker).
- **Lighting overhaul — SHIPPED.** The sun:sky balance was inverted ~1:21; it is now **10.3:1 at the
  zenith, 1:1 at ~7 degrees, and exactly 0 below the horizon**, MEASURED on the real GPU with each
  source isolated (`tools/probe.mjs`). Every per-material lighting exception is gone, `hemiLight` is
  gone, and `envIntensityForSun` / `veilForSun` / `AMBIENT_FLOOR` went with them. Universal shadows;
  overcast by cloud optical depth tau (the sun goes to zero and the shadows go with it, because there is
  no beam); twilight to -18 degrees; clouds by genus; AgX tone mapping. The full account -- including six
  bugs the probe and the blind reviewers found, and everything tried and rejected -- is in
  **`docs/lighting-log.md`**. The brief it was built against is `docs/LIGHTING.md`.
- **Also open:** shoreline **foam** (we have soft edges, not a foam line); efficient chunk meshing
  (greedy) once ships get large; and making voxel edits deterministic/replayable for co-op.
