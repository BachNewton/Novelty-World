# Hearthwood's WebGPU rewrite: the working contract

A working document for the rewrite of Hearthwood's drawing from WebGL to WebGPU, read by every agent on it. It is deleted when the rewrite lands; what stays true is folded into `CLAUDE.md`.

## What the owner decided

- **WebGPU only.** three's `WebGPURenderer` with TSL node materials, no WebGL fallback: a browser without WebGPU is told so (`components/gpu-canvas.tsx`). Never `forceWebGL`, never GLSL, never `ShaderMaterial`/`RawShaderMaterial`/`onBeforeCompile`.
- **A rewrite, not a port. Performance, not parity.** The goal is well-optimised, performant code. The game need not look as it did.
- **A look of its own.** Much of the old look was ported from Minecraft's Photon shader pack, which left features doing one job twice (three kinds of light ray, two glows, two shadow softeners, four layers of water reflection). That pipeline is gone; the new look is Hearthwood's own (below).
- **One large PR at the end**, on the branch `hearthwood-webgpu`.

The rest of `CLAUDE.md` still holds: Elliott, the pillars, the decoupling of engine, gameplay and art (the engine and gameplay are untouched by this rewrite), the repo's principles and code style (lint clean, no suppressions without a reason, comments only for a why, docs state concepts not code, events not clocks).

## The look: a lit diorama

A warm storybook diorama, lit, not simulated. Light and air carry the mood; every effect does one clear job and is cheap by design.

- **Light**: the storybook light in `art/materials.ts`: the key light (sun or moon) wraps a little past the terminator so forms turn softly, a soft backlit rim of the key light's colour on silhouettes, shade that keeps the sky's and ground's light (the moment's colour). Shadows tinted by the moment rather than black. One crisp shadow near Elliott; past the shadows' reach, the wrap lighting itself gives every slope a lit and a shaded side.
- **Sky**: designed, not physical: the palette's gradients per moment of the day (horizon to zenith, warm towards the sun), a soft sun disc and glow, painted cloud layers (a couple of noise layers, lit with silver edges towards the light), stylised stars, moon (still a lit sphere: its phase is real), Milky Way, aurora and rainbow, all cheap.
- **Air**: one height haze (`art/atmosphere.ts`, in every material) and, with the weather, one fog of mist and rain's veil with a forward glow round the sun, moon and fire (`sunGlow`). No ray marching through shadow maps, no screen-space shafts.
- **Water**: colour by depth, shallow-edge foam lines, flow streaks, a soft sky reflection with the key light's glint, ripples as cheap normal waves. No screen-space reflections, refraction copies, caustics or Snell's window.
- **Post**: one pipeline: (optional) ink edges from depth, one bloom, the storybook tone curve, the season's grade (which also cools the night: the old night vision folds into it), the vignette. Everything that recolours a pixel fuses into the final pass.
- **Motion**: sway and parting in vertex nodes; particles (rain, snow, embers, fireflies, butterflies, sparkles) simulated on the GPU where they move by rules, or placed in the vertex stage from a seed and the clock where they don't.

## The features, after the cut

The switches stay (`features/<group>.ts`, `?features=`, the ~ panel), with the same rule: **a feature that is off is in no shader and costs nothing**. Kept and new:

- Water: `ripples`, `waterAbsorption`, `shoreHighlight`, `skyReflection`, `underwaterFog`, `farWater`, `lakeIce`.
- Sky and light: `sunLight`, `handover`, `moonlight`, `moon`, `stars`, `milkyWay`, `aurora`, `rainbow`, `toneMapping`, `bloom`, `colourGrade`, `vignette`, **`inkEdges`** (new).
- Shadows and foliage: `sunShadows`, `shadowCascades`, `moonShadows`, `leafLight`, `sway`, `plantParting`.
- Atmosphere and weather: `fog`, `clouds`, `cloudShadows`, `rain`, `snow`, `wetGround`, `lightning`, **`sunGlow`** (new).
- Seasons: `seasons`, `seasonalFoliage`, `seasonalGround`.

Cut: `rippleParallax`, `refraction`, `screenSpaceReflections`, `caustics`, `snellsWindow`, `skyScattering`, `skyAmbient`, `noctilucent`, `nightVision`, `softShadows`, `overcastShadows` (the weather softens shadows in the core light instead), `farShading` (the wrap light does it), `bloomyFog`, `godRays`, `sunShafts`, `crepuscularRays` (`sunGlow` does the one job they shared). Rewrite each kept feature's `description` for what it now is, without implementation words like "GLSL" or "pass".

## The foundation (written; extend it, don't route round it)

- `components/gpu-canvas.tsx`: `GpuCanvas`, every Hearthwood canvas (the world, `?art`, `?cats`). R3F over an awaited `WebGPURenderer` with a reversed depth buffer, `flat` (the frame's pipeline tone maps). `extend(three/webgpu)` so JSX elements are the WebGPU classes. Import scene classes from `"three/webgpu"` when they must be the WebGPU build's (materials, `RenderTarget`, `StorageBufferAttribute`…); plain math (`Vector3`, `Color`, `Matrix4`) from `"three"` is the same module.
- `art/atmosphere.ts`: the air's uniforms (`AtmosphereUniforms`, TSL uniform nodes: CPU code sets `.value` as before), `throughAir`, `hazeColour`, `hazeAmount`, `valueNoise`, `hash2`.
- `art/tsl.ts`: `colourUniform()` (a colour uniform typed as the vec3 it is) and `typed<T>()` for nodes three's typings leave loose. Use them rather than scattering casts.
- `art/feature-art.ts`: the contract. A feature's art is `stages` (node functions per material kind at `position`, `surface`, `normal`, `light`, `colour`, composed in list order), a `frame` update (uniforms, `renderer.compute(...)` dispatches), `post` steps (node functions over the frame, ordered around the tone curve at 0), and `replacesAir` (the fog).
- `art/materials.ts`: `diorama(kind, air, options, own)`, every lit material: `"land" | "ground" | "foliage" | "solid"`. `own` gives a material's own nodes under the stages: `position`, `surface` (replaces vertex/material colour), `normal`, `emissive`. It ends in the air (unless `air: false`), is lit by the storybook lighting model, and rebuilds itself when a feature that reaches its kind is switched. Water and the sky are their own node materials (owned by their areas) that apply the same features' stages for their kind the same way (fold the stages; see `materials.ts`).
- `art/frame.ts`: `FrameRenderer`: features' `frame()`, then one `RenderPipeline`: the scene pass (MSAA from `QUALITY.samples`, normals in an MRT only when a step asks), the post steps in order, the tone step (`art/light/tone-mapping.ts`, `exposure` uniform set by the day's light), encoded to the screen. `FrameCosts` reads GPU timestamps (render, compute) while watched.
- `tools/browser.mjs`: the headless browser with WebGPU on any machine. `tools/look.mjs`: one screenshot of any page with any query, printing the page's errors.

Old code for reference: `git show origin/main:src/projects/hearthwood/<path>`. Port the intent and the data (palettes, tokens, CPU maths, tests of pure functions), not the shader structure.

## Performance rules

- **Cost by design.** Prefer the cheaper technique that does the same job for this look. Every full-screen pass must earn its place; blur at reduced resolution; fold recolouring into the final pass (a post step, not a pass).
- **Few pipelines.** WebGPU pipeline creation is the expensive part of a new material. Share one material (one node graph) per kind of thing; vary by uniforms, attributes and instance data, never by building a new graph per object. A per-animal or per-person material is fine only if its graph is the same as its siblings' (three caches by graph).
- **Few draws.** Instance anything repeated. Merge static pieces that share a material.
- **GPU-driven where it pays.** Plants: per-chunk data uploaded once to storage buffers, culled and LOD-picked by a compute pass into indirect draws (`IndirectStorageBufferAttribute`, `geometry.setIndirect`), so the CPU stops copying matrices. Particles: `instancedArray` + compute. Measure before and after.
- **No per-frame allocation** in frame loops (`useFrame`, `frame()`): reuse vectors, set uniform `.value`s.
- **Off is free.** A feature off adds no node, no pass, no compute, no buffer.
- **Measure.** `FrameCosts` (`?costs` in the URL turns timestamp queries on) and toggling features show what each costs. This sandbox renders on SwiftShader (CPU), so its milliseconds are only good for comparing two versions of the same thing, never as absolute numbers.

## Who owns what

Each area owns its files and the feature entries in its group's `art/features/<group>.ts` and `features/<group>.ts`. Touch another area's file only for a one-line fix it needs from you, and say so in your report. Shared foundation files (`materials.ts`, `frame.ts`, `feature-art.ts`, `atmosphere.ts`, `tsl.ts`, `gpu-canvas.tsx`) are the integrator's: if you need a change there, make the smallest one and report it.

- **Sky, light and post** — `art/sky/*`, `art/light/*` (daylight, sun, moonlight, handover, sky-light, bloom, grade, vignette, tone curve), `art/features/sky-and-light.ts`, `features/sky-and-light.ts`, the new `inkEdges`, and the sky dome (`sky/sky.tsx`). The key light: `Daylight` names its directional light `hearthwood-key-light` (shadows configure it).
- **Shadows and plants** — `art/shadows/*`, `art/foliage/*`, `art/features/shadows-and-foliage.ts`, `features/shadows-and-foliage.ts`, `art/plant-shapes.ts`, `art/plant-instances.ts`, `components/valley/world-plants.tsx` (GPU-driven culling), `components/birds/perch-twigs.tsx`. Decides how meshes cast and receive (three's `castShadow`/`receiveShadow`, `CSMShadowNode` for the far shadows) and tells every area what flag to set.
- **Land and seasons** — `art/terrain.ts`, `components/valley/world-land.tsx`, `components/valley/land-workers.ts`, `art/features/seasons.ts`, `features/seasons.ts`, `art/painted.ts`. Seasonal foliage's stage lives in `seasons.ts` and reads attributes the plants area provides (the bands per instance): agree the attribute names in your reports.
- **Water** — `art/water/*`, `art/features/water.ts`, `features/water.ts`.
- **Atmosphere and weather** — `art/atmosphere/*`, `art/weather/*`, `art/features/atmosphere-and-weather.ts`, `features/atmosphere-and-weather.ts`, `components/valley/world-weather.tsx`, the new `sunGlow`.
- **Animals** — `components/animals/*` (coat material, skinned animal, preview, geometry), every species' coat (`components/{cats,dogs,foxes,hedgehogs,squirrels,hares,deer}/*-coat.ts` and bodies), `components/birds/bird-body.tsx`, `art/butterflies.tsx`.
- **Things and effects** — every other `shadeLambert` site and effect: `art/campfire.tsx`, `art/charm-effects.tsx`, `art/hearth-cooking.tsx`, `art/hearth-brewing.tsx`, `art/fireflies.tsx`, `art/pick-pop.ts`, `art/witch.tsx`, `art/broom.tsx`, `art/folk*.ts*`, `art/place-shapes.ts`, `art/forage-shapes.ts`, `art/clue-shapes.ts`, `components/gallery/*`, and the `components/valley/world-*.tsx` sites that build materials (people, fetch, forage, clues, camp, hearth, charms, places, animals' blob shadows).
- **The integrator** (the lead) — the foundation, `world-view.tsx`, the probe (`world-probe.tsx`), the debug panel, the tools, `CLAUDE.md`, merging, the performance pass.

## How we work in one checkout

There is one working tree and one dev server (`http://localhost:3001`, kept running by the lead). The machine is small (2 CPUs), so:

- **Never start another dev server, build, or full test run.** Typecheck with `npx tsc --noEmit -p .` and read only the lines for your files; run only the unit tests of your files (`npx vitest run <files>`).
- **Screenshots are taken one at a time**, through the lock: `flock /tmp/hearthwood-shot.lock node src/projects/hearthwood/tools/look.mjs "<query>" <out.png>`, with `HEARTHWOOD_CHROME=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` set. SwiftShader is slow: a frame of the world can take seconds; keep shots few and small (`--size=960x540`). Use `?features=none,+<yours>` to look at your features alone, and `?hour=`, `?weather=`, `?date=` to hold the moment. Look at the PNG (Read it) before calling anything done. Put shots under the scratchpad, never in the repo.
- **Commit only your own paths**, with a message in the repo's style (`feat(hearthwood): …`), ending with the session's attribution lines, never `git add -A`. If git's index is locked by another agent's commit, wait for that commit to finish (the lock file going away), then commit.
- Other agents are editing other files at the same time. A typecheck error in someone else's file is theirs; a page that won't load because of someone else's file: report it, don't fix it.
- Unit tests that tested GLSL text are rewritten to test what still has a pure core (CPU maths, tables), or deleted with the code they tested. Tests of pure functions that still exist stay green.
