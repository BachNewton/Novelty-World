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
// ~9.8 m quads at 1024². Coarser than the shortest (48/70 m) waves, so their
// crests facet slightly: the rendered GPU surface dips below the analytic crest,
// which can make the CPU-placed cube read as floating a touch high. Accepted for
// now to ease the vertex load — ~1 M vertices vs. ~4 M at 2048² — and the cube's
// placement becomes a Rapier buoyancy concern (roadmap #6) rather than a pure
// render-alignment one. 2048² removes the faceting; a camera-following LOD grid
// (see CLAUDE.md) is the real fix when far water shouldn't cost full detail.
const PLANE_SEGMENTS = 1024;
const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
const SAMPLE_ITERATIONS = 4; // Newton steps to invert horizontal displacement

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

export interface ParticleSample {
  /** Where the water particle at a given rest (x, z) rides to — world position. */
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface Ocean {
  mesh: THREE.Mesh;
  /** Advance the surface to `time` seconds. Call once per frame. */
  update: (time: number) => void;
  /** Water height + normal at world (x, z) and `time` — mirrors the shader. */
  sampleSurface: (x: number, z: number, time: number) => SurfaceSample;
  /** Forward Gerstner: where the particle at REST (x, z) rides to (orbital motion)
   *  + its normal. This is how a floating object rides the waves. */
  sampleParticle: (restX: number, restZ: number, time: number) => ParticleSample;
  /** Bind the scene colour + depth capture the water refracts/absorbs (call once). */
  setSceneCapture: (color: THREE.Texture, depth: THREE.Texture) => void;
  /** Debug: gate the whole refraction/depth/SSR composite (isolate its cost). */
  setWaterFx: (on: boolean) => void;
  /** Camera (near/far/projection) + drawing-buffer size for depth reconstruction,
   *  screen UVs, and the SSR ray-march projection. Call on setup + resize. */
  setViewParams: (camera: THREE.PerspectiveCamera, width: number, height: number) => void;
  /** Add the everyday "Sea" controls to `basic` and fine material tuning to `advanced`. */
  buildGui: (basic: GUI, advanced: GUI) => void;
  /** Strip the water to a bare wireframe (no ripple map) for debugging. */
  setDebug: (on: boolean) => void;
  /** Rebuild the surface mesh at a new tessellation (debug: check facet gap). */
  setSegments: (segments: number) => void;
  dispose: () => void;
}

// --- Sea conditions --------------------------------------------------------
// A named-condition preset drives the whole wave SPECTRUM, not just one height
// knob, because a real sea is wind-sea (short, steep, local) layered over swell
// (long, smooth, from a distant storm) — two seas at the same height can look
// completely different. Each condition lists its wave components (heading,
// wavelength, relative amplitude weight, steepness) plus a target SIGNIFICANT wave
// height Hs — the empirical WMO Sea State measure (mean height of the highest third
// of waves). `applyCondition` scales the component amplitudes to hit that Hs: for a
// sum of sinusoids Hs = 2√2·√(Σ aᵢ²), so aᵢ = wᵢ · Hs / (2√2·√(Σ wⱼ²)).
interface WaveComponent {
  angle: number; // heading, degrees
  wavelength: number; // metres
  weight: number; // relative amplitude
  steepness: number;
}

interface Condition {
  name: string;
  hs: number; // target significant wave height, metres (WMO Sea State)
  detail: number; // fine ripple-normal strength
  waves: WaveComponent[];
}

// The WMO Sea State ladder (codes 0–8, by Hs band), then three "character" presets
// that hold a modest height but reshape the spectrum: a long clean groundswell, a
// short steep wind-sea, and two trains crossing (the confused, pyramidal look).
const CONDITIONS: Condition[] = [
  { name: "0 · Glassy calm", hs: 0.02, detail: 0.12, waves: [
    { angle: 0, wavelength: 60, weight: 1, steepness: 0.1 },
  ] },
  { name: "1 · Rippled", hs: 0.1, detail: 0.5, waves: [
    { angle: 8, wavelength: 14, weight: 1, steepness: 0.25 },
    { angle: -22, wavelength: 9, weight: 0.7, steepness: 0.25 },
  ] },
  { name: "2 · Smooth", hs: 0.35, detail: 0.5, waves: [
    { angle: 6, wavelength: 28, weight: 1, steepness: 0.3 },
    { angle: -20, wavelength: 18, weight: 0.7, steepness: 0.35 },
    { angle: 34, wavelength: 11, weight: 0.5, steepness: 0.3 },
  ] },
  { name: "3 · Slight", hs: 0.9, detail: 0.45, waves: [
    { angle: 4, wavelength: 55, weight: 1, steepness: 0.35 },
    { angle: -24, wavelength: 34, weight: 0.7, steepness: 0.4 },
    { angle: 32, wavelength: 20, weight: 0.5, steepness: 0.4 },
    { angle: -52, wavelength: 13, weight: 0.35, steepness: 0.35 },
  ] },
  { name: "4 · Moderate", hs: 1.9, detail: 0.4, waves: [
    { angle: 0, wavelength: 95, weight: 1, steepness: 0.42 },
    { angle: 28, wavelength: 62, weight: 0.62, steepness: 0.5 },
    { angle: -24, wavelength: 42, weight: 0.42, steepness: 0.5 },
    { angle: 52, wavelength: 26, weight: 0.28, steepness: 0.45 },
  ] },
  { name: "5 · Rough", hs: 3.2, detail: 0.38, waves: [
    { angle: 0, wavelength: 135, weight: 1, steepness: 0.5 },
    { angle: 30, wavelength: 92, weight: 0.66, steepness: 0.58 },
    { angle: -26, wavelength: 60, weight: 0.46, steepness: 0.6 },
    { angle: 54, wavelength: 38, weight: 0.3, steepness: 0.55 },
    { angle: -14, wavelength: 24, weight: 0.22, steepness: 0.5 },
  ] },
  { name: "6 · Very rough", hs: 5.0, detail: 0.34, waves: [
    { angle: 0, wavelength: 185, weight: 1, steepness: 0.55 },
    { angle: 32, wavelength: 125, weight: 0.7, steepness: 0.62 },
    { angle: -28, wavelength: 82, weight: 0.5, steepness: 0.64 },
    { angle: 56, wavelength: 50, weight: 0.35, steepness: 0.6 },
    { angle: -16, wavelength: 32, weight: 0.25, steepness: 0.58 },
  ] },
  { name: "7 · High", hs: 7.5, detail: 0.3, waves: [
    { angle: 0, wavelength: 245, weight: 1, steepness: 0.6 },
    { angle: 34, wavelength: 168, weight: 0.74, steepness: 0.68 },
    { angle: -30, wavelength: 110, weight: 0.54, steepness: 0.7 },
    { angle: 58, wavelength: 68, weight: 0.4, steepness: 0.66 },
    { angle: -18, wavelength: 44, weight: 0.3, steepness: 0.64 },
  ] },
  { name: "8 · Very high (storm)", hs: 11.0, detail: 0.28, waves: [
    { angle: 0, wavelength: 300, weight: 1, steepness: 0.65 },
    { angle: 34, wavelength: 210, weight: 0.78, steepness: 0.72 },
    { angle: -30, wavelength: 140, weight: 0.58, steepness: 0.74 },
    { angle: 60, wavelength: 88, weight: 0.44, steepness: 0.7 },
    { angle: -20, wavelength: 55, weight: 0.32, steepness: 0.68 },
  ] },
  { name: "Long groundswell", hs: 1.4, detail: 0.5, waves: [
    { angle: 0, wavelength: 320, weight: 1, steepness: 0.32 },
    { angle: 7, wavelength: 260, weight: 0.5, steepness: 0.32 },
  ] },
  { name: "Wind chop", hs: 1.0, detail: 0.6, waves: [
    { angle: 0, wavelength: 42, weight: 1, steepness: 0.55 },
    { angle: 35, wavelength: 31, weight: 0.85, steepness: 0.6 },
    { angle: -30, wavelength: 23, weight: 0.7, steepness: 0.6 },
    { angle: 64, wavelength: 17, weight: 0.55, steepness: 0.55 },
    { angle: -58, wavelength: 12, weight: 0.4, steepness: 0.5 },
  ] },
  { name: "Cross sea (confused)", hs: 2.8, detail: 0.44, waves: [
    { angle: 20, wavelength: 115, weight: 1, steepness: 0.5 },
    { angle: -68, wavelength: 98, weight: 0.92, steepness: 0.55 },
    { angle: 48, wavelength: 58, weight: 0.52, steepness: 0.6 },
    { angle: -98, wavelength: 46, weight: 0.5, steepness: 0.6 },
  ] },
];
const DEFAULT_CONDITION = "4 · Moderate";

const OCEAN_PARS = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform int uNumWaves;
uniform vec2 uDir[${MAX_WAVES}];
uniform float uWavelength[${MAX_WAVES}];
uniform float uAmplitude[${MAX_WAVES}];
uniform float uSteepness[${MAX_WAVES}];

varying vec3 vWorldNormal;

void gerstner(vec2 p, out vec3 displaced, out vec3 gnormal) {
  vec3 pos = vec3(p.x, 0.0, p.y);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uNumWaves) break;
    float A = uAmplitude[i];
    if (A <= 0.0) continue;
    vec2 d = uDir[i];
    float k = ${TWO_PI} / uWavelength[i];
    float w = sqrt(${GRAVITY} * k);
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
  // The mesh is world-aligned and untransformed, so the Gerstner object normal is
  // the world normal — handed to the fragment shader to wobble the refraction with
  // (its xz is 0 on flat water → no distortion, and grows with the waves).
  vWorldNormal = gNormal;
`;

// Fragment-side declarations + helpers for the refraction / depth / SSR composite.
const SSR_STEPS = 48; // linear march samples
const SSR_REFINE = 5; // binary-search refinement steps after a hit
const OCEAN_FRAG_PARS = /* glsl */ `
uniform bool uWaterFx;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform mat4 uProjection;
uniform float uRefractionStrength;
uniform vec3 uAbsorption;
uniform vec3 uScatterColor;
uniform bool uSsrEnabled;
uniform float uReflectionStrength;
uniform float uReflectMin;
uniform float uSsrMaxDistance;
uniform float uSsrThickness;
uniform float uSsrMinFresnel;
varying vec3 vWorldNormal;

// Perspective depth [0,1] → positive eye-space distance (metres).
float oceanEyeDist(float depth) {
  float zndc = depth * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - zndc * (uFar - uNear));
}

// Screen-space reflection. March the reflected ray in VIEW space, projecting each
// step to screen to read the scene depth; a hit is where the ray passes just behind
// the stored surface. Returns reflected scene colour in .rgb and a confidence in .a
// (0 = miss → caller falls back to the env-map sky reflection). This reflects
// dynamic geometry (the cube, later ships/islands) correctly on the displaced
// surface, because it rides the real per-pixel normal.
vec4 oceanSsr(vec3 viewPos, vec3 viewNormal) {
  vec3 incident = normalize(viewPos);
  vec3 dir = reflect(incident, viewNormal);
  float stepSize = uSsrMaxDistance / float(${SSR_STEPS});
  vec3 rayPos = viewPos;
  vec2 hitUv = vec2(0.0);
  bool hit = false;
  for (int i = 0; i < ${SSR_STEPS}; i++) {
    rayPos += dir * stepSize;
    vec4 clip = uProjection * vec4(rayPos, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sceneEye = oceanEyeDist(texture2D(uSceneDepth, uv).x);
    float diff = (-rayPos.z) - sceneEye; // >0: ray is behind the scene surface
    if (diff > 0.0 && diff < uSsrThickness) {
      // Binary-refine between the last empty step and this hit for a tight uv.
      vec3 lo = rayPos - dir * stepSize;
      vec3 hi = rayPos;
      for (int j = 0; j < ${SSR_REFINE}; j++) {
        vec3 mid = (lo + hi) * 0.5;
        vec4 mclip = uProjection * vec4(mid, 1.0);
        vec2 muv = (mclip.xy / mclip.w) * 0.5 + 0.5;
        float mEye = oceanEyeDist(texture2D(uSceneDepth, muv).x);
        if ((-mid.z) - mEye > 0.0) { hi = mid; hitUv = muv; } else { lo = mid; }
      }
      hit = true;
      break;
    }
  }
  if (!hit) return vec4(0.0);
  // Fade at screen edges (out-of-bounds has no data) and for rays angled back
  // toward the camera (SSR can't see behind the viewer).
  vec2 e = smoothstep(0.0, 0.12, hitUv) * (1.0 - smoothstep(0.88, 1.0, hitUv));
  float mask = e.x * e.y * clamp(1.0 - max(dot(-incident, dir), 0.0), 0.0, 1.0);
  return vec4(texture2D(uSceneColor, hitUv).rgb, mask);
}
`;

// Injected AFTER <tonemapping_fragment>: the captured scene colour is tone-mapped
// (three applies tone mapping in the material regardless of render target), so we
// composite in that same tone-mapped space to avoid a double tone-map.
//
// Refraction: sample the scene behind the water at this fragment's screen UV, nudged
// by the world wave normal (0 on flat water → straight-through). Guard against
// grabbing an ABOVE-water pixel (would bleed the cube/islands into the water).
// Absorption: Beer–Lambert over the water column (red dies first → turquoise → navy).
// Fresnel blend: look down → see into the water; grazing → keep the reflective/lit
// surface gl_FragColor already holds (sun specular + env sky reflection).
const OCEAN_FRAG_WATER = /* glsl */ `
  if (uWaterFx) {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float waterDist = vViewPosition.z;

    vec2 refractUv = screenUv + vWorldNormal.xz * uRefractionStrength;
    float behindDist = oceanEyeDist(texture2D(uSceneDepth, refractUv).x);
    if (behindDist < waterDist) {
      refractUv = screenUv;
      behindDist = oceanEyeDist(texture2D(uSceneDepth, screenUv).x);
    }
    vec3 refracted = texture2D(uSceneColor, refractUv).rgb;

    float thickness = max(behindDist - waterDist, 0.0);
    vec3 transmit = exp(-uAbsorption * thickness);
    vec3 body = refracted * transmit + uScatterColor * (1.0 - transmit);

    // Geometric Fresnel (0 head-on → 1 grazing). uReflectMin lifts the head-on
    // reflectivity above water's physical ~2% to make the sea read as more
    // reflective (a sky sheen that also veils shallow see-through). The SSR gate
    // uses the RAW geometric term so raising uReflectMin doesn't force the march
    // onto every pixel (which would wreck the perf win).
    float fresnelGeo = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
    float fresnel = clamp(mix(uReflectMin, 1.0, fresnelGeo), 0.0, 1.0);

    // Reflective half: gl_FragColor already holds the env-map sky reflection + sun
    // specular. Only pay for the SSR march where the reflection is actually visible
    // (grazing angles / wave faces) — below the cutoff the reflection is near-invisible,
    // so skip the march and keep the env sky. This is the big perf lever: most of a
    // top-down sea is below the cutoff. Where SSR hits real geometry (the cube, later
    // ships/islands) it overrides the env; a miss keeps the sky.
    vec3 reflective = gl_FragColor.rgb;
    // uSsrEnabled gates the whole march (a true on/off + perf A/B, not a zeroed blend
    // of a march we still paid for); the Fresnel cutoff then skips it per-pixel where
    // the reflection would be invisible anyway.
    if (uSsrEnabled && fresnelGeo > uSsrMinFresnel) {
      vec4 ssr = oceanSsr(-vViewPosition, normalize(normal));
      reflective = mix(reflective, ssr.rgb, ssr.a * uReflectionStrength);
    }
    gl_FragColor.rgb = mix(body, reflective, fresnel);
  }
`;

export function createOcean(): Ocean {
  // Multipliers applied on top of the selected condition (all default to 1× — the
  // condition itself carries the real per-component steepness).
  const globals = {
    amplitude: 1,
    steepness: 1,
    wavelength: 1,
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
    // Screen-space refraction + depth absorption. The scene colour + depth textures
    // (everything but the water) are bound by scene.ts from the shared capture; the
    // shader reads them to see into/behind the water. Beer–Lambert absorption tints
    // the water column and fades the submerged part of objects with depth.
    uWaterFx: { value: true }, // debug: gate the whole refraction/depth/SSR composite
    uSceneColor: { value: null as THREE.Texture | null },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 1 },
    uFar: { value: 20000 },
    uRefractionStrength: { value: 0.04 },
    // Beer–Lambert extinction per metre — red dies fastest, blue persists, so the
    // column deepens turquoise → navy the way clear seawater does (fully tunable).
    uAbsorption: { value: new THREE.Vector3(0.35, 0.18, 0.12) },
    uScatterColor: { value: new THREE.Color(0x0a2f38) },
    // Screen-space reflection: ray-marches the captured depth to reflect dynamic
    // geometry; misses fall back to the env-map sky. uProjection is bound with the
    // view params (it changes on resize). uSsrMinFresnel gates the march — below it
    // the reflection is invisible, so we skip the whole march (the main perf lever).
    uProjection: { value: new THREE.Matrix4() },
    uSsrEnabled: { value: true },
    uReflectionStrength: { value: 1 },
    // Water's real head-on reflectance (~2%); Fresnel lifts it toward 1 at grazing.
    uReflectMin: { value: 0.02 },
    uSsrMaxDistance: { value: 40 },
    uSsrThickness: { value: 1.5 },
    uSsrMinFresnel: { value: 0.05 },
  };

  // The effective waves the CPU sampler reads — kept identical to the uniforms.
  let waves: Wave[] = [];
  // The current condition's components (absolute amplitudes); set by applyCondition.
  let baseWaves: WaveDef[] = [];

  const rebuild = () => {
    waves = baseWaves.map((base) => {
      const angle = THREE.MathUtils.degToRad(base.angle);
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
    // uSpeed stays at its init value of 1 — waves animate at their natural
    // physical phase speed. (No "wind speed" control; that was just a time scale.)
  };

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
  // The env map is the sky reflection (correct on the displaced surface, since it
  // reflects per-pixel by the real normal). It's the reflective half of the water
  // until SSR lands; the refraction composite blends it in by Fresnel.
  material.envMapIntensity = 1.0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCEAN_PARS}`)
      .replace("#include <beginnormal_vertex>", OCEAN_BEGINNORMAL)
      .replace("#include <begin_vertex>", "vec3 transformed = gDisplaced;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${OCEAN_FRAG_PARS}`)
      .replace(
        "#include <tonemapping_fragment>",
        `#include <tonemapping_fragment>\n${OCEAN_FRAG_WATER}`,
      );
  };
  // Keep this material's patched program from being shared with a stock one.
  material.customProgramCacheKey = () => "shipwright-gerstner-ocean";

  // Apply a named sea condition: scale its components to the target Hs, load them as
  // the base waves, reset the manual multipliers to 1×, and set the ripple detail.
  const applyCondition = (cond: Condition) => {
    const sumW2 = cond.waves.reduce((sum, w) => sum + w.weight * w.weight, 0);
    const scale = sumW2 > 0 ? cond.hs / (2 * Math.SQRT2 * Math.sqrt(sumW2)) : 0;
    baseWaves = cond.waves.map((w) => ({
      angle: w.angle,
      wavelength: w.wavelength,
      amplitude: w.weight * scale,
      steepness: w.steepness,
    }));
    globals.amplitude = 1;
    globals.wavelength = 1;
    globals.steepness = 1;
    material.normalScale.set(cond.detail, cond.detail);
    rebuild();
  };
  const initialCondition = CONDITIONS.find((c) => c.name === DEFAULT_CONDITION);
  if (initialCondition) applyCondition(initialCondition);

  const mesh = new THREE.Mesh(geometry, material);

  // Evaluate the Gerstner sum for a grid point: its horizontal displacement
  // (ox, oz), height, and normal. This is the forward function the GPU renders.
  const evalGrid = (gx: number, gz: number, time: number) => {
    const speed = uniforms.uSpeed.value;
    let ox = 0;
    let oz = 0;
    let height = 0;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    for (const wave of waves) {
      if (wave.amplitude <= 0) continue;
      const k = TWO_PI / wave.wavelength;
      const w = Math.sqrt(GRAVITY * k);
      const q = wave.steepness / (k * wave.amplitude * waves.length);
      const phase = k * (wave.dir.x * gx + wave.dir.y * gz) - w * time * speed;
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      ox += q * wave.amplitude * wave.dir.x * c;
      oz += q * wave.amplitude * wave.dir.y * c;
      height += wave.amplitude * s;
      const wa = k * wave.amplitude;
      nx -= wave.dir.x * wa * c;
      nz -= wave.dir.y * wa * c;
      ny -= q * wa * s;
    }
    return { ox, oz, height, nx, ny, nz };
  };

  // Height + normal at a WORLD (x, z). Gerstner also displaces horizontally, so
  // the surface point above (x, z) came from a *different* grid point — we invert
  // that with a few fixed-point steps (grid = world − horizontalOffset(grid)).
  const sampleSurface = (x: number, z: number, time: number): SurfaceSample => {
    const speed = uniforms.uSpeed.value;
    // Invert the horizontal displacement with Newton's method: find grid point g
    // such that g + horizontalOffset(g) = (x, z), using the offset's Jacobian for
    // quadratic convergence (a few steps nail it even at high steepness).
    let gx = x;
    let gz = z;
    for (let iter = 0; iter < SAMPLE_ITERATIONS; iter++) {
      let ox = 0;
      let oz = 0;
      let jxx = 0;
      let jxz = 0;
      let jzz = 0;
      for (const wave of waves) {
        if (wave.amplitude <= 0) continue;
        const k = TWO_PI / wave.wavelength;
        const w = Math.sqrt(GRAVITY * k);
        const q = wave.steepness / (k * wave.amplitude * waves.length);
        const phase = k * (wave.dir.x * gx + wave.dir.y * gz) - w * time * speed;
        const qa = q * wave.amplitude;
        const c = Math.cos(phase);
        const s = Math.sin(phase);
        ox += qa * wave.dir.x * c;
        oz += qa * wave.dir.y * c;
        const qaks = qa * k * s;
        jxx -= qaks * wave.dir.x * wave.dir.x;
        jxz -= qaks * wave.dir.x * wave.dir.y;
        jzz -= qaks * wave.dir.y * wave.dir.y;
      }
      // Solve (I + J)·delta = (g + o − target), then step g by −delta.
      const fx = gx + ox - x;
      const fz = gz + oz - z;
      const a = 1 + jxx;
      const d = 1 + jzz;
      const det = a * d - jxz * jxz;
      if (Math.abs(det) < 1e-6) break;
      gx -= (d * fx - jxz * fz) / det;
      gz -= (a * fz - jxz * fx) / det;
    }
    const { height, nx, ny, nz } = evalGrid(gx, gz, time);
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
    sampleParticle: (restX, restZ, time) => {
      const { ox, oz, height, nx, ny, nz } = evalGrid(restX, restZ, time);
      return {
        position: new THREE.Vector3(restX + ox, height, restZ + oz),
        normal: new THREE.Vector3(nx, ny, nz).normalize(),
      };
    },
    setSceneCapture: (color: THREE.Texture, depth: THREE.Texture) => {
      uniforms.uSceneColor.value = color;
      uniforms.uSceneDepth.value = depth;
    },
    setWaterFx: (on: boolean) => {
      uniforms.uWaterFx.value = on;
    },
    setViewParams: (camera: THREE.PerspectiveCamera, width: number, height: number) => {
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      uniforms.uResolution.value.set(width, height);
      uniforms.uProjection.value.copy(camera.projectionMatrix);
    },
    buildGui: (basic, advanced) => {
      const seaFolder = basic.addFolder("Sea");
      // Manual multipliers fine-tune whatever condition is selected below.
      const ampCtrl = seaFolder
        .add(globals, "amplitude", 0, 5, 0.01)
        .name("wave height ×")
        .onChange(rebuild);
      const wlCtrl = seaFolder
        .add(globals, "wavelength", 0.25, 3, 0.01)
        .name("wavelength ×")
        .onChange(rebuild);
      const steepCtrl = seaFolder
        .add(globals, "steepness", 0, 1.5, 0.01)
        .name("steepness ×")
        .onChange(rebuild);
      // Named sea-state presets (WMO codes + character seas). Selecting one loads its
      // spectrum and resets the multipliers above to 1×.
      const preset = { condition: DEFAULT_CONDITION };
      seaFolder
        .add(preset, "condition", CONDITIONS.map((c) => c.name))
        .name("conditions")
        .onChange((name: string) => {
          const cond = CONDITIONS.find((c) => c.name === name);
          if (cond) applyCondition(cond);
          ampCtrl.updateDisplay();
          wlCtrl.updateDisplay();
          steepCtrl.updateDisplay();
        });

      const detail = { strength: material.normalScale.x, tiling: DETAIL_TILING };
      const waterFolder = advanced.addFolder("Water");
      waterFolder.addColor(material, "color");
      waterFolder.add(material, "roughness", 0, 1, 0.01);
      waterFolder.add(material, "metalness", 0, 1, 0.01);
      waterFolder.add(material, "envMapIntensity", 0, 2, 0.01).name("env reflection");
      waterFolder
        .add(detail, "strength", 0, 1, 0.01)
        .name("ripples")
        .onChange(() => material.normalScale.set(detail.strength, detail.strength));
      waterFolder
        .add(detail, "tiling", 100, 3000, 10)
        .name("ripple scale")
        .onChange(() => detailNormals.repeat.set(detail.tiling, detail.tiling));

      const bodyFolder = advanced.addFolder("Water body");
      bodyFolder
        .add(uniforms.uRefractionStrength, "value", 0, 0.2, 0.002)
        .name("refraction");
      bodyFolder.addColor(uniforms.uScatterColor, "value").name("deep colour");
      bodyFolder.add(uniforms.uAbsorption.value, "x", 0, 1, 0.005).name("absorb R");
      bodyFolder.add(uniforms.uAbsorption.value, "y", 0, 1, 0.005).name("absorb G");
      bodyFolder.add(uniforms.uAbsorption.value, "z", 0, 1, 0.005).name("absorb B");

      const reflFolder = advanced.addFolder("Reflection (SSR)");
      reflFolder.add(uniforms.uSsrEnabled, "value").name("enabled");
      reflFolder.add(uniforms.uReflectionStrength, "value", 0, 1, 0.01).name("strength");
      reflFolder.add(uniforms.uReflectMin, "value", 0.02, 0.4, 0.01).name("reflectivity");
      reflFolder.add(uniforms.uSsrMaxDistance, "value", 5, 120, 1).name("max distance");
      reflFolder.add(uniforms.uSsrThickness, "value", 0.1, 6, 0.1).name("thickness");
      reflFolder
        .add(uniforms.uSsrMinFresnel, "value", 0.02, 0.5, 0.01)
        .name("cutoff (perf)");
    },
    setDebug: (on) => {
      material.wireframe = on;
      material.normalMap = on ? null : detailNormals;
      material.needsUpdate = true;
    },
    setSegments: (segments) => {
      const next = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, segments, segments);
      next.rotateX(-Math.PI / 2);
      mesh.geometry.dispose();
      mesh.geometry = next;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      detailNormals.dispose();
    },
  };
}
