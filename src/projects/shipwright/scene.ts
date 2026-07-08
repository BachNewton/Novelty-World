import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type {
  ThreeSceneContext,
  ThreeSceneHandlers,
} from "@/shared/lib/three/use-three-scene";
import { createOcean, type ShadingMode } from "./ocean";
import { createPhysics, RAFT, TEST_SHAPES, type Physics } from "./physics";
import { BENCH_SHAPES, benchShapesForCount } from "./bench-shapes";
import { createPlayer } from "./player";
import { createNavBuoys } from "./buoys";
import { createMeasuringPole } from "./measuring-pole";
import {
  FLIGHT,
  FIXED_DT,
  buildTimeline,
  sampleTimeline,
  DEFAULT_MEASURED_SECONDS,
  type BenchSegment,
  type Timeline,
} from "./benchmark";

// --- Render-cost benchmark plumbing (see benchmark.ts + tools/bench.mjs) ------
// Driven over `window.__shipwright.runBenchmark`; the driver lives in the scene closure
// (it needs the camera/ocean/physics), these are just the wire types crossing to the tool.
interface BenchmarkConfig {
  /** Device-pixel-ratio the frame renders at (the dominant fill lever). */
  renderScale?: number;
  /** Fraction of render res the SSR march runs at (the reflection-resolution dial). */
  reflectionRes?: number;
  /** Jerlov water type to pin for the whole run (optics cost). */
  water?: string;
  /** Real-time mode: advance the flight by the real frame delta (wall-clock, natural playback
   *  speed) instead of the deterministic FIXED_DT. Set for headed WATCH runs — the numbers then
   *  reflect felt smoothness, not the byte-identical cost the headless (default) mode gives. */
  realtime?: boolean;
  /** Seconds to hold the final frame before closing (real-time only), so the end reads as "done". */
  endHoldSeconds?: number;
  /** Which cost centre to exercise: "visuals" (render only, physics frozen — the default, GPU cost),
   *  "physics" (step the bench physics with the ocean hidden — isolate CPU physics cost), or "both"
   *  (render AND step — the true combined gameplay frame). See tools/bench.mjs --mode. */
  mode?: BenchmarkMode;
  /** Scale the physics load to this many buoyant hulls (physics/both modes) for the object-count
   *  scaling sweep — a fresh grid of `benchShapesForCount` bodies instead of the demo BENCH_SHAPES.
   *  Undefined = the default demo load. See tools/bench.mjs --bodies. */
  bodies?: number;
}
type BenchmarkMode = "visuals" | "physics" | "both";
/** One recorded frame: CPU prep ms, the physics-step ms, and the raw per-pass GPU ms from the timer. */
interface BenchmarkSample {
  seg: string;
  cpuMs: number;
  physicsMs: number;
  capture: number;
  ssr: number;
  main: number;
}
interface BenchmarkResult {
  fixedDt: number;
  /** Which cost centre this run exercised (visuals / physics / both). */
  mode: BenchmarkMode;
  /** Number of physics bodies actually under load (0 in visuals mode) — the x-axis of a scaling
   *  sweep, so it must travel with the numbers. */
  bodies: number;
  /** True when this was a real-time (headed) run — numbers are felt-smoothness, not deterministic. */
  realtime: boolean;
  /** False when EXT_disjoint_timer_query is unavailable — the tool must reject the run. */
  gpuAvailable: boolean;
  /** The GPU the run actually executed on (WebGL UNMASKED_* strings) — cross-GPU comparison is the
   *  whole point of a portable benchmark, so this must travel with the numbers. */
  gpu: { vendor: string; renderer: string };
  /** Actual pixels the frame was rendered at (res dominates cost, so record it): the drawing-buffer
   *  size = viewport × pixelRatio, plus the low-res SSR pass fraction. */
  render: { width: number; height: number; pixelRatio: number; reflectionRes: number };
  segments: { name: string; description: string; measuredSeconds: number }[];
  samples: BenchmarkSample[];
}
/** Default real-time end-hold (seconds) when the tool doesn't override it — long enough that the
 *  ending clearly reads as "done" when watching live. */
const DEFAULT_END_HOLD_SECONDS = 4;

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

// Debug probe grid: bright dots placed at the CPU-sampled surface height, the
// same way the buoys are sampled. Overlaid on the wireframe ocean, they reveal
// whether the CPU wave field matches the GPU-rendered surface.
const PROBE_SIDE = 15;
const PROBE_SPACING = 6; // metres between probes

/**
 * Builds the Shipwright ocean scene: a Gerstner wave surface (see `ocean.ts`),
 * simple lighting, a procedural sky, marker buoys that ride the waves, and a
 * stripped-down debug overlay (wireframe water + CPU probe dots + grid/axes) for
 * diagnosing how floaters sit relative to the water.
 */
export function setupOceanScene(ctx: ThreeSceneContext): ThreeSceneHandlers {
  const { scene, camera, renderer } = ctx;

  // Exposure is sun-driven (auto-exposure, see the Lighting block below) — it stops down as
  // the sun climbs instead of blowing the frame to washed-white at noon off a fixed value.
  camera.position.set(-8, 2.5, 8); // low, aimed across the water toward the low sun

  // Lighting is intentionally minimal — just enough to complement the water and
  // give the sun a specular glint. The env map (below) does most of the work.
  const hemiLight = new THREE.HemisphereLight(0x9fc5e8, 0x0a1a24, 0.5);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.5);
  scene.add(sunLight);

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
  const { sceneCapture, gpuTimer } = ctx;
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

  // Low-res SSR reflection target: the water renders ONLY its screen-space reflections
  // into this (ocean.renderSsr) at a fraction of the render resolution, then the full-res
  // water shader samples it. This is the "reflection resolution" dial — it decouples the
  // expensive ray-march from the screen resolution. Default ¼ res: SSR is the frame's dominant
  // cost (see docs/PERFORMANCE.md) and it SPIKES at the grazing, eye-level first-person view, which
  // is where framerate stutter shows most; the ripple-normal distortion (ocean.ts) hides the
  // softening so ¼ reads ~the same as full for ~4× fewer marched pixels. Raise it via the GUI for
  // beauty shots on a strong GPU.
  const ssrScale = { value: 0.25 };
  const ssrTarget = new THREE.WebGLRenderTarget(1, 1);
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
    timeSpan("capture", () => {
      ocean.mesh.visible = false;
      renderer.setRenderTarget(sceneCapture.target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      ocean.mesh.visible = true;
    });
    timeSpan("ssr", () => ocean.renderSsr(renderer, scene, camera, ssrTarget));
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
  scene.add(seabed);

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

  // Procedural sky; baked to an env map (PMREM) so the water reflects a real
  // horizon. Regenerated whenever the sun or clouds change.
  const sky = new Sky();
  // Mobile render fix: the Preetham sun-disc term reaches ~1e6 radiance, far past
  // the 65504 ceiling of the HalfFloat env-map target PMREM bakes into. Desktop
  // GPU drivers clamp an over-range half-float write to a finite max, but many
  // mobile drivers (observed on a Pixel 10 Pro XL, WebGL2 highp) emit +Inf, which
  // PMREM's roughness blur then smears into NaN across the whole env map — so every
  // PBR surface reading scene.environment (ocean + cube) renders black once the sun
  // rises past ~19° and the disc crosses the ceiling. Clamp the sky's output below
  // 65504 so the baked value is finite everywhere, matching what desktop already
  // does. Injected before <tonemapping_fragment> (present in both stock and our
  // clouded Sky, after gl_FragColor is assigned) so it's agnostic to the color var.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    "gl_FragColor.rgb = min( gl_FragColor.rgb, vec3( 60000.0 ) );\n\t#include <tonemapping_fragment>",
  );
  sky.scale.setScalar(10000);
  scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  // Rayleigh sets how much the atmosphere reddens the low sun (blue scattered out of the long
  // horizon path → warm/orange disc); turbidity is haze, which washes that colour toward white.
  // Raised rayleigh + lowered turbidity so deep golden hour (~4°) stays distinctly warm instead
  // of fading to pale pastel a step early, while the zenith just reads a touch deeper blue.
  skyUniforms.turbidity.value = 3;
  skyUniforms.rayleigh.value = 3;
  skyUniforms.mieCoefficient.value = 0.004;
  skyUniforms.mieDirectionalG.value = 0.8;
  skyUniforms.cloudCoverage.value = 0.4;
  skyUniforms.cloudDensity.value = 0.5;
  skyUniforms.cloudElevation.value = 0.5;

  const sun = new THREE.Vector3();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  let envRenderTarget: THREE.WebGLRenderTarget | undefined;

  const params = { elevation: 14, azimuth: 135 };

  // --- Lighting: sun-driven auto-exposure + veil brightness ------------------
  // The sky IBL + sun brighten enormously from dusk to noon, so a fixed exposure that suits
  // dusk blows the frame to washed-white at noon (a real camera/eye stops down as the sun
  // climbs). Derive exposure from sun elevation: scene brightness rises ~with sin(elevation)
  // over an ambient-skylight floor, and exposure = key / brightness holds the frame roughly
  // constant so only the specular sun-glitter clips. ACESFilmic tone mapping (set in the
  // shared hook) gives the highlight roll-off.
  //
  // Veil brightness (uWaterLightIntensity) is the downwelling irradiance the water BODY is lit
  // by — Gordon's R∞ (the type's body colour) is a reflectance, so the displayed body = R∞ ×
  // this veil. It must sit in the SAME exposed/tone-mapped space as everything else: because
  // auto-exposure already holds the scene's mid-level roughly constant from dusk to noon, the
  // veil should be roughly CONSTANT through the day too — NOT ramp up toward noon. (The old
  // model ramped it up with elevation, which both crushed turbid water to near-black by day —
  // 0.26 × a dark R∞ — and, composited after tone mapping, pushed clear water toward a clipped
  // cyan at noon.) So: a bright, plateaued daytime value that lets turbid water express its
  // green→olive body, rolling DOWN only toward true dusk (front-loaded, matching the air-mass
  // dimming) where the light genuinely fails. Perceptual choices (not derived), hence tunable.
  const lighting = { auto: true, key: 0.22 };
  const AMBIENT_FLOOR = 0.2; // skylight present even at the horizon, so exposure can't run away
  const VEIL_DUSK = 0.15; // dim, warm dusk body (sun on the horizon; little light penetrates)
  const VEIL_DAY = 0.6; // bright daytime body — turbid coastal water reads its true olive/green
  const veilState = { value: VEIL_DUSK };
  const exposureForSun = (elevation: number) => {
    const brightness = AMBIENT_FLOOR + Math.sin(THREE.MathUtils.degToRad(Math.max(elevation, 0)));
    return THREE.MathUtils.clamp(lighting.key / brightness, 0.05, 1.2);
  };
  // Front-loaded rise from dusk to full daylight, plateaued by ~18° (established day) so noon
  // adds no extra veil to clip against — the reverse of the old ramp-to-noon.
  const veilForSun = (elevation: number) =>
    THREE.MathUtils.lerp(VEIL_DUSK, VEIL_DAY, THREE.MathUtils.smoothstep(elevation, 0, 18));
  // IBL sheen roll-off at high sun. The noon sky env map is so bright that its broad SPECULAR
  // reflection (a near-white sheen every surface picks up, dielectric F0≈0.04 × a huge env) washes
  // objects: it adds white on top, so black paint lifts to grey and saturated hues dilute toward
  // white. Exposure can't fix it — dropping exposure scales the colour AND the white sheen together,
  // so saturation (their ratio) is unchanged. The fix is to cut the sheen itself: ease
  // scene.environmentIntensity DOWN as the sun climbs, so noon keeps hue + dark blacks while low sun
  // keeps its full glossy env (dusk/golden-hour reflections read great and must not change).
  const ENV_INTENSITY_LOW = 1.0; // low/mid sun — full env reflection
  const ENV_INTENSITY_HIGH = 0.45; // noon — tame the bright-sky sheen washing objects
  const envIntensityForSun = (elevation: number) =>
    THREE.MathUtils.lerp(
      ENV_INTENSITY_LOW,
      ENV_INTENSITY_HIGH,
      THREE.MathUtils.smoothstep(elevation, 30, 90),
    );
  // When auto, exposure + veil + env intensity derive from the sun. The GUI dials use .listen() so
  // their displays follow along automatically — no explicit controller refresh needed here.
  const applyLighting = () => {
    if (!lighting.auto) return;
    renderer.toneMappingExposure = exposureForSun(params.elevation);
    veilState.value = veilForSun(params.elevation);
    ocean.setVeilBrightness(veilState.value);
    scene.environmentIntensity = envIntensityForSun(params.elevation);
  };

  const updateSun = () => {
    const phi = THREE.MathUtils.degToRad(90 - params.elevation);
    const theta = THREE.MathUtils.degToRad(params.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(1000);

    sceneEnv.add(sky);
    envRenderTarget?.dispose();
    // Bake the sky to a PMREM env map — image-based lighting (ambient + reflection) for
    // the water and the other PBR surfaces via scene.environment.
    envRenderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.add(sky);
    scene.environment = envRenderTarget.texture;
    applyLighting(); // re-derive exposure + veil for the new sun elevation
  };
  updateSun();

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
      if (w) player.attach(w);
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
    pole: true,
    waterFx: true,
    capture: true,
    planeSize: 5000, // far edge ~2.5 km out for a clean horizon (synced to the mesh at startup below)
    quadSize: 10000 / 2048, // ~4.9 m quad edge (halved from /1024): finer waves, less peak faceting
    simSpeed: 1, // scales the whole sim clock (0 = pause, <1 = slow-mo) for inspecting fast events
  };

  // --- Environment: sun + sky -------------------------------------------------
  const sunFolder = environment.addFolder("Sun");
  sunFolder.add(params, "elevation", 0, 90, 0.1).onChange(updateSun);
  sunFolder.add(params, "azimuth", -180, 180, 0.1).onChange(updateSun);

  // Lighting: exposure + veil brightness. Both auto-derive from sun elevation by default
  // (see the Lighting block above); dragging either dial drops to manual. `brightness` (key)
  // scales the whole auto-exposure curve — the one master knob for overall scene brightness.
  const lightFolder = environment.addFolder("Lighting");
  lightFolder.add(lighting, "auto").name("auto (sun-driven)").listen().onChange(applyLighting);
  lightFolder.add(lighting, "key", 0.05, 0.6, 0.005).name("brightness").onChange(applyLighting);
  lightFolder
    .add(renderer, "toneMappingExposure", 0, 1.2, 0.01)
    .name("exposure")
    .listen()
    .onChange(() => {
      lighting.auto = false;
    });
  lightFolder
    .add(veilState, "value", 0, 1.5, 0.01)
    .name("veil brightness")
    .listen()
    .onChange(() => {
      lighting.auto = false;
      ocean.setVeilBrightness(veilState.value);
    });
  lightFolder.close();

  // Atmosphere + clouds are rarely touched once dialled — collapsed by default.
  const atmoFolder = environment.addFolder("Atmosphere");
  atmoFolder.add(skyUniforms.turbidity, "value", 0, 20, 0.1).name("turbidity").onChange(updateSun);
  atmoFolder.add(skyUniforms.rayleigh, "value", 0, 4, 0.01).name("rayleigh").onChange(updateSun);
  atmoFolder
    .add(skyUniforms.mieCoefficient, "value", 0, 0.1, 0.001)
    .name("haze")
    .onChange(updateSun);
  atmoFolder
    .add(skyUniforms.mieDirectionalG, "value", 0, 1, 0.01)
    .name("sun glow")
    .onChange(updateSun);
  atmoFolder.close();
  const cloudFolder = environment.addFolder("Clouds");
  cloudFolder
    .add(skyUniforms.cloudCoverage, "value", 0, 1, 0.01)
    .name("coverage")
    .onChange(updateSun);
  cloudFolder
    .add(skyUniforms.cloudDensity, "value", 0, 1, 0.01)
    .name("density")
    .onChange(updateSun);
  cloudFolder
    .add(skyUniforms.cloudElevation, "value", 0, 1, 0.01)
    .name("elevation")
    .onChange(updateSun);
  cloudFolder.close();

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
  debugFolder.add(debug, "seabed").name("sea floor").onChange((on: boolean) => {
    seabed.visible = on;
  });
  debugFolder.add(debug, "pole").name("measuring pole").onChange((on: boolean) => {
    measuringPole.object.visible = on;
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
    params.elevation = el;
    params.azimuth = az;
    updateSun(); // one PMREM re-bake, in the segment's (discarded) warmup
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
        params.elevation = el;
        params.azimuth = az;
        updateSun();
        run.lastSunEl = el;
        run.lastSunAz = az;
      }
    }
    ocean.update(run.elapsed);
    navBuoys.update(ocean, run.elapsed);
    // Step the benchmark's OWN physics world (physics/both modes). One deterministic FIXED_DT step
    // per frame headless (byte-identical); real delta headed (natural-speed). Timed on its own so the
    // report can isolate CPU physics cost. Stepped BEFORE the passes so "both" mode reflects the posed
    // bodies. In physics-only mode the ocean is hidden and the passes are skipped, so the frame's GPU
    // cost is ~0 and this physics time is the whole signal.
    let physicsMs = 0;
    if (run.benchPhysics) {
      const p0 = globalThis.performance.now();
      run.benchPhysics.update(run.realtime ? Math.min(delta, 0.1) : FIXED_DT, run.elapsed);
      physicsMs = globalThis.performance.now() - p0;
    }
    const pose = seg.camera(s.u);
    camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    benchTarget.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(benchTarget);
    if (debug.capture && run.mode !== "physics") renderPrePasses();
    const cpuMs = globalThis.performance.now() - cpuStart;
    if (s.measured && gpuTimer) {
      const g = gpuTimer.values();
      run.samples.push({
        seg: seg.name,
        cpuMs,
        physicsMs,
        capture: g.get("capture") ?? 0,
        ssr: g.get("ssr") ?? 0,
        main: g.get("main") ?? 0,
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
    setSun: (elevation: number, azimuth: number) => {
      params.elevation = elevation;
      params.azimuth = azimuth;
      updateSun();
      syncGui();
    },
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
    setVisibility: (opts: { physics?: boolean; pole?: boolean; seabed?: boolean }) => {
      if (opts.physics !== undefined) physics.object.visible = opts.physics;
      if (opts.pole !== undefined) measuringPole.object.visible = opts.pole;
      if (opts.seabed !== undefined) seabed.visible = opts.seabed;
    },
    setAutoExposure: (on: boolean) => {
      lighting.auto = on;
      applyLighting();
      syncGui();
    },
    setExposure: (value: number) => {
      lighting.auto = false;
      renderer.toneMappingExposure = value;
      syncGui();
    },
    setVeil: (value: number) => {
      lighting.auto = false;
      veilState.value = value;
      ocean.setVeilBrightness(value);
      syncGui();
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
    // The benchmark's GPU-ms metric needs EXT_disjoint_timer_query; the tool aborts if false.
    hasGpuTimer: () => gpuTimer !== undefined && gpuTimer.available,
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
      if (config.water !== undefined) ocean.setWaterType(config.water);
      ctx.setFrameStride(1); // always render every frame; headed pacing comes from the real-time clock
      const mode = config.mode ?? "visuals";

      measuringPole.object.visible = false;
      seabed.visible = false;
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
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __shipwright?: typeof debugApi }).__shipwright = debugApi;
  }

  return {
    onFrame: (delta) => {
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
      if (!player.isActive()) controls.update();
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
      controls.dispose();
      envRenderTarget?.dispose();
      ssrTarget.dispose();
      pmremGenerator.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      ocean.dispose();
      physics.dispose();
      navBuoys.dispose();
      measuringPole.dispose();
      seabedGeometry.dispose();
      seabedMaterial.dispose();
      probes.dispose();
      probeGeometry.dispose();
      probeMaterial.dispose();
    },
  };
}
