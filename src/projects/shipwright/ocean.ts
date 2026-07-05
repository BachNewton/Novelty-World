import * as THREE from "three";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";

/**
 * The analytic Gerstner ocean — the single source of truth for the water
 * surface. The exact same sum-of-Gerstner-waves is evaluated in two places:
 *
 *  - the GPU (injected into a MeshStandardMaterial's vertex shader) to displace
 *    and light the visible surface, and
 *  - the CPU (`sampleSurface`) so gameplay — buoyancy, later — can ask "how high
 *    is the water at (x, z) right now?" and get an answer that matches the pixels.
 *
 * Because the surface is a closed-form function of position + time, it is also
 * free to synchronise across a multiplayer session: every client computes the
 * identical sea from the shared clock, no state to send.
 *
 * IMPORTANT: the GLSL in `OCEAN_PARS` and the JS in `sampleSurface` implement
 * the same formula and MUST be kept in lock-step — if you change one, change the
 * other, or the buoy will float off the waves.
 */

// World units are METRES: 1 unit = 1 m, and a voxel block = 1 m³. Wave sizes,
// the plane, camera heights and the buoy are all in metres. Ocean dispersion
// (ω = √(gk)) only looks right at real scale, so keep everything metric.
const MAX_WAVES = 8; // must match the array sizes in OCEAN_PARS
const PLANE_SIZE = 10000; // 10 km of sea — the far edge sits at the horizon
const PLANE_SEGMENTS = 512; // ~20 m quads: enough for the swell geometry below
const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;

// A scrolling normal map adds the fine ripples the geometry waves can't — it's
// what reads as "water" rather than smooth glass. Division of labour: geometry
// = swells/silhouette (tens of metres), this normal map = everything smaller.
const DETAIL_NORMALS_URL = "/shipwright/waternormals.jpg";
const DETAIL_TILING = 1000; // texture repeats across the plane → ~10 m ripples

interface WaveDef {
  /** Heading in degrees; wind direction rotates all of them together. */
  angle: number;
  wavelength: number;
  amplitude: number;
  steepness: number;
}

interface Wave {
  dir: THREE.Vector2;
  wavelength: number;
  amplitude: number;
  steepness: number;
}

export interface SurfaceSample {
  height: number;
  normal: THREE.Vector3;
}

export interface Ocean {
  mesh: THREE.Mesh;
  /** Advance the surface to `time` seconds. Call once per frame. */
  update: (time: number) => void;
  /** Water height + normal at world (x, z) and `time` — mirrors the shader. */
  sampleSurface: (x: number, z: number, time: number) => SurfaceSample;
  /** Add the everyday "Sea" controls to `basic` and fine material tuning to `advanced`. */
  buildGui: (basic: GUI, advanced: GUI) => void;
  dispose: () => void;
}

// A natural sea is a few big swells crossed by shorter chop at varied headings.
// Metres: a ~1.7 m primary swell 180 m long down to ~0.3 m chop — a moderate
// open sea. Smaller ripples are the normal map's job, not geometry's.
const BASE_WAVES: WaveDef[] = [
  { angle: 0, wavelength: 180, amplitude: 1.7, steepness: 0.9 },
  { angle: 34, wavelength: 110, amplitude: 0.95, steepness: 0.85 },
  { angle: -26, wavelength: 70, amplitude: 0.5, steepness: 0.8 },
  { angle: 58, wavelength: 48, amplitude: 0.28, steepness: 0.72 },
];

const OCEAN_PARS = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform int uNumWaves;
uniform vec2 uDir[${MAX_WAVES}];
uniform float uWavelength[${MAX_WAVES}];
uniform float uAmplitude[${MAX_WAVES}];
uniform float uSteepness[${MAX_WAVES}];

void gerstner(vec2 p, out vec3 displaced, out vec3 gnormal) {
  vec3 pos = vec3(p.x, 0.0, p.y);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uNumWaves) break;
    float A = uAmplitude[i];
    if (A <= 0.0) continue;
    vec2 d = uDir[i];
    float k = ${TWO_PI.toFixed(9)} / uWavelength[i];
    float w = sqrt(${GRAVITY.toFixed(2)} * k);
    float q = uSteepness[i] / (k * A * float(uNumWaves));
    float phase = k * dot(d, p) - w * uTime * uSpeed;
    float c = cos(phase);
    float s = sin(phase);
    pos.x += q * A * d.x * c;
    pos.z += q * A * d.y * c;
    pos.y += A * s;
    float wa = k * A;
    nrm.x -= d.x * wa * c;
    nrm.z -= d.y * wa * c;
    nrm.y -= q * wa * s;
  }
  displaced = pos;
  gnormal = normalize(nrm);
}
`;

const OCEAN_BEGINNORMAL = /* glsl */ `
  vec3 gDisplaced;
  vec3 gNormal;
  gerstner(position.xz, gDisplaced, gNormal);
  vec3 objectNormal = gNormal;
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif
`;

export function createOcean(): Ocean {
  const globals = {
    amplitude: 1,
    steepness: 1,
    wavelength: 1,
    speed: 1,
    windDeg: 0,
  };

  // Shared uniform storage — the same objects are handed to the shader and
  // mutated in place by `rebuild`, so edits show up without a recompile.
  const uDirValue: THREE.Vector2[] = Array.from(
    { length: MAX_WAVES },
    () => new THREE.Vector2(),
  );
  const uWavelengthValue = new Array<number>(MAX_WAVES).fill(1);
  const uAmplitudeValue = new Array<number>(MAX_WAVES).fill(0);
  const uSteepnessValue = new Array<number>(MAX_WAVES).fill(0);
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 1 },
    uNumWaves: { value: 0 },
    uDir: { value: uDirValue },
    uWavelength: { value: uWavelengthValue },
    uAmplitude: { value: uAmplitudeValue },
    uSteepness: { value: uSteepnessValue },
  };

  // The effective waves the CPU sampler reads — kept identical to the uniforms.
  let waves: Wave[] = [];

  const rebuild = () => {
    waves = BASE_WAVES.map((base) => {
      const angle = THREE.MathUtils.degToRad(base.angle + globals.windDeg);
      return {
        dir: new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
        wavelength: base.wavelength * globals.wavelength,
        amplitude: base.amplitude * globals.amplitude,
        // Clamp so summed steepness can't exceed 1 (avoids self-intersecting
        // crests). Both GPU and CPU read this clamped value.
        steepness: Math.min(base.steepness * globals.steepness, 1),
      };
    });
    waves.forEach((wave, i) => {
      uDirValue[i].copy(wave.dir);
      uWavelengthValue[i] = wave.wavelength;
      uAmplitudeValue[i] = wave.amplitude;
      uSteepnessValue[i] = wave.steepness;
    });
    for (let i = waves.length; i < MAX_WAVES; i++) {
      uDirValue[i].set(0, 0);
      uWavelengthValue[i] = 1;
      uAmplitudeValue[i] = 0;
      uSteepnessValue[i] = 0;
    }
    uniforms.uNumWaves.value = waves.length;
    uniforms.uSpeed.value = globals.speed;
  };
  rebuild();

  const geometry = new THREE.PlaneGeometry(
    PLANE_SIZE,
    PLANE_SIZE,
    PLANE_SEGMENTS,
    PLANE_SEGMENTS,
  );
  // Bake the flat orientation into the vertices so object space is world-aligned
  // (x, z horizontal, y up) — the Gerstner shader displaces along y directly.
  geometry.rotateX(-Math.PI / 2);

  const detailNormals = new THREE.TextureLoader().load(DETAIL_NORMALS_URL);
  detailNormals.wrapS = THREE.RepeatWrapping;
  detailNormals.wrapT = THREE.RepeatWrapping;
  detailNormals.anisotropy = 4; // keep distant ripple tiling from smearing
  detailNormals.repeat.set(DETAIL_TILING, DETAIL_TILING);

  const material = new THREE.MeshStandardMaterial({
    color: 0x1f4a5a,
    roughness: 0.25,
    metalness: 0,
    normalMap: detailNormals,
  });
  material.normalScale.set(0.35, 0.35);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCEAN_PARS}`)
      .replace("#include <beginnormal_vertex>", OCEAN_BEGINNORMAL)
      .replace("#include <begin_vertex>", "vec3 transformed = gDisplaced;");
  };
  // Keep this material's patched program from being shared with a stock one.
  material.customProgramCacheKey = () => "shipwright-gerstner-ocean";

  const mesh = new THREE.Mesh(geometry, material);

  const sampleSurface = (x: number, z: number, time: number): SurfaceSample => {
    let height = 0;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    const speed = uniforms.uSpeed.value;
    for (const wave of waves) {
      if (wave.amplitude <= 0) continue;
      const k = TWO_PI / wave.wavelength;
      const w = Math.sqrt(GRAVITY * k);
      const q = wave.steepness / (k * wave.amplitude * waves.length);
      const phase = k * (wave.dir.x * x + wave.dir.y * z) - w * time * speed;
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      height += wave.amplitude * s;
      const wa = k * wave.amplitude;
      nx -= wave.dir.x * wa * c;
      nz -= wave.dir.y * wa * c;
      ny -= q * wa * s;
    }
    return { height, normal: new THREE.Vector3(nx, ny, nz).normalize() };
  };

  return {
    mesh,
    update: (time) => {
      uniforms.uTime.value = time;
      // Scroll the ripple layers diagonally so the surface never looks static.
      detailNormals.offset.set(time * 0.03, time * 0.015);
    },
    sampleSurface,
    buildGui: (basic, advanced) => {
      const seaFolder = basic.addFolder("Sea");
      seaFolder.add(globals, "amplitude", 0, 3, 0.01).name("wave height").onChange(rebuild);
      seaFolder
        .add(globals, "steepness", 0, 1.5, 0.01)
        .name("choppiness")
        .onChange(rebuild);
      seaFolder.add(globals, "speed", 0, 3, 0.01).name("wind speed").onChange(rebuild);
      seaFolder
        .add(globals, "windDeg", -180, 180, 1)
        .name("wind dir")
        .onChange(rebuild);

      const detail = { strength: material.normalScale.x, tiling: DETAIL_TILING };
      const waterFolder = advanced.addFolder("Water");
      waterFolder.addColor(material, "color");
      waterFolder.add(material, "roughness", 0, 1, 0.01);
      waterFolder.add(material, "metalness", 0, 1, 0.01);
      waterFolder
        .add(detail, "strength", 0, 1, 0.01)
        .name("ripples")
        .onChange(() => material.normalScale.set(detail.strength, detail.strength));
      waterFolder
        .add(detail, "tiling", 100, 3000, 10)
        .name("ripple scale")
        .onChange(() => detailNormals.repeat.set(detail.tiling, detail.tiling));
      waterFolder.add(globals, "wavelength", 0.25, 3, 0.01).onChange(rebuild);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      detailNormals.dispose();
    },
  };
}
