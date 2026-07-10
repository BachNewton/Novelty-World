import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type {
  ThreeSceneContext,
  ThreeSceneHandlers,
} from "@/shared/lib/three/use-three-scene";
import { createDaylight, enableShadows } from "./sky";
import { sunSkyRatio } from "./lighting";
import { luminance } from "./sky-model";
import { createLightingRig, type LightingMeasurement } from "./lighting-rig";
import { CLOUD_GENUS_NAMES } from "./clouds";
import { createOcean, type ShadingMode } from "./ocean";
import { createPhysics, type Physics } from "./physics";
import { RAFT, TEST_SHAPES } from "./shapes";
import { BENCH_SHAPES, benchShapesForCount } from "./bench-shapes";
import { createPlayer } from "./player";
import { createBuilder } from "./builder";
import { createNavBuoys } from "./buoys";
import { createMeasuringPole } from "./measuring-pole";
import { createTerrain, type ArchipelagoProfile } from "./terrain";
import {
  FLIGHT,
  FIXED_DT,
  buildTimeline,
  sampleTimeline,
  DEFAULT_MEASURED_SECONDS,
  DEFAULT_END_HOLD_SECONDS,
  type BenchSegment,
  type Timeline,
  type BenchmarkConfig,
  type BenchmarkMode,
  type BenchmarkSample,
  type BenchmarkResult,
} from "./benchmark";

// --- Render-cost benchmark plumbing (see benchmark.ts + tools/bench.mjs) ------
// The config/sample/result WIRE TYPES live in benchmark.ts (the contract with the CLI); the DRIVER and
// its live per-run state (BenchmarkRun, below) live here because they need the scene's camera/ocean/
// renderer/physics. Driven over `window.__shipwright.runBenchmark`.
interface BenchmarkRun {
  timeline: Timeline;
  /** Flight-time in seconds — advanced by FIXED_DT (headless) or the real delta (headed). */
  elapsed: number;
  /** Real-time end-hold accumulator (seconds spent holding the final frame) + its target. */
  holdElapsed: number;
  endHoldSeconds: number;
  /** Last sun elevation/azimuth pushed during a sweep, so the sunset HOLD doesn't re-bake every
   *  frame (only re-bake when the sun actually moves). NaN before the first sweep frame. */
  lastSunEl: number;
  lastSunAz: number;
  realtime: boolean;
  /** Diagnostic: also render an empty scene per measured frame to read the irreducible per-call
   *  renderer.render() overhead (bareMs). Opt-in via --bare-probe. */
  bareProbe: boolean;
  mode: BenchmarkMode;
  /** The benchmark-owned physics world (BENCH_SHAPES) stepped each frame in physics/both mode; null
   *  in visuals mode. Separate from the gameplay physics + sailor, so respawn() → deterministic. */
  benchPhysics: Physics | null;
  /** How many bodies that world holds (0 when benchPhysics is null) — recorded in the result. */
  benchBodies: number;
  /** Last segment index applied, so the driver can detect a segment change and set its scene state. */
  prevIndex: number;
  /** Water type a segment reverts to when it doesn't set its own (the run's configured/default). */
  baseWater: string;
  samples: BenchmarkSample[];
  resolve: (result: BenchmarkResult) => void;
}

/** The tone-mapping operators the 2x2 experiment compares. ACES desaturates bright highlights hard,
 *  which is why a correctly-warm low sun clips to flat white; AgX holds hue much further up. */
const TONE_MAPPINGS = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
} as const;
type ToneMappingName = keyof typeof TONE_MAPPINGS;
/** Narrow a name that arrived from the GUI or the debug API, so the lookup below is total. */
const isToneMapping = (name: string): name is ToneMappingName => name in TONE_MAPPINGS;

// Debug probe grid: bright dots placed at the CPU-sampled surface height, the
// same way the buoys are sampled. Overlaid on the wireframe ocean, they reveal
// whether the CPU wave field matches the GPU-rendered surface.
const PROBE_SIDE = 15;
const PROBE_SPACING = 6; // metres between probes

// The archipelago (roadmap #7). One continuous bedrock field, cut by sea level — see terrain.ts and
// docs/ISLANDS.md. This seed/centre was CHOSEN by searching for a window that reads as an Archipelago
// Sea skerry field from the raft: ~14 % land, 53 islands, of which 45 are skerries under 120 m², and
// one 42,000 m² landfall island peaking at 12.8 m off to the south-east. The raft's spawn at the
// world origin sits in ~9 m of open water with room to sail.
const ARCHIPELAGO: ArchipelagoProfile = {
  seed: 8,
  center: [0, -200],
  extent: 600,
  grain: Math.PI / 8, // the glacial grain: islands stretch along it
  deep: -30,
};

/**
 * Builds the Shipwright ocean scene: a Gerstner wave surface (see `ocean.ts`), the physical sky and
 * sun (see `sky.ts` + `lighting.ts`), marker buoys that ride the waves, and a stripped-down debug
 * overlay (wireframe water + CPU probe dots + the lighting rig) for diagnosing how floaters sit
 * relative to the water and how the light falls on everything.
 */
export function setupOceanScene(ctx: ThreeSceneContext): ThreeSceneHandlers {
  const { scene, camera, renderer } = ctx;

  camera.position.set(-8, 2.5, 8); // low, aimed across the water toward the low sun

  // The shared hook's 1 m default near plane is an ocean-scale value: in first person it slices
  // through anything the sailor stands next to (a 0.5 m voxel is well inside it — press against a
  // wall, look down, and you see through its faces into the block). His capsule radius is 0.3 m,
  // so the plane must sit comfortably inside that. Cheap: depth is a 24-bit DepthTexture, and the
  // SSR/absorption reconstruction reads `camera.near` straight off the camera (`setViewParams`).
  camera.near = 0.1;
  camera.updateProjectionMatrix();

  // The whole light — sun, sky dome, PMREM bake, shadow frustum, cloud shadow map, exposure — lives
  // in `sky.ts` behind one physical model (`lighting.ts`). It installs the project's single global
  // `lights_fragment_begin` ShaderChunk override on construction, so every lit material in the scene
  // picks up cloud shadowing from one place. There is no `hemiLight` any more: it was a second sky
  // stacked on the PMREM sky, and the half of it that did real work (bounce off the water and rock
  // below the horizon) is now the dome's own physically-derived ground radiance.
  const daylight = createDaylight({ scene, renderer, camera });

  // The lighting calibration rig: spheres of known albedo (0.04 / 0.18 / 0.90 + chrome + a rough
  // dielectric), off by default, toggled like the measuring pole. It makes the sun:sky ratio, the
  // shadow terminator, the sheen and the highlight roll-off legible straight off a frame — to a human
  // and to a blind reviewer agent. It also owns the linear-HDR probe behind `measureLighting()`.
  const lightingRig = createLightingRig();
  scene.add(lightingRig.object);

  const ocean = createOcean();
  scene.add(ocean.mesh);

  // Gentle-swell sea for the raft/player test. The default sea (~1.7 m primary amplitude) is a
  // rough open-water state; dial it down to a low, long swell the small raft RIDES like a cork
  // (heaving/tilting with the wave) rather than getting swamped — good motion for the player
  // test without washing the deck. Rougher seas return for the balance-loss tests (see the
  // player/raft plan). Set before the GUI is built so its wave sliders reflect these values.
  ocean.setSea({ amplitude: 0.5, steepness: 0.1 });

  // Screen-space refraction / depth: the water reads a colour+depth capture of the
  // scene behind it (the shared hook's opt-in `sceneCapture`, populated each frame
  // below with the water hidden). Bind the textures once + the view params.
  const { sceneCapture, gpuTimer, mainRenderMs } = ctx;
  if (sceneCapture) {
    ocean.setSceneCapture(sceneCapture.target.texture, sceneCapture.depthTexture);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    ocean.setViewParams(camera, db.x, db.y);
  }

  // Break out this scene's pre-passes in the GPU-time panel (the hook times `main`).
  const timeSpan = (name: string, fn: () => void) => {
    if (gpuTimer) gpuTimer.span(name, fn);
    else fn();
  };

  // Frames rendered since setup. Exposed on the debug API so an automated capture can wait on a
  // real rendered frame instead of sleeping for a guessed number of milliseconds.
  let frameCount = 0;

  // CPU seam timers for the benchmark render-prep split (docs/perf-handoff.md thread 1): the
  // wall-clock SUBMISSION cost of each pre-pass, as opposed to `gpuTimer`'s GPU-execution time.
  // `renderPrePasses` writes these; `stepBenchmark` resets them per frame and reads them into the sample.
  const prepassCpu = { capture: 0, ssr: 0 };

  // Low-res SSR reflection target: the water renders ONLY its screen-space reflections
  // into this (ocean.renderSsr) at a fraction of the render resolution, then the full-res
  // water shader samples it. This is the "reflection resolution" dial — it decouples the
  // expensive ray-march from the screen resolution. Default ¼ res: SSR is the frame's dominant
  // cost (see docs/PERFORMANCE.md) and it SPIKES at the grazing, eye-level first-person view, which
  // is where framerate stutter shows most; the ripple-normal distortion (ocean.ts) hides the
  // softening so ¼ reads ~the same as full for ~4× fewer marched pixels. Raise it via the GUI for
  // beauty shots on a strong GPU.
  const ssrScale = { value: 0.25 };
  // HalfFloat, not the default UnsignedByte: the SSR pass samples the linear-HDR scene capture, and
  // an 8-bit target would clamp every reflected highlight to 1.0 before the water ever saw it — the
  // sun's reflection off a wave crest would come back as flat white. Matters now that the water
  // composite runs in linear HDR (see ocean.ts).
  const ssrTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const sizeSsrTarget = () => {
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    ssrTarget.setSize(
      Math.max(1, Math.round(db.x * ssrScale.value)),
      Math.max(1, Math.round(db.y * ssrScale.value)),
    );
  };
  sizeSsrTarget();
  ocean.setSsrSource(ssrTarget.texture);

  // The water's screen-space pre-passes for one frame: (1) capture the scene MINUS the water
  // into the shared colour+depth target, (2) render the low-res SSR reflections that read it.
  // Both the normal loop and the benchmark driver call this; the main render that samples their
  // output runs afterwards in the shared hook. Guards on `sceneCapture` so it's a no-op if the
  // capture target wasn't allocated.
  const renderPrePasses = () => {
    if (!sceneCapture) return;
    // FIRST: the cloud shadow map. Every lit material samples it, including the ones drawn into the
    // capture below, so it has to be current before any of them run.
    timeSpan("cloud", () => daylight.renderCloudShadow(renderer));
    const captureStart = globalThis.performance.now();
    timeSpan("capture", () => {
      ocean.mesh.visible = false;
      renderer.setRenderTarget(sceneCapture.target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      ocean.mesh.visible = true;
    });
    prepassCpu.capture = globalThis.performance.now() - captureStart;
    // Skip the whole low-res march when SSR is off (env-map fallback) — so disabling it reclaims the
    // pass cost (the `ssr` GPU-ms then reads ~0), not just the sampling. The uniform is the source of truth.
    if (ocean.isSsrEnabled()) {
      const ssrStart = globalThis.performance.now();
      timeSpan("ssr", () => ocean.renderSsr(renderer, scene, camera, ssrTarget));
      prepassCpu.ssr = globalThis.performance.now() - ssrStart;
    }
  };

  // Navigational-marker buoys (lateral + cardinal): the kinematic half of the
  // HYBRID floating model — capsule/spar floats that ride the water via
  // `ocean.sampleParticle` and tilt to the surface normal, no physics engine. The
  // PERMANENT approach for decorative / non-simulated floaters (see buoys.ts and
  // the HYBRID decision in CLAUDE.md).
  const navBuoys = createNavBuoys();
  scene.add(navBuoys.object);

  // Rapier physics: the force-based half of the HYBRID floating model. The raft drops in as a
  // dynamic body floated by per-voxel buoyancy sampled from `ocean.sampleSurface`, and owns the
  // shared physics world the player lives in too. Rapier loads async; `init()` is called below
  // once the player exists, so it can be attached to the world in the same step.
  // The raft is the real gameplay platform; the TEST_SHAPES are TEMPORARY buoyancy demos dropped
  // in beside it — the tetromino plates topple + self-right, the upright shapes range from
  // rock-stable to tippy, a scale-reference boat hull, and the Stage-1 "Sealed hull" that floats
  // on trapped air despite being denser than water (flip the Debug "trapped-air cells" x-ray to
  // watch its cavity do the lifting). Drop back to just [RAFT] once the demos aren't needed.
  const physics = createPhysics(ocean, [RAFT, ...TEST_SHAPES]);
  scene.add(physics.object);

  // Debug seabed: a sandy plane tilted into a beach slope that rises from deep
  // water up through the surface. It's the only way to see depth absorption (the
  // cube's ~0.5 m is too shallow to fade) — it shows the full shallow→deep colour
  // gradient and the soft waterline edge, and previews island shallows. Off by
  // default; toggle in the Debug folder.
  const seabedGeometry = new THREE.PlaneGeometry(300, 300);
  seabedGeometry.rotateX(-Math.PI / 2); // lay flat (world-aligned), then tilt below
  const seabedMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2b280,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
  // Steeper + deeper than before (~±33 m about −16, so the slope spans the waterline down to
  // ~−48 m in frame). The SLOPE is the real Secchi gauge — the depth where the sand fades into
  // the water colour IS the visibility — so it must reach past the clearest type's ~40 m, or the
  // clear end can't be read (I vs II indistinguishable). The deep tail also gives a genuine
  // deep-water region, so clear water shows its true deep-blue body away from the sunlit sandbar.
  seabed.rotation.x = 0.22;
  seabed.position.y = -16;
  seabed.visible = false;
  enableShadows(seabed);
  scene.add(seabed);

  // The procedural archipelago (see terrain.ts). It's ordinary opaque scene geometry on layer 0, so
  // it lands in the scene-capture pass automatically — the water's Beer-Lambert absorption reads the
  // drowned bedrock and shades the shallows with no shader work at all.
  // Visible in the live scene; HIDDEN by default in captures (see `setVisibility`), because adding
  // it to the existing shot groups would invalidate every A/B baseline in .shots/.
  const island = createTerrain(ARCHIPELAGO);
  scene.add(island.object);

  // Secchi measuring staff: a metre-numbered board through the surface whose submerged
  // part fades by the real depth-absorption — read the visibility straight off it. A
  // calibration instrument (see measuring-pole.ts); on by default while we tune clarity.
  const measuringPole = createMeasuringPole();
  scene.add(measuringPole.object);

  // --- Debug overlay ---------------------------------------------------------
  const probeGeometry = new THREE.SphereGeometry(0.25, 8, 8);
  const probeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2ec4 });
  const probes = new THREE.InstancedMesh(
    probeGeometry,
    probeMaterial,
    PROBE_SIDE * PROBE_SIDE,
  );
  scene.add(probes);
  probes.visible = false; // debug overlay — off by default, toggle in the Debug folder
  const probeDummy = new THREE.Object3D();
  const updateProbes = (time: number) => {
    const half = (PROBE_SIDE - 1) / 2;
    let i = 0;
    for (let gx = 0; gx < PROBE_SIDE; gx++) {
      for (let gz = 0; gz < PROBE_SIDE; gz++) {
        // Each probe rides the water particle at its rest (x, z) — orbital motion,
        // like a cork or the surface itself, not pinned to a fixed world point.
        const x = (gx - half) * PROBE_SPACING;
        const z = (gz - half) * PROBE_SPACING;
        probeDummy.position.copy(ocean.sampleParticle(x, z, time).position);
        probeDummy.updateMatrix();
        probes.setMatrixAt(i, probeDummy.matrix);
        i++;
      }
    }
    probes.instanceMatrix.needsUpdate = true;
  };

  // The water follows the light through ONE subscription, no matter what moved it — the sun, the
  // clouds, the atmosphere dials, the benchmark. The downwelling veil is now DERIVED: the
  // Fresnel-transmitted beam plus skylight, just below the surface. `veilForSun` and its "perceptual
  // choices (not derived)" comment are both gone.
  // Bloom's high-pass runs on the UNEXPOSED linear image (the OutputPass exposes afterwards), while
  // "bright" is a statement about the DISPLAY. So both numbers below are DISPLAY-space and get divided
  // by the exposure, which ranges over 300x across a day.
  //
  // BLOOM_KNEE is the post-exposure luminance at which ACES has rolled off toward white: above it a
  // pixel is on its way to clipping, and belongs in a coloured glow instead.
  //
  // BLOOM_CLAMP is the bound on how much energy ONE pixel may pour into the glare tail. Without it the
  // first frame of this experiment was a solid white rectangle: a physically scaled sun disc has
  // radiance E/Omega, several hundred times the sky, and `strength * blur(highpass)` is unbounded. A
  // real lens spreads only a bounded fraction of a source into its wide tail. 8x display white keeps a
  // blazing core, a wide warm glow, and a sea that is still visible around it.
  // BLOOM_CLAMP is in units of DISPLAY WHITE. It has to be large: the sun disc is only ~10 px across,
  // so a tight clamp leaves it no energy to glow with (8x white produced no visible halo at all),
  // while no clamp at all turns the frame into a white rectangle. What is being bounded is the
  // fraction of a source's energy a lens throws into its wide glare tail; `UnrealBloomPass` has no
  // energy normalisation, so `strength x clamp` is the halo's real scale.
  // Settled by a parameter sweep, graded blind (docs/LIGHTING.md "The tonemap x bloom experiment"):
  //   knee 32   the bright sunset SKY must be excluded, or the whole frame veils to milky white. This
  //             is the knob that decides whether bloom is usable at all: at knee 1.3 every cell of the
  //             sweep was "WASHED OUT", at knee 32 the deep-red horizon band and the buoys survive.
  //   clamp 1000  high enough that the ORANGE disc out-shines the white aerosol glow beside it (at
  //             clamp 50 the disc was clamped BELOW the sky, so the halo was the sky's, and white);
  //             low enough that the core stays small.
  //   strength    lives on the pass (shipwright.tsx); 0.15 is the only value that does not wash.
  const bloomTuning = { strength: 0.15, radius: 0.6, clamp: 1000, knee: 32 };
  const applyBloomThreshold = (exposure: number) => {
    const e = Math.max(exposure, 1e-6);
    ctx.setBloomPrefilter({ threshold: bloomTuning.knee / e, clamp: bloomTuning.clamp / e });
  };

  // `onState` fires immediately on subscribe, so everything it calls must already exist.
  daylight.onState((light) => {
    ocean.setDownwelling(light.underwaterBeam, light.underwaterSky);
    applyBloomThreshold(light.exposure);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495; // keep the camera above the water
  controls.minDistance = 2;
  controls.maxDistance = 400;
  controls.target.set(4, 1.5, -4); // toward the sun (azimuth 135°) so the sunset + its reflection frame up
  controls.update();

  // First-person sailor. Press F to take control (pointer-lock FPS); Esc returns to the orbit
  // debug camera. While in first-person the player drives the camera and OrbitControls is off.
  const player = createPlayer(camera, renderer.domElement, {
    onActiveChange: (fp) => {
      controls.enabled = !fp;
      if (!fp) {
        // Returning to orbit: aim the target a few metres ahead of where the sailor was looking
        // so the debug camera doesn't snap to a stale target.
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        controls.target.copy(camera.position).addScaledVector(fwd, 5);
        controls.update();
      }
    },
  });
  scene.add(player.object);

  // Voxel builder: while in first person, aim at a voxel face and left-click to break / right-click
  // to place / Q to drop a loose voxel. All the world mutation lives in physics.ts; this is input +
  // the aim dot. Active only while the sailor holds pointer-lock control.
  const builder = createBuilder(
    camera,
    renderer.domElement,
    physics,
    () => player.isActive(),
    () => player.velocity(),
  );
  scene.add(builder.object);

  // Move the sailor inside the sim's fixed loop (deterministic + in-phase with buoyancy), and
  // snapshot his post-step position right after each step so he interpolates in lock-step with
  // the raft (smooth eye at the render rate — see physics `alpha` / player.syncCamera).
  physics.onFixedStep((dt) => player.fixedStep(dt));
  physics.onAfterStep(() => player.recordStep());
  // Now boot Rapier, then attach the player to the same world so it collides with the raft.
  physics
    .init()
    .then(() => {
      const w = physics.world();
      if (w) {
        player.attach(w);
        physics.setPlayerCollider(player.collider()); // exclude the capsule from the build aim ray
      }
    })
    .catch((err: unknown) => {
      console.error("Shipwright: Rapier physics failed to initialise", err);
    });

  const gui = new GUI({ title: "Scene" });

  // The panel is organised by PURPOSE, not by which module owns the state: Environment
  // (the shot — sun + sky), Sea (the water look), Objects (floaters), Performance (every
  // cost dial), Debug (diagnostics / overlays). scene.ts owns this folder skeleton and
  // hands each module the folder it should fill (ocean.buildGui / physics.buildGui), so
  // placement is decided in ONE place instead of emerging from module call order.
  const environment = gui.addFolder("Environment");
  const seaFolder = gui.addFolder("Sea");
  const objects = gui.addFolder("Objects");
  const performance = gui.addFolder("Performance");
  const debugFolder = gui.addFolder("Debug");

  const debug = {
    shading: "full" as ShadingMode,
    normalMap: true,
    probes: false,
    seabed: false,
    island: true,
    pole: true,
    rig: false,
    waterFx: true,
    capture: true,
    planeSize: 5000, // far edge ~2.5 km out for a clean horizon (synced to the mesh at startup below)
    quadSize: 10000 / 2048, // ~4.9 m quad edge (halved from /1024): finer waves, less peak faceting
    simSpeed: 1, // scales the whole sim clock (0 = pause, <1 = slow-mo) for inspecting fast events
  };

  // --- Environment: sun, sky, atmosphere, clouds (all owned by sky.ts) ---------
  daylight.buildGui({ environment });

  // --- Sea: wave shape + water optics (ocean.ts fills its own sub-folders) -----
  ocean.buildGui({ sea: seaFolder });

  // --- Performance: every cost dial in one place ------------------------------
  // Render scale: default to the display's device pixel ratio (what the browser
  // picks). At that resolution the supersampling antialiases the water's shader
  // detail — the SSR/specular/ripple shimmer MSAA can't touch — so it reads smoother
  // than 1.0. Drop below 1 for more perf on a weak GPU. The hook keeps the drawing
  // buffer + capture target sized to match.
  const perf = { renderScale: renderer.getPixelRatio(), fpsStride: 1 };
  performance
    .add(perf, "renderScale", 0.5, 2, 0.05)
    .name("render scale")
    .onChange((r: number) => ctx.setPixelRatio(r));
  // Frame-rate cap. The loop is vsync-locked (the browser paces rAF to the refresh), so the only
  // achievable rates are refresh ÷ N — the control is that N (render 1 of every N frames), which
  // guarantees an even cadence. It's labelled by the fraction of refresh rather than an FPS number
  // because there's no reliable way to read the true refresh rate (a measured rAF cadence just
  // reports the current, perf-limited framerate) — read the resulting FPS off the Stats panel. A
  // solid lower rate feels smoother than a jittery near-refresh one and keeps the APU cooler (less
  // throttling — see docs/PERFORMANCE.md).
  performance
    .add(perf, "fpsStride", { Off: 1, "½ rate": 2, "⅓ rate": 3, "¼ rate": 4 })
    .name("fps cap")
    .onChange((stride: number) => ctx.setFrameStride(stride));
  performance
    .add(ssrScale, "value", 0.1, 1, 0.05)
    .name("reflection res")
    .onFinishChange(sizeSsrTarget);
  // Tessellation is a density (quad edge length in metres), so changing plane size
  // holds quad size constant and scales the segment count — the grid gets no finer
  // as the sea shrinks. Segments are clamped so an extreme combo can't blow the
  // vertex budget (density gives at the limit).
  const applyGrid = () => {
    const segments = Math.min(2048, Math.max(8, Math.round(debug.planeSize / debug.quadSize)));
    ocean.setGrid(debug.planeSize, segments);
  };
  performance
    .add(debug, "quadSize", 2, 40, 0.5)
    .name("quad size (m)")
    .onFinishChange(applyGrid);
  performance
    .add(debug, "planeSize", 100, 10000, 100)
    .name("plane size (m)")
    .onFinishChange(applyGrid);
  applyGrid(); // sync the mesh to the slider defaults (default plane < PLANE_SIZE)
  // Perf isolation: turn each pass off to read its frametime cost.
  performance.add(debug, "waterFx").name("water FX").onChange((on: boolean) => {
    ocean.setWaterFx(on);
  });
  performance.add(debug, "capture").name("scene capture");
  // The tonemap x bloom 2x2 (docs/LIGHTING.md). Both are live so they can be A/B'd in one warm
  // session; switching either recompiles materials, which is fine here and nowhere near a hot path.
  const display: { toneMapping: string; bloom: boolean } = { toneMapping: "AgX", bloom: ctx.isBloomEnabled() };
  const displayFolder = environment.addFolder("Display");
  displayFolder
    .add(display, "toneMapping", Object.keys(TONE_MAPPINGS))
    .name("tonemap")
    .onChange((name: string) => {
      if (isToneMapping(name)) ctx.setToneMapping(TONE_MAPPINGS[name]);
    });
  displayFolder.add(display, "bloom").onChange((on: boolean) => {
    ctx.setBloom(on);
    applyBloomThreshold(daylight.state().exposure);
  });
  displayFolder.add(bloomTuning, "strength", 0, 2, 0.01).onChange((v: number) => {
    const pass = ctx.bloomPass();
    if (pass) pass.strength = v;
  });
  displayFolder.add(bloomTuning, "radius", 0, 1, 0.01).onChange((v: number) => {
    const pass = ctx.bloomPass();
    if (pass) pass.radius = v;
  });
  displayFolder
    .add(bloomTuning, "clamp", 1, 20000, 1)
    .name("glare clamp (x white)")
    .onChange(() => applyBloomThreshold(daylight.state().exposure));
  displayFolder
    .add(bloomTuning, "knee", 0.5, 4, 0.05)
    .name("glare knee (x white)")
    .onChange(() => applyBloomThreshold(daylight.state().exposure));

  // --- Debug: diagnostics + overlays only -------------------------------------
  debugFolder
    .add(debug, "shading", ["full", "flat", "wireframe"])
    .name("shading")
    .onChange((mode: ShadingMode) => ocean.setShading(mode));
  debugFolder
    .add(debug, "normalMap")
    .name("normal map")
    .onChange((on: boolean) => ocean.setNormalMap(on));
  debugFolder.add(debug, "probes").onChange((on: boolean) => {
    probes.visible = on;
  });
  debugFolder.add(debug, "island").onChange((on: boolean) => {
    island.object.visible = on;
  });
  debugFolder.add(debug, "seabed").name("sea floor").onChange((on: boolean) => {
    seabed.visible = on;
  });
  debugFolder.add(debug, "pole").name("measuring pole").onChange((on: boolean) => {
    measuringPole.object.visible = on;
  });
  // The lighting rig, toggled exactly like the measuring pole: one is the gauge for water clarity,
  // the other for light. Both make a frame readable instead of arguable.
  debugFolder.add(debug, "rig").name("lighting rig").onChange((on: boolean) => {
    lightingRig.object.visible = on;
  });
  // Slow-mo / pause the whole sim (waves + physics stay in lock-step) to study a fast event like a
  // bucket dropping in and shipping water. 0 pauses; 0.1–0.3 is a good crawl for watching the entry.
  debugFolder.add(debug, "simSpeed", 0, 1.5, 0.05).name("sim speed");

  // --- Objects: floaters. physics.ts fills the Objects folder and appends its
  // force-arrow diagnostic to Debug. Built last so that toggle lands below the
  // overlay toggles above.
  physics.buildGui({ objects, debug: debugFolder });

  // Everyday tuning lives in Environment + Sea, so leave those open; collapse the rest.
  objects.close();
  performance.close();
  debugFolder.close();

  // The debug GUI eats scarce screen space on phones — start it collapsed there
  // (tap the title bar to expand). Desktop keeps it open.
  if (window.innerWidth < 768) gui.close();

  let elapsed = 0;
  let paused = false;

  // --- Render-cost benchmark driver ------------------------------------------
  // Runs the scripted fixed-dt flight (benchmark.ts) inside the shared animation loop: each
  // frame it overrides the sim clock, camera, and per-segment scene state deterministically,
  // runs the pre-passes, and samples the GpuTimer. See `runBenchmark` on the debug surface.
  let benchmark: BenchmarkRun | null = null;
  const benchTarget = new THREE.Vector3();
  // Diagnostic: an empty scene rendered to the default framebuffer isolates the IRREDUCIBLE per-call
  // renderer.render() overhead (no draws, no render-target switch) from reducible scene/target work.
  // Opt-in via --bare-probe; the main render redraws over it so it's invisible headless.
  const bareScene = new THREE.Scene();
  const applyBenchSegment = (seg: BenchSegment, run: BenchmarkRun) => {
    // Fully reset every dimension each segment (never carry a prior segment's state): wavelength
    // defaults to 1 unless the segment sets a long swell, and water reverts to the run's base.
    ocean.setSea({
      amplitude: seg.sea.amplitude,
      steepness: seg.sea.steepness,
      wavelength: seg.sea.wavelength ?? 1,
    });
    ocean.setWaterType(seg.water ?? run.baseWater);
    const plane = seg.plane ?? 5000;
    if (plane !== debug.planeSize) {
      debug.planeSize = plane;
      applyGrid();
    }
    const [el, az] = seg.sunSweep ? seg.sunSweep.from : seg.sun;
    daylight.setSun(el, az); // one PMREM re-bake, in the segment's (discarded) warmup
    run.lastSunEl = NaN; // force the first sweep frame to push (NaN !== any real angle)
    run.lastSunAz = NaN;
    // Raft (VISUALS mode only): show the gameplay bodies statically as a reflective object (reset to
    // spawn, NOT stepped). In physics/both mode the benchmark's OWN bench physics bodies are the
    // physics content, so the gameplay set stays hidden.
    const showStaticRaft = seg.raft === true && run.mode === "visuals";
    physics.object.visible = showStaticRaft;
    if (showStaticRaft) {
      physics.respawn();
      physics.update(0, run.elapsed);
    }
  };
  const stepBenchmark = (delta: number) => {
    const run = benchmark;
    if (!run) return;
    // Headless: fixed dt → byte-identical flight. Headed: real delta → natural wall-clock playback
    // (clamped so a load hitch can't leap past a whole segment).
    run.elapsed += run.realtime ? Math.min(delta, 0.1) : FIXED_DT;
    const s = sampleTimeline(run.timeline, run.elapsed);
    if (!s) {
      // Real-time: hold the final (max-stress) frame briefly so the end reads as "done" instead of
      // vanishing mid-scene. The camera/scene are untouched, so renderPrePasses re-shows it. Headless
      // has no viewer, so it resolves at once.
      if (run.realtime && run.holdElapsed < run.endHoldSeconds) {
        run.holdElapsed += Math.min(delta, 0.1);
        if (debug.capture) renderPrePasses();
        return;
      }
      benchmark = null;
      // Census the render BEFORE teardown, while the bench bodies are still in the scene and
      // renderer.info holds the last main render's draw count (three resets it per render call). Tells
      // us whether draw-call SUBMISSION is the CPU render-prep driver (thread 1). See BenchmarkResult.
      let sceneObjects = 0;
      let visibleMeshes = 0;
      scene.traverse((o) => {
        sceneObjects++;
        if (o instanceof THREE.Mesh && o.visible) visibleMeshes++;
      });
      const renderInfo = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        sceneObjects,
        visibleMeshes,
      };
      // Tear down the benchmark-owned physics world (if any).
      if (run.benchPhysics) {
        scene.remove(run.benchPhysics.object);
        run.benchPhysics.dispose();
      }
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      // The real GPU behind ANGLE, via the debug-renderer-info extension (some browsers strip it as
      // a fingerprinting mitigation → fall back to the generic vendor/renderer strings).
      const gl = renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = {
        vendor: String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
        renderer: String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
      };
      run.resolve({
        fixedDt: FIXED_DT,
        mode: run.mode,
        bodies: run.benchBodies,
        realtime: run.realtime,
        gpuAvailable: gpuTimer !== undefined && gpuTimer.available,
        gpu,
        render: {
          width: db.x,
          height: db.y,
          pixelRatio: renderer.getPixelRatio(),
          reflectionRes: ssrScale.value,
        },
        segments: FLIGHT.map((seg) => ({
          name: seg.name,
          description: seg.description,
          measuredSeconds: seg.measuredSeconds ?? DEFAULT_MEASURED_SECONDS,
        })),
        renderInfo,
        samples: run.samples,
      });
      return;
    }
    const { seg } = s;
    // NB: `performance` is shadowed in this scope by the lil-gui "Performance" folder, so reach
    // the global timing API explicitly.
    const cpuStart = globalThis.performance.now();
    if (s.index !== run.prevIndex) {
      run.prevIndex = s.index;
      applyBenchSegment(seg, run);
    }
    // Sun sweep (REAL-TIME ONLY — see the type doc): ease OUT `from` → `to` over the first
    // `sweepFraction` of the window (fast near noon, slow near the horizon), then HOLD at `to`. Each
    // move re-bakes the PMREM env map, so we skip it when the sun hasn't moved (the sunset hold) and
    // suppress it entirely in the headless cost run (which would thermally pollute later segments).
    if (seg.sunSweep && run.realtime) {
      const frac = seg.sunSweep.sweepFraction ?? 1;
      const x = frac > 0 ? Math.min(1, s.u / frac) : 1;
      const p = 1 - (1 - x) * (1 - x); // quadratic ease-out: decelerates toward sunset
      const el = THREE.MathUtils.lerp(seg.sunSweep.from[0], seg.sunSweep.to[0], p);
      const az = THREE.MathUtils.lerp(seg.sunSweep.from[1], seg.sunSweep.to[1], p);
      if (el !== run.lastSunEl || az !== run.lastSunAz) {
        daylight.setSun(el, az);
        run.lastSunEl = el;
        run.lastSunAz = az;
      }
    }
    // Gerstner CPU field: the ocean uniform update + nav-buoy surface sampling (the CPU wave eval).
    const oceanStart = globalThis.performance.now();
    ocean.update(run.elapsed);
    navBuoys.update(ocean, run.elapsed);
    const oceanMs = globalThis.performance.now() - oceanStart;
    // Step the benchmark's OWN physics world (physics/both modes). One deterministic FIXED_DT step
    // per frame headless (byte-identical); real delta headed (natural-speed). Timed on its own so the
    // report can isolate CPU physics cost. Stepped BEFORE the passes so "both" mode reflects the posed
    // bodies. In physics-only mode the ocean is hidden and the passes are skipped, so the frame's GPU
    // cost is ~0 and this physics time is the whole signal.
    let physicsMs = 0;
    let buoyancyMs = 0;
    let solverMs = 0;
    if (run.benchPhysics) {
      const p0 = globalThis.performance.now();
      run.benchPhysics.update(run.realtime ? Math.min(delta, 0.1) : FIXED_DT, run.elapsed);
      physicsMs = globalThis.performance.now() - p0;
      // Split the step into buoyancy vs Rapier solver (thread 5); the rest of physicsMs is
      // clamp/snapshot/interp + any substep overhead.
      const t = run.benchPhysics.stepTiming();
      buoyancyMs = t.buoyancy;
      solverMs = t.solver;
    }
    const pose = seg.camera(s.u);
    camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    benchTarget.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(benchTarget);
    // Reset the CPU seam timers so a mode/frame that skips the pre-passes (physics mode) reports 0,
    // never a stale reading; renderPrePasses overwrites them when it runs.
    prepassCpu.capture = 0;
    prepassCpu.ssr = 0;
    if (debug.capture && run.mode !== "physics") renderPrePasses();
    const cpuMs = globalThis.performance.now() - cpuStart;
    // Bare-render probe: the CPU cost of rendering an EMPTY scene to the default framebuffer — the
    // irreducible per-call renderer.render() floor (no draws, no target switch). The main render
    // redraws over it. Only when --bare-probe; 0 otherwise.
    let bareMs = 0;
    if (run.bareProbe) {
      const b0 = globalThis.performance.now();
      renderer.render(bareScene, camera);
      bareMs = globalThis.performance.now() - b0;
    }
    if (s.measured && gpuTimer) {
      const g = gpuTimer.values();
      run.samples.push({
        seg: seg.name,
        cpuMs,
        physicsMs,
        cloud: g.get("cloud") ?? 0,
        capture: g.get("capture") ?? 0,
        // When SSR is off its pass is skipped, so no fresh reading lands — but GpuTimer carries the
        // last value forward (for its panel), which would record a stale "ssr" cost from before the
        // run. Force 0 so the SSR-off cost is real (E6), not the leftover of the interactive frames.
        ssr: ocean.isSsrEnabled() ? (g.get("ssr") ?? 0) : 0,
        main: g.get("main") ?? 0,
        // CPU seam-timer split (thread 1). mainRenderMs() is the shared hook's main-render submit cost
        // from the PRIOR frame (this frame's main render runs after stepBenchmark returns) — same
        // one-frame-stale convention as the GPU timer readback above.
        oceanMs,
        captureCpuMs: prepassCpu.capture,
        ssrCpuMs: prepassCpu.ssr,
        mainCpuMs: mainRenderMs(),
        bareMs,
        buoyancyMs,
        solverMs,
      });
    }
  };

  // Debug control surface for reproducible screenshots + static A/B (driven by
  // scripts/shipwright-shots.mjs). An automated capture sets the scene deterministically —
  // sun, camera, a frozen wave field, water type, lighting mode — so a change is compared
  // frame-for-frame instead of by eye on rolling waves. Dev-only; removed on dispose.
  const syncGui = () => {
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  };
  const debugApi = {
    // Elevation may be NEGATIVE: twilight down to -18 deg is in scope, and those frames are the
    // strongest test that nothing secretly depends on the sun existing.
    setSun: (elevation: number, azimuth: number) => {
      daylight.setSun(elevation, azimuth);
      syncGui();
    },
    setCloudGenus: (name: string) => {
      daylight.setCloudGenus(name);
      syncGui();
    },
    cloudGenera: () => CLOUD_GENUS_NAMES,
    setCamera: (pos: [number, number, number], target: [number, number, number]) => {
      camera.position.set(...pos);
      controls.target.set(...target);
      controls.update();
    },
    freeze: (t?: number) => {
      if (t !== undefined) elapsed = t;
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    setWaterType: (name: string) => {
      ocean.setWaterType(name);
      syncGui();
    },
    setSea: (opts: { amplitude?: number; steepness?: number; wavelength?: number }) => {
      ocean.setSea(opts);
      syncGui();
    },
    setPlaneSize: (size: number) => {
      debug.planeSize = size;
      applyGrid();
      syncGui();
    },
    setShading: (mode: ShadingMode) => {
      ocean.setShading(mode);
    },
    setWaterFx: (on: boolean) => {
      ocean.setWaterFx(on);
    },
    // Toggle scene objects for clean/deterministic captures. The Rapier bodies settle
    // nondeterministically (step count depends on wall-clock), so hide them for A/B;
    // the pole + seabed are framing choices.
    setVisibility: (opts: {
      physics?: boolean;
      pole?: boolean;
      seabed?: boolean;
      island?: boolean;
      rig?: boolean;
      player?: boolean;
    }) => {
      if (opts.physics !== undefined) physics.object.visible = opts.physics;
      // The sailor spawns above the raft, so with the Rapier bodies frozen for capture he hangs in
      // mid-air. Reviewers kept reporting him as "a floating glassy dome".
      if (opts.player !== undefined) player.object.visible = opts.player;
      if (opts.pole !== undefined) measuringPole.object.visible = opts.pole;
      if (opts.seabed !== undefined) seabed.visible = opts.seabed;
      if (opts.island !== undefined) island.object.visible = opts.island;
      if (opts.rig !== undefined) lightingRig.object.visible = opts.rig;
    },
    setTurbidity: (turbidity: number) => {
      daylight.setTurbidity(turbidity);
      syncGui();
    },
    // Exposure and the veil are DERIVED, so there is nothing to set: `setAutoExposure`,
    // `setExposure` and `setVeil` are gone with the curves that needed them. `key` is the one
    // photographic dial left (where middle grey is metered), and it is not sun-dependent.
    setExposureKey: (key: number) => {
      daylight.setExposureKey(key);
      syncGui();
    },
    setAdaptationFloorLux: (lux: number) => {
      daylight.setAdaptationFloorLux(lux);
      syncGui();
    },
    // The tonemap x bloom 2x2. Both re-derive the bloom threshold from the current exposure.
    setToneMapping: (name: string) => {
      if (!isToneMapping(name)) return;
      ctx.setToneMapping(TONE_MAPPINGS[name]);
      syncGui();
    },
    setBloom: (on: boolean) => {
      ctx.setBloom(on);
      applyBloomThreshold(daylight.state().exposure);
      syncGui();
    },
    setBloomTuning: (opts: { strength?: number; radius?: number; clamp?: number; knee?: number }) => {
      if (opts.clamp !== undefined) bloomTuning.clamp = opts.clamp;
      if (opts.knee !== undefined) bloomTuning.knee = opts.knee;
      applyBloomThreshold(daylight.state().exposure);
      const pass = ctx.bloomPass();
      if (!pass) return;
      if (opts.strength !== undefined) pass.strength = opts.strength;
      if (opts.radius !== undefined) pass.radius = opts.radius;
      syncGui();
    },
    /**
     * Measure the sun:sky irradiance ratio on the real GPU, with each source isolated, by rendering
     * a diffuse card into a linear HalfFloat target. Nothing is tone-mapped there (three only
     * tone-maps when drawing to the canvas), so these are TRUE LINEAR radiances -- no sRGB to undo,
     * no ACES to invert. Restores every value it touches.
     */
    measureLighting: (): LightingMeasurement & { modelled: Record<string, number> } => {
      const measured = lightingRig.measure({
        renderer,
        scene,
        sunDirection: new THREE.Vector3().copy(daylight.sunLight.position).sub(daylight.sunLight.target.position).normalize(),
        directionalLights: [daylight.sunLight],
      });
      const light = daylight.state();
      return {
        ...measured,
        // What the CPU model PREDICTS, so a divergence between model and render is visible at once.
        modelled: {
          exposure: light.exposure,
          illuminanceLux: light.illuminanceLux,
          cloudBeamFactor: light.cloudBeamFactor,
          // LUMINANCE, so it is comparable with the probe's luminance-weighted ratio. (Comparing a
          // single channel against a luminance would read as a spurious model/render divergence,
          // because the sky is far bluer than the beam.)
          ratioHorizontal: sunSkyRatio(light),
          beamHorizontal: luminance(light.beamHorizontal),
          skyIrradiance: luminance(light.skyIrradiance),
        },
      };
    },
    // Expose the two GUI-only cost dials the benchmark sweeps as settings.
    setRenderScale: (scale: number) => {
      perf.renderScale = scale;
      ctx.setPixelRatio(scale);
      syncGui();
    },
    setReflectionRes: (scale: number) => {
      ssrScale.value = scale;
      sizeSsrTarget();
      syncGui();
    },
    setSsrEnabled: (on: boolean) => {
      ocean.setSsrEnabled(on);
      syncGui();
    },
    /** True once everything an automated capture depends on has settled: the async ripple normal map
     *  has decoded. (The PMREM sky bake is synchronous inside `daylight.setSun`, which runs during
     *  setup before `__shipwright` is published, and the Rapier bodies are hidden for capture — so
     *  neither needs waiting on.) Replaces a hardcoded sleep in `tools/shots.mjs`. */
    isReady: () => ocean.isReady(),
    /** Frames rendered since setup. A capture applies its scene state, then waits for this to advance,
     *  which is the real event it needs — a rendered frame — rather than a guessed number of ms. */
    frameCount: () => frameCount,
    // The benchmark's GPU-ms metric needs EXT_disjoint_timer_query; the tool aborts if false.
    hasGpuTimer: () => gpuTimer !== undefined && gpuTimer.available,
    /** Statistics of the cloud shadow map, straight off the GPU. `min`/`max` far apart means a real
     *  dappled field; `min == max` means a uniform deck (or a bug). */
    cloudShadowStats: () => daylight.cloudShadowStats(renderer),
    /** Last per-pass GPU times, ms. `total` is the sum of the passes this scene runs. Used by the
     *  tonemap x bloom experiment to price each cell of the 2x2 in one warm session. */
    gpuTimings: () => {
      const g = gpuTimer?.values();
      const cloud = g?.get("cloud") ?? 0;
      const capture = g?.get("capture") ?? 0;
      const ssr = ocean.isSsrEnabled() ? (g?.get("ssr") ?? 0) : 0;
      const main = g?.get("main") ?? 0;
      return { cloud, capture, ssr, main, total: cloud + capture + ssr + main };
    },
    // Run the deterministic fixed-dt flight (benchmark.ts) and resolve with per-frame samples.
    // Applies the run's global cost settings, forces stride 1 (never skip a flight frame), and
    // hides non-flight objects for a clean, consistent scene. See tools/bench.mjs.
    runBenchmark: async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
      if (config.renderScale !== undefined) {
        perf.renderScale = config.renderScale;
        ctx.setPixelRatio(config.renderScale);
      }
      if (config.reflectionRes !== undefined) {
        ssrScale.value = config.reflectionRes;
        sizeSsrTarget();
      }
      if (config.ssrEnabled !== undefined) ocean.setSsrEnabled(config.ssrEnabled);
      if (config.ssrMinFresnel !== undefined) ocean.setSsrMinFresnel(config.ssrMinFresnel); // E5
      if (config.shading !== undefined) ocean.setShading(config.shading); // isolate main-pass fill vs math
      if (config.waterFx !== undefined) ocean.setWaterFx(config.waterFx); // isolate the composite share
      // Diagnostic: run with the GpuTimer's queries off to isolate whether the timer's own
      // command-buffer fences inflate the CPU submit time. hasGpuTimer() stays true (the timer still
      // exists), so the tool doesn't abort; the GPU-ms columns just read 0 for the run.
      gpuTimer?.setEnabled(config.gpuTimer !== false);
      if (config.quadSize !== undefined) {
        debug.quadSize = config.quadSize;
        applyGrid(); // rebuild the ocean plane at the coarser tessellation (E8 vertex-cost isolation)
      }
      if (config.water !== undefined) ocean.setWaterType(config.water);
      ctx.setFrameStride(1); // always render every frame; headed pacing comes from the real-time clock
      const mode = config.mode ?? "visuals";

      measuringPole.object.visible = false;
      seabed.visible = false;
      lightingRig.object.visible = false;
      island.object.visible = false; // keep the flight comparable to every historical bench run
      probes.visible = false;
      player.object.visible = false;
      physics.object.visible = false; // gameplay bodies are never part of a benchmark scene
      // Physics-only: hide the ocean so the frame's GPU cost is ~0 and the physics-step time is the
      // whole signal. Visuals/both keep it.
      ocean.mesh.visible = mode !== "physics";
      paused = false;
      syncGui();

      // Physics load = a benchmark-OWNED Rapier world, separate from the gameplay physics + sailor and
      // reset to a known spawn → deterministic. Its bodies render only in "both". `--bodies N` swaps
      // the curated demo set for a fresh grid of N buoyant hulls (the object-count scaling sweep).
      const shapes =
        config.bodies !== undefined ? benchShapesForCount(config.bodies) : BENCH_SHAPES;
      let benchPhysics: Physics | null = null;
      if (mode === "physics" || mode === "both") {
        benchPhysics = createPhysics(ocean, shapes);
        benchPhysics.object.visible = mode === "both";
        scene.add(benchPhysics.object);
        await benchPhysics.init(); // load Rapier + build the world/bodies before the flight starts
        benchPhysics.respawn();
        // Optional: disable Rapier contact generation on the bench bodies (broad-phase/mass untouched)
        // to measure the collision-resolution share of the step — see BenchmarkConfig.collisionEnabled.
        if (config.collisionEnabled !== undefined) benchPhysics.setCollisionEnabled(config.collisionEnabled);
        if (config.dragEnabled !== undefined) benchPhysics.setDragEnabled(config.dragEnabled);
      }
      const benchBodies = benchPhysics ? shapes.length : 0;

      return new Promise<BenchmarkResult>((resolve) => {
        benchmark = {
          // Warm-up lap kept in both modes; headed just plays it at real-time (a few seconds).
          timeline: buildTimeline(FLIGHT, true),
          elapsed: 0,
          holdElapsed: 0,
          endHoldSeconds: config.endHoldSeconds ?? DEFAULT_END_HOLD_SECONDS,
          lastSunEl: NaN,
          lastSunAz: NaN,
          realtime: config.realtime === true,
          bareProbe: config.bareProbe === true,
          mode,
          benchPhysics,
          benchBodies,
          prevIndex: -1,
          // Segments without their own `water` revert to this — the run's override or the scene default.
          baseWater: config.water ?? "Coastal 5",
          samples: [],
          resolve,
        };
      });
    },
  };
  // The debug/benchmark control surface (dev only). A dev server is sufficient for the perf suite —
  // dev-vs-prod agrees within the noise floor (see docs/perf-experiments.md), and GPU-ms is
  // build-independent (identical GLSL) — so there's no need to leak this into a production build.
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __shipwright?: typeof debugApi }).__shipwright = debugApi;
  }

  return {
    onFrame: (delta) => {
      frameCount++;
      // The benchmark drives its own deterministic clock/camera/passes — hand it the frame and
      // skip the normal interactive path entirely (see stepBenchmark). The shared hook still
      // runs the `main` render + gpuTimer.poll() after this returns.
      if (benchmark) {
        stepBenchmark(delta);
        return;
      }
      // `paused` (debug freeze) holds the wave field + physics on one frame so an automated
      // capture gets a reproducible static image; the scene still renders each frame. `simSpeed`
      // scales the clock for slow-mo/pause inspection — both the wave time and the physics get the
      // same scaled delta, so they never drift out of lock-step.
      if (!paused) {
        const dt = delta * debug.simSpeed;
        elapsed += dt;
        // Step the Rapier buoyancy sim (fixed-timestep internally) and pose its shapes —
        // before the capture below, so they refract like the buoys. Pass `elapsed` (the same
        // clock the ocean is rendered at) so buoyancy samples the exact on-screen water.
        physics.update(dt, elapsed);
      }
      ocean.update(elapsed);
      // Ride the nav-mark buoys on the water (kinematic particle-ride).
      navBuoys.update(ocean, elapsed);
      // Debug overlay — skip its 15×15 Gerstner evals + instance-buffer upload when hidden.
      if (probes.visible) updateProbes(elapsed);
      // Pose the sailor at the interpolated physics state (smooth at the render rate, matching the
      // interpolated raft); in first person that also drives the eye camera, otherwise the orbit
      // debug camera runs.
      player.syncCamera(physics.alpha());
      // Aim the voxel-build highlight from the (now-posed) eye — only shows in first person.
      builder.update();
      if (!player.isActive()) controls.update();
      // Re-anchor the sun's shadow frustum and the cloud shadow map on the (now-final) camera, and
      // scroll the cloud deck. Must precede the pre-passes: they render the scene, shadows and all.
      daylight.update(elapsed);
      // Capture the scene (minus the water) into the shared colour+depth target so
      // the water shader can refract/absorb what's behind it. Runs after everything
      // is posed for this frame, before the hook's main render (which runs after
      // onFrame and draws the water sampling this capture).
      if (debug.capture) renderPrePasses();
    },
    onResize: () => {
      // The hook resizes the capture target itself; just refresh the shader's copy
      // of the drawing-buffer size + projection used for screen-space UVs and SSR.
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      ocean.setViewParams(camera, db.x, db.y);
      sizeSsrTarget();
    },
    dispose: () => {
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as { __shipwright?: typeof debugApi }).__shipwright;
      }
      gui.destroy();
      player.dispose();
      builder.dispose();
      controls.dispose();
      ssrTarget.dispose();
      daylight.dispose();
      lightingRig.dispose();
      ocean.dispose();
      physics.dispose();
      navBuoys.dispose();
      measuringPole.dispose();
      seabedGeometry.dispose();
      seabedMaterial.dispose();
      island.dispose();
      probes.dispose();
      probeGeometry.dispose();
      probeMaterial.dispose();
    },
  };
}
