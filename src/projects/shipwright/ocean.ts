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
// World size of one ripple-map tile. The texture's `repeat` is DERIVED from this
// (planeSize / DETAIL_RIPPLE_METERS) rather than being a fixed tile count, so the
// ripple scale — and the water's look — stays constant as the plane grows or
// shrinks. See `applyRipple`. (A fixed count made ripples finer as the plane shrank.)
const DETAIL_RIPPLE_METERS = 10;

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

/** Debug water shading: the full production surface, an unlit flat fill (isolates raw
 *  fill from the shading math), or wireframe (isolates fill itself). */
export type ShadingMode = "full" | "flat" | "wireframe";

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
  /** Debug: swap water shading to isolate GPU cost — the full production surface, an
   *  unlit flat fill (same wave geometry, trivial fragment → separates fill from the
   *  shading math), or wireframe (no fill). */
  setShading: (mode: ShadingMode) => void;
  /** Debug: actually remove the ripple normal map (fetch + per-pixel tangent-space
   *  perturbation), not just zero its strength — isolates normal-mapping cost. */
  setNormalMap: (on: boolean) => void;
  /** Bind the low-res SSR pass output texture the water shader samples (call once). */
  setSsrSource: (texture: THREE.Texture) => void;
  /** Render the low-res SSR reflection pass (water only) into `target`. Call each frame
   *  after the scene capture and before the main render. */
  renderSsr: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    target: THREE.WebGLRenderTarget,
  ) => void;
  /** Rebuild the surface mesh at a new plane size (m) + tessellation (segments/side).
   *  Debug: the GUI holds quad size (density) constant, so plane size and vertex
   *  count scale together rather than the grid getting finer as the sea shrinks. */
  setGrid: (size: number, segments: number) => void;
  dispose: () => void;
}

// A natural sea is a few big swells crossed by shorter chop at varied headings.
// Metres: a ~1.7 m primary swell 180 m long down to ~0.3 m chop — a moderate
// open sea. The short (48/70 m) waves rely on the high PLANE_SEGMENTS above to
// render without crest faceting.
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

varying vec3 vWorldNormal;
// Ripple-map UV (world-space tiling + scroll) for the fragment's reflection distortion.
// Written only by the main surface (OCEAN_BEGINNORMAL); the SSR/flat debug materials
// include OCEAN_PARS too but leave it unwritten (harmless — their fragments don't read it).
uniform float uRippleMeters;
uniform vec2 uRippleOffset;
varying vec2 vRippleUv;

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
  // World-space ripple UV (matches the detail normal map's tiling + scroll) so the
  // fragment can distort the sampled reflection by the same ripples the surface shows.
  vRippleUv = position.xz / uRippleMeters + uRippleOffset;
`;

// Vertex displacement ONLY (no normal), for the debug unlit MeshBasicMaterial. Same
// Gerstner wave geometry as the real surface, so a flat-vs-PBR FPS comparison changes
// only the fragment work (shading), not the silhouette or how much screen is covered.
const OCEAN_BEGIN_FLAT = /* glsl */ `
  vec3 gDisplaced;
  vec3 gFlatNormal;
  gerstner(position.xz, gDisplaced, gFlatNormal);
  vec3 transformed = gDisplaced;
`;

// The render layer the ocean surface is ALSO drawn on (besides layer 0, the main
// render), so the dedicated SSR pass can point the camera at this layer alone and
// render the water by itself into the low-res reflection target. See `renderSsr`.
const SSR_LAYER = 1;

// Fragment-side declarations + helpers for the refraction / depth / SSR composite.
const SSR_STEPS = 48; // linear march samples
const SSR_REFINE = 5; // binary-search refinement steps after a hit
// The depth→distance + ray-march helpers, shared by TWO shaders: the water fragment
// (its refraction reads oceanEyeDist) and the dedicated SSR pass material (which calls
// oceanSsr). The including shader must declare the uniforms these reference — uNear,
// uFar, uProjection, uSceneColor, uSceneDepth, uSsrMaxDistance, uSsrThickness.
const OCEAN_SSR_FUNCS = /* glsl */ `
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
  float stepSize = uSsrMaxDistance / float(${Math.max(SSR_STEPS, 1)}); // guard 0 (dead loop)
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
uniform sampler2D uSsrReflection; // the low-res SSR pass output this shader samples
uniform sampler2D uReflectRipple; // detail normal map, reused to distort the reflection
uniform float uReflectDistort;
varying vec3 vWorldNormal;
varying vec2 vRippleUv;
${OCEAN_SSR_FUNCS}
`;

// --- Dedicated SSR reflection pass -----------------------------------------
// A ShaderMaterial that renders ONLY the water surface and outputs the SSR march result
// (reflected colour + confidence mask), nothing else. Rendered at low resolution into
// its own target (see scene.ts + `renderSsr`), it lifts the expensive ray-march off the
// full-res water shader and lets its cost scale with the reflection resolution instead
// of the screen. The vertex reuses the Gerstner displacement so the surface — hence the
// reflected rays — matches the visible water exactly.
const OCEAN_SSR_VERT = /* glsl */ `
${OCEAN_PARS}
varying vec3 vSsrViewPos;
varying vec3 vSsrViewNormal;
void main() {
  vec3 gDisplaced;
  vec3 gNormal;
  gerstner(position.xz, gDisplaced, gNormal);
  vec4 mvPosition = modelViewMatrix * vec4(gDisplaced, 1.0);
  vSsrViewPos = mvPosition.xyz;
  vSsrViewNormal = normalMatrix * gNormal;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const OCEAN_SSR_FRAG = /* glsl */ `
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform float uNear;
uniform float uFar;
uniform mat4 uProjection;
uniform float uSsrMaxDistance;
uniform float uSsrThickness;
uniform float uSsrMinFresnel;
varying vec3 vSsrViewPos;
varying vec3 vSsrViewNormal;
${OCEAN_SSR_FUNCS}
void main() {
  vec3 n = normalize(vSsrViewNormal);
  // Same Fresnel cutoff the inline march used — skip where the reflection is invisible.
  float fresnelGeo = pow(1.0 - clamp(dot(normalize(-vSsrViewPos), n), 0.0, 1.0), 5.0);
  if (fresnelGeo <= uSsrMinFresnel) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = oceanSsr(vSsrViewPos, n);
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
    // specular. SSR (dynamic object reflections) now comes from a dedicated LOW-RES pass
    // (ocean.ts renderSsr) — sampled here rather than marched inline, so this full-res
    // shader carries none of the march cost and its Fresnel cutoff lives in the pass.
    // Where SSR hit real geometry it overrides the env sky; a miss (mask 0) keeps the sky.
    vec3 reflective = gl_FragColor.rgb;
    if (uSsrEnabled) {
      // Distort the sample by the FULL-RES ripple normal (+ the analytic swell) so the
      // smooth low-res reflection gets the fine normal-map blur back — restoring the
      // ripple look AND masking the pass's low-res blockiness.
      vec2 ripple = texture2D(uReflectRipple, vRippleUv).xy * 2.0 - 1.0;
      vec2 ssrUv = screenUv + vWorldNormal.xz * uRefractionStrength + ripple * uReflectDistort;
      vec4 ssr = texture2D(uSsrReflection, ssrUv);
      reflective = mix(reflective, ssr.rgb, ssr.a * uReflectionStrength);
    }
    gl_FragColor.rgb = mix(body, reflective, fresnel);
  }
`;

export function createOcean(): Ocean {
  const globals = {
    amplitude: 1,
    steepness: 0.2,
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
    // Output of the low-res SSR pass (bound by scene.ts via setSsrSource); the water
    // shader samples this instead of marching inline.
    uSsrReflection: { value: null as THREE.Texture | null },
    // Ripple distortion of the reflection, applied at FULL res when sampling the low-res
    // SSR texture — restores the fine normal-map blur the smooth pass lacks AND masks its
    // low-res blockiness. Reuses the detail normal map (bound below); uRippleMeters +
    // uRippleOffset reproduce its world-space tiling + scroll (see OCEAN_BEGINNORMAL).
    uReflectRipple: { value: null as THREE.Texture | null },
    uReflectDistort: { value: 0.03 },
    uRippleMeters: { value: DETAIL_RIPPLE_METERS },
    uRippleOffset: { value: new THREE.Vector2(0, 0) },
  };

  // The effective waves the CPU sampler reads — kept identical to the uniforms.
  let waves: Wave[] = [];

  const rebuild = () => {
    waves = BASE_WAVES.map((base) => {
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
  rebuild();

  // Live geometry parameters — mutated by the debug setSize/setSegments controls,
  // both of which rebuild the plane through buildGeometry.
  let planeSize = PLANE_SIZE;
  let planeSegments = PLANE_SEGMENTS;
  const buildGeometry = () => {
    const geo = new THREE.PlaneGeometry(planeSize, planeSize, planeSegments, planeSegments);
    // Bake the flat orientation into the vertices so object space is world-aligned
    // (x, z horizontal, y up) — the Gerstner shader displaces along y directly.
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const geometry = buildGeometry();

  const detailNormals = new THREE.TextureLoader().load(DETAIL_NORMALS_URL);
  detailNormals.wrapS = THREE.RepeatWrapping;
  detailNormals.wrapT = THREE.RepeatWrapping;
  detailNormals.anisotropy = 4; // keep distant ripple tiling from smearing
  // Ripple tiling is derived from the plane size so the ripple world-scale is fixed
  // regardless of plane size (kept in lock-step by setGrid + the GUI ripple control).
  uniforms.uReflectRipple.value = detailNormals; // reuse the ripple map for reflection distortion
  let rippleMeters = DETAIL_RIPPLE_METERS;
  const applyRipple = () => {
    const tiles = planeSize / rippleMeters;
    detailNormals.repeat.set(tiles, tiles);
    uniforms.uRippleMeters.value = rippleMeters;
  };
  applyRipple();

  // Inject the Gerstner vertex displacement + analytic normal into a lit material's
  // program. Used by the production PBR surface; keeps the vertex/geometry logic in one
  // place so any material rendered on the mesh shares the identical wave surface.
  const patchGerstnerVertex = (shader: {
    uniforms: Record<string, THREE.IUniform>;
    vertexShader: string;
  }) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCEAN_PARS}`)
      .replace("#include <beginnormal_vertex>", OCEAN_BEGINNORMAL)
      .replace("#include <begin_vertex>", "vec3 transformed = gDisplaced;");
  };

  // The water surface is a patched MeshStandardMaterial. Standard's metallic-roughness
  // BRDF measured ~2x Phong's per-pixel cost on a weak iGPU, BUT that gap only bites when
  // water fills the screen in an otherwise-empty scene; in real, populated frames it's a
  // rounding error, and Standard's IBL from scene.environment (the warm-sunset ambient +
  // PMREM sky reflection) reads better. So PBR it is. The Gerstner displacement + the
  // screen-space FX composite are lighting-model-agnostic and carry over regardless.
  // (A Phong variant was explored for perf; git history has the code if a tier's needed.)
  const material = new THREE.MeshStandardMaterial({
    color: 0x1f4a5a,
    roughness: 0.25,
    metalness: 0,
    normalMap: detailNormals,
  });
  material.normalScale.set(0.35, 0.35);
  material.envMapIntensity = 1.0; // IBL (ambient + reflection) from scene.environment (PMREM sky)
  material.onBeforeCompile = (shader) => {
    patchGerstnerVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${OCEAN_FRAG_PARS}`)
      .replace(
        "#include <tonemapping_fragment>",
        `#include <tonemapping_fragment>\n${OCEAN_FRAG_WATER}`,
      );
  };
  // Keep this material's patched program from being shared with a stock one.
  material.customProgramCacheKey = () => "shipwright-gerstner-ocean";

  // Debug shading: an unlit, wave-displaced material. Same Gerstner geometry as the
  // real surface but a trivial fragment (flat colour — no PBR lighting, normal map,
  // or env sampling). Comparing "flat" vs "full" FPS separates raw fill/bandwidth cost
  // (pixel writes, identical in both) from the lit shading math (present only in full).
  const basicMaterial = new THREE.MeshBasicMaterial({ color: 0x1f4a5a });
  basicMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCEAN_PARS}`)
      .replace("#include <begin_vertex>", OCEAN_BEGIN_FLAT);
  };
  basicMaterial.customProgramCacheKey = () => "shipwright-gerstner-ocean-flat";

  // The dedicated SSR-pass material (OCEAN_SSR_VERT/FRAG). Shares the wave + SSR uniforms
  // (same objects) so it stays in lock-step with the surface and the scene capture; it
  // renders the water alone into the low-res reflection target that the main shader samples.
  const ssrMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uSpeed: uniforms.uSpeed,
      uNumWaves: uniforms.uNumWaves,
      uDir: uniforms.uDir,
      uWavelength: uniforms.uWavelength,
      uAmplitude: uniforms.uAmplitude,
      uSteepness: uniforms.uSteepness,
      uSceneColor: uniforms.uSceneColor,
      uSceneDepth: uniforms.uSceneDepth,
      uNear: uniforms.uNear,
      uFar: uniforms.uFar,
      uProjection: uniforms.uProjection,
      uSsrMaxDistance: uniforms.uSsrMaxDistance,
      uSsrThickness: uniforms.uSsrThickness,
      uSsrMinFresnel: uniforms.uSsrMinFresnel,
    },
    vertexShader: OCEAN_SSR_VERT,
    fragmentShader: OCEAN_SSR_FRAG,
    blending: THREE.NoBlending, // write the reflected colour + mask raw into the target
  });

  // Typed as the base Mesh so mesh.material can swap between the PBR and debug-flat
  // materials (setShading); the concrete `material` var is still used for tuning.
  const mesh: THREE.Mesh = new THREE.Mesh(geometry, material);
  // Also draw the surface on the SSR layer so the reflection pass can render it alone.
  mesh.layers.enable(SSR_LAYER);
  let normalMapOn = true; // debug toggle (setNormalMap); wireframe strips it regardless

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
      uniforms.uRippleOffset.value.copy(detailNormals.offset); // keep reflection distortion in sync
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
      seaFolder.add(globals, "amplitude", 0, 5, 0.01).name("wave height").onChange(rebuild);
      seaFolder
        .add(globals, "wavelength", 0.25, 3, 0.01)
        .name("wavelength")
        .onChange(rebuild);
      seaFolder
        .add(globals, "steepness", 0, 1.5, 0.01)
        .name("steepness")
        .onChange(rebuild);

      const detail = { strength: material.normalScale.x, ripple: rippleMeters };
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
        .add(detail, "ripple", 2, 40, 0.5)
        .name("ripple size (m)")
        .onChange(() => {
          rippleMeters = detail.ripple;
          applyRipple();
        });

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
      reflFolder
        .add(uniforms.uReflectDistort, "value", 0, 0.15, 0.005)
        .name("ripple blur");
    },
    setShading: (mode) => {
      if (mode === "flat") {
        mesh.material = basicMaterial;
        return;
      }
      mesh.material = material;
      material.wireframe = mode === "wireframe";
      // Wireframe always strips the map; otherwise honour the normal-map debug toggle.
      material.normalMap = mode === "wireframe" || !normalMapOn ? null : detailNormals;
      material.needsUpdate = true;
    },
    setNormalMap: (on) => {
      normalMapOn = on;
      if (!material.wireframe) {
        material.normalMap = on ? detailNormals : null;
        material.needsUpdate = true;
      }
    },
    setSsrSource: (texture) => {
      uniforms.uSsrReflection.value = texture;
    },
    renderSsr: (renderer, scene, camera, target) => {
      // Render the water alone (SSR layer) with the SSR-only material into the low-res
      // target, then restore. Reads the scene capture; the water shader samples the
      // result. Must run after the capture and before the main render.
      const prevMat = mesh.material;
      const prevLayerMask = camera.layers.mask;
      const prevTarget = renderer.getRenderTarget();
      mesh.material = ssrMaterial;
      camera.layers.set(SSR_LAYER);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget);
      camera.layers.mask = prevLayerMask;
      mesh.material = prevMat;
    },
    setGrid: (size, segments) => {
      planeSize = size;
      planeSegments = segments;
      mesh.geometry.dispose();
      mesh.geometry = buildGeometry();
      applyRipple(); // hold the ripple world-scale constant across plane-size changes
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      basicMaterial.dispose();
      ssrMaterial.dispose();
      detailNormals.dispose();
    },
  };
}
