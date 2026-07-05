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

/**
 * Builds the Shipwright ocean scene: a Gerstner wave surface (see `ocean.ts`),
 * deliberately simple lighting, a procedural sky baked to an env map for the
 * water's reflection, and a buoy that rides the real waves. This is the blank
 * sea the archipelago and voxel ships will be built on.
 */
export function setupOceanScene(ctx: ThreeSceneContext): ThreeSceneHandlers {
  const { scene, camera, renderer } = ctx;

  // World units are metres (see ocean.ts). Camera sits ~3 m above the water,
  // ~9 m back — close enough to read the 1 m test cube against 1-2 m waves.
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

  // A buoy that rides the *real* wave surface by sampling the same wave field
  // the shader displaces — a preview of ship buoyancy and a live check that the
  // CPU and GPU wave fields agree (if it floats on the crests, they're in sync).
  // A 1 m³ test cube (the actual building voxel will be 0.5 m³); also a handy
  // on-screen scale reference for judging wave size.
  const buoyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buoyMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc5533,
    roughness: 0.4,
  });
  const buoy = new THREE.Mesh(buoyGeometry, buoyMaterial);
  scene.add(buoy);

  // Procedural sky; baked to an env map (PMREM) so the water reflects a real
  // horizon. Regenerated whenever the sun or clouds change.
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  // Clear bright day: sun well up (see params below), clear-ish air, deep-blue
  // scatter. Sun ~30° up keeps it from clipping to a white horizon blob.
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

  // Panel is split: a few semantic everyday dials up top, and an "Advanced"
  // folder (collapsed) holding the coupled physics params that already have
  // good defaults — so the common case isn't buried in knobs.
  const gui = new GUI({ title: "Scene" });
  gui.add(renderer, "toneMappingExposure", 0, 1, 0.01).name("exposure");
  const sunFolder = gui.addFolder("Sun");
  sunFolder.add(params, "elevation", 0, 90, 0.1).onChange(updateSun);
  sunFolder.add(params, "azimuth", -180, 180, 0.1).onChange(updateSun);

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
      const sample = ocean.sampleSurface(buoy.position.x, buoy.position.z, elapsed);
      buoy.position.y = sample.height;
      buoy.quaternion.setFromUnitVectors(UP, sample.normal);
      controls.update();
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
    },
  };
}
