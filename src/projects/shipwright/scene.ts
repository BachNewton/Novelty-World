import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type {
  ThreeSceneContext,
  ThreeSceneHandlers,
} from "@/shared/lib/three/use-three-scene";
import { createOcean, type ShadingMode } from "./ocean";
import { createPhysics } from "./physics";
import { createNavBuoys } from "./buoys";
import { createMeasuringPole } from "./measuring-pole";

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

  // KNOWN ISSUE: fixed exposure. At high sun elevation the scene lighting (bright noon-sky
  // IBL via scene.environment + the directional sun below + hemi fill) far outshines this
  // fixed 0.5, so PBR objects (buoys, physics bodies) blow out to washed-white. Confirmed
  // pre-existing and independent of the water optics. Fix: auto-exposure — lower exposure as
  // the sun rises (stop down at noon), e.g. drive toneMappingExposure from sun elevation.
  renderer.toneMappingExposure = 0.5;
  camera.position.set(-8, 2.5, 8); // low, aimed across the water toward the low sun

  // Lighting is intentionally minimal — just enough to complement the water and
  // give the sun a specular glint. The env map (below) does most of the work.
  const hemiLight = new THREE.HemisphereLight(0x9fc5e8, 0x0a1a24, 0.5);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.5);
  scene.add(sunLight);

  const ocean = createOcean();
  scene.add(ocean.mesh);

  // Screen-space refraction / depth: the water reads a colour+depth capture of the
  // scene behind it (the shared hook's opt-in `sceneCapture`, populated each frame
  // below with the water hidden). Bind the textures once + the view params.
  const { sceneCapture } = ctx;
  if (sceneCapture) {
    ocean.setSceneCapture(sceneCapture.target.texture, sceneCapture.depthTexture);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    ocean.setViewParams(camera, db.x, db.y);
  }

  // Low-res SSR reflection target: the water renders ONLY its screen-space reflections
  // into this (ocean.renderSsr) at a fraction of the render resolution, then the full-res
  // water shader samples it. This is the "reflection resolution" dial — it decouples the
  // expensive ray-march from the screen resolution. Half res: the ripple-normal distortion
  // (see ocean.ts) hides the softening, so it reads ~the same as full res for much less cost.
  const ssrScale = { value: 0.5 };
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

  // Navigational-marker buoys (lateral + cardinal): the kinematic half of the
  // HYBRID floating model — capsule/spar floats that ride the water via
  // `ocean.sampleParticle` and tilt to the surface normal, no physics engine. The
  // PERMANENT approach for decorative / non-simulated floaters (see buoys.ts and
  // the HYBRID decision in CLAUDE.md).
  const navBuoys = createNavBuoys();
  scene.add(navBuoys.object);

  // Rapier physics: the force-based half of the HYBRID floating model. An
  // assortment of voxel builds (tetromino plates + upright 3-D shapes) drop in as
  // dynamic bodies and float by per-voxel buoyancy sampled from `ocean.sampleSurface`
  // — the buoyancy testbed before the real voxel ships (see physics.ts / CLAUDE.md).
  // Rapier loads async; the meshes render at their spawn pose until it's ready.
  const physics = createPhysics(ocean);
  scene.add(physics.object);
  physics.init().catch((err: unknown) => {
    console.error("Shipwright: Rapier physics failed to initialise", err);
  });

  // Debug seabed: a sandy plane tilted into a beach slope that rises from deep
  // water up through the surface. It's the only way to see depth absorption (the
  // cube's ~0.5 m is too shallow to fade) — it shows the full shallow→deep colour
  // gradient and the soft waterline edge, and previews island shallows. Off by
  // default; toggle in the Debug folder.
  const seabedGeometry = new THREE.PlaneGeometry(240, 240);
  seabedGeometry.rotateX(-Math.PI / 2); // lay flat (world-aligned), then tilt below
  const seabedMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2b280,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
  seabed.rotation.x = 0.14; // ~±17 m depth swing across the plane → a clear gradient
  seabed.position.y = -9;
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
  skyUniforms.turbidity.value = 4;
  skyUniforms.rayleigh.value = 2;
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
  };
  updateSun();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495; // keep the camera above the water
  controls.minDistance = 2;
  controls.maxDistance = 400;
  controls.target.set(4, 1.5, -4); // toward the sun (azimuth 135°) so the sunset + its reflection frame up
  controls.update();

  const gui = new GUI({ title: "Scene" });
  gui.add(renderer, "toneMappingExposure", 0, 1, 0.01).name("exposure");
  // Render scale: default to the display's device pixel ratio (what the browser
  // picks). At that resolution the supersampling antialiases the water's shader
  // detail — the SSR/specular/ripple shimmer MSAA can't touch — so it reads smoother
  // than 1.0. Drop below 1 for more perf on a weak GPU. The hook keeps the drawing
  // buffer + capture target sized to match.
  const perf = { renderScale: renderer.getPixelRatio() };
  gui
    .add(perf, "renderScale", 0.5, 2, 0.05)
    .name("render scale")
    .onChange((r: number) => ctx.setPixelRatio(r));
  const sunFolder = gui.addFolder("Sun");
  sunFolder.add(params, "elevation", 0, 90, 0.1).onChange(updateSun);
  sunFolder.add(params, "azimuth", -180, 180, 0.1).onChange(updateSun);

  const debug = {
    shading: "full" as ShadingMode,
    normalMap: true,
    probes: false,
    seabed: false,
    pole: true,
    waterFx: true,
    capture: true,
    planeSize: 1000, // synced to the mesh at startup via applyGrid (below)
    quadSize: 10000 / 2048, // ~4.9 m quad edge (halved from /1024): finer waves, less peak faceting
  };
  const debugFolder = gui.addFolder("Debug");
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
  // Perf isolation: turn each added subsystem off to see its frametime cost.
  debugFolder.add(debug, "waterFx").name("water FX").onChange((on: boolean) => {
    ocean.setWaterFx(on);
  });
  debugFolder.add(debug, "capture").name("scene capture");
  debugFolder
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
  debugFolder
    .add(debug, "quadSize", 2, 40, 0.5)
    .name("quad size (m)")
    .onFinishChange(applyGrid);
  debugFolder
    .add(debug, "planeSize", 100, 10000, 100)
    .name("plane size (m)")
    .onFinishChange(applyGrid);
  applyGrid(); // sync the mesh to the slider defaults (default plane < PLANE_SIZE)

  const advanced = gui.addFolder("Advanced");
  advanced.close();
  const atmoFolder = advanced.addFolder("Atmosphere");
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
  const cloudFolder = advanced.addFolder("Clouds");
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

  ocean.buildGui(gui, advanced);
  physics.buildGui(gui);

  // The debug GUI eats scarce screen space on phones — start it collapsed there
  // (tap the title bar to expand). Desktop keeps it open.
  if (window.innerWidth < 768) gui.close();

  let elapsed = 0;

  return {
    onFrame: (delta) => {
      elapsed += delta;
      ocean.update(elapsed);
      // Ride the nav-mark buoys on the water (kinematic particle-ride).
      navBuoys.update(ocean, elapsed);
      // Step the Rapier buoyancy sim (fixed-timestep internally) and pose its
      // shapes — before the capture below, so they refract like the buoys. Pass
      // `elapsed` (the same clock the ocean is rendered at) so buoyancy samples the
      // exact on-screen water, not a drifting internal clock.
      physics.update(delta, elapsed);
      // Debug overlay — skip its 15×15 Gerstner evals + instance-buffer upload when hidden.
      if (probes.visible) updateProbes(elapsed);
      controls.update();
      // Capture the scene (minus the water) into the shared colour+depth target so
      // the water shader can refract/absorb what's behind it. Runs after everything
      // is posed for this frame, before the hook's main render (which runs after
      // onFrame and draws the water sampling this capture).
      if (sceneCapture && debug.capture) {
        ocean.mesh.visible = false;
        renderer.setRenderTarget(sceneCapture.target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        ocean.mesh.visible = true;
        // Then render the low-res SSR reflections (water only, reading that capture) so
        // the main render below can sample them. Needs the capture, hence gated with it.
        ocean.renderSsr(renderer, scene, camera, ssrTarget);
      }
    },
    onResize: () => {
      // The hook resizes the capture target itself; just refresh the shader's copy
      // of the drawing-buffer size + projection used for screen-space UVs and SSR.
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      ocean.setViewParams(camera, db.x, db.y);
      sizeSsrTarget();
    },
    dispose: () => {
      gui.destroy();
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
