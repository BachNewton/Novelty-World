import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type {
  ThreeSceneContext,
  ThreeSceneHandlers,
} from "@/shared/lib/three/use-three-scene";
import { createOcean } from "./ocean";

const UP = new THREE.Vector3(0, 1, 0);

// Debug probe grid: bright dots placed at the CPU-sampled surface height, the
// same way the buoy is sampled. Overlaid on the wireframe ocean, they reveal
// whether the CPU wave field matches the GPU-rendered surface.
const PROBE_SIDE = 15;
const PROBE_SPACING = 6; // metres between probes

/**
 * Builds the Shipwright ocean scene: a Gerstner wave surface (see `ocean.ts`),
 * simple lighting, a procedural sky, a buoy that rides the waves, and a
 * stripped-down debug overlay (wireframe water + CPU probe dots + grid/axes) for
 * diagnosing how the cube sits relative to the water.
 */
export function setupOceanScene(ctx: ThreeSceneContext): ThreeSceneHandlers {
  const { scene, camera, renderer } = ctx;

  renderer.toneMappingExposure = 0.5;
  camera.position.set(5, 3, 8);

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

  // A 1 m³ test cube that rides the wave surface by sampling the same wave field
  // the shader displaces. Its center is pinned to the water height (so it should
  // sit half-submerged) — the debug overlay checks whether that's really true.
  const buoyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buoyMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc5533,
    roughness: 0.4,
  });
  const buoy = new THREE.Mesh(buoyGeometry, buoyMaterial);
  scene.add(buoy);

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

  const params = { elevation: 30, azimuth: 135 };

  const updateSun = () => {
    const phi = THREE.MathUtils.degToRad(90 - params.elevation);
    const theta = THREE.MathUtils.degToRad(params.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(1000);

    envRenderTarget?.dispose();
    sceneEnv.add(sky);
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
  controls.target.set(0, 0.5, 0);
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
    wireframe: false,
    probes: false,
    seabed: false,
    waterFx: true,
    capture: true,
    segments: 1024,
  };
  const debugFolder = gui.addFolder("Debug");
  debugFolder.add(debug, "wireframe").onChange((on: boolean) => ocean.setDebug(on));
  debugFolder.add(debug, "probes").onChange((on: boolean) => {
    probes.visible = on;
  });
  debugFolder.add(debug, "seabed").name("sea floor").onChange((on: boolean) => {
    seabed.visible = on;
  });
  // Perf isolation: turn each added subsystem off to see its frametime cost.
  debugFolder.add(debug, "waterFx").name("water FX").onChange((on: boolean) => {
    ocean.setWaterFx(on);
  });
  debugFolder.add(debug, "capture").name("scene capture");
  debugFolder
    .add(debug, "segments", 64, 2048, 64)
    .name("tessellation")
    .onFinishChange((n: number) => ocean.setSegments(n));

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

  let elapsed = 0;

  return {
    onFrame: (delta) => {
      elapsed += delta;
      ocean.update(elapsed);
      // The cube rides the water particle at rest (0,0) — it orbits (forward at
      // crests, back in troughs, up and down) with the surface, like a real float.
      const ride = ocean.sampleParticle(0, 0, elapsed);
      buoy.position.copy(ride.position);
      buoy.quaternion.setFromUnitVectors(UP, ride.normal);
      updateProbes(elapsed);
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
      }
    },
    onResize: () => {
      // The hook resizes the capture target itself; just refresh the shader's copy
      // of the drawing-buffer size + projection used for screen-space UVs and SSR.
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      ocean.setViewParams(camera, db.x, db.y);
    },
    dispose: () => {
      gui.destroy();
      controls.dispose();
      envRenderTarget?.dispose();
      pmremGenerator.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      ocean.dispose();
      buoyGeometry.dispose();
      buoyMaterial.dispose();
      seabedGeometry.dispose();
      seabedMaterial.dispose();
      probes.dispose();
      probeGeometry.dispose();
      probeMaterial.dispose();
    },
  };
}
