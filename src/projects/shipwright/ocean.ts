import * as THREE from "three";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import { MAIN_PASS_LAYER, SSR_LAYER } from "./layers";
import { buildLodGrid, snapToLattice, type LodGridOptions } from "./ocean-lod";

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
// render-alignment one. These uniform-grid constants remain as the A/B BASELINE;
// the shipped default is the camera-following LOD grid below (ocean-lod.ts).
const PLANE_SEGMENTS = 1024;
// Camera-following LOD grid defaults (ocean-lod.ts; measured in docs/PERFORMANCE.md).
// The dense ~512 m patch keeps the shipped ~4.9 m quads under the camera; five
// doubling rings reach a ~16 km sea — past the ~5.4 km optical horizon from deck
// height (docs/ISLANDS.md) — for ~52k vertices vs ~1.05 M uniform at the same
// near density. The vertex bill is paid twice a frame (SSR pass + main pass),
// which is why this is the single largest GPU lever the project has measured.
const LOD_DEFAULTS: LodGridOptions = {
  baseQuad: PLANE_SIZE / 2048, // ≈4.88 m — the shipped uniform-grid density
  nearExtent: 512,
  extent: 16384,
};
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
  /** True once the ripple normal map has decoded. Before that the surface renders visibly
   *  differently, so an automated capture must wait on this rather than on a guessed timeout. */
  isReady: () => boolean;
  /** Advance the surface to `time` seconds. Call once per frame. */
  update: (time: number) => void;
  /** Water height + normal at world (x, z) and `time` — mirrors the shader. */
  sampleSurface: (x: number, z: number, time: number) => SurfaceSample;
  /** Water height ONLY at world (x, z) — identical to `sampleSurface().height`, but allocation-free
   *  (no normal Vector3). For hot per-voxel buoyancy sampling that needs only submersion depth. */
  sampleHeight: (x: number, z: number, time: number) => number;
  /** Forward Gerstner: where the particle at REST (x, z) rides to (orbital motion)
   *  + its normal. This is how a floating object rides the waves. */
  sampleParticle: (restX: number, restZ: number, time: number) => ParticleSample;
  /** Bind the scene colour + depth capture the water refracts/absorbs (call once). */
  setSceneCapture: (color: THREE.Texture, depth: THREE.Texture) => void;
  /** MERGED-main-pass occlusion (scene.ts routeMainPass): the present quad writes no depth, so the
   *  water discards its own behind-opaque fragments against the capture depth instead of depth-testing.
   *  Must be ON exactly when the merged pass is presenting, OFF on the classic path. */
  setMergedOcclusion: (on: boolean) => void;
  /** Debug: gate the whole see-through/depth/SSR composite (isolate its cost). */
  setWaterFx: (on: boolean) => void;
  /**
   * The downwelling irradiance just BELOW the surface, linear RGB in renderer units, split into its
   * beam and sky halves. The water body's displayed radiance is Gordon's `R∞ × E_d / π` — so this is
   * the light, and `R∞` (from the Jerlov type) is the reflectance. Derived by `lighting.ts`; it is no
   * longer a hand-tuned "veil brightness".
   *
   * Split because the shader attenuates the BEAM half per-fragment by the cloud shadow map, so a
   * cloud shadow darkens the water's body and not merely its glitter. `beam` is therefore the
   * CLEAR-sky beam — the cloud is applied once, in the shader.
   */
  setDownwelling: (beam: [number, number, number], sky: [number, number, number]) => void;
  /** Load a Jerlov water type by name (colour + clarity derive from its optics). */
  setWaterType: (name: string) => void;
  /** Set sea-state multipliers (wave height / steepness / wavelength); rebuilds the wave set. */
  setSea: (opts: { amplitude?: number; steepness?: number; wavelength?: number }) => void;
  /** Camera (near/far/projection) + drawing-buffer size for depth reconstruction,
   *  screen UVs, and the SSR ray-march projection. Call on setup + resize. */
  setViewParams: (camera: THREE.PerspectiveCamera, width: number, height: number) => void;
  /** Fill the passed "Sea" folder with wave-shape + water-optics sub-folders
   *  (Waves / Water body / Surface / Reflection). */
  buildGui: (folders: { sea: GUI }) => void;
  /** Debug: swap water shading to isolate GPU cost — the full production surface, an
   *  unlit flat fill (same wave geometry, trivial fragment → separates fill from the
   *  shading math), or wireframe (no fill). */
  setShading: (mode: ShadingMode) => void;
  /** Debug: actually remove the ripple normal map (fetch + per-pixel tangent-space
   *  perturbation), not just zero its strength — isolates normal-mapping cost. */
  setNormalMap: (on: boolean) => void;
  /** Bind the low-res SSR pass output texture the water shader samples (call once). */
  setSsrSource: (texture: THREE.Texture) => void;
  /** Enable/disable SSR (the main shader falls back to the env-map sky when off). The uniform is the
   *  single source of truth: scene.ts reads `isSsrEnabled` to SKIP the low-res march pass entirely, so
   *  turning SSR off actually reclaims its cost rather than just hiding the (still-computed) result. */
  setSsrEnabled: (on: boolean) => void;
  isSsrEnabled: () => boolean;
  /** SSR Fresnel cutoff (`uSsrMinFresnel`, default 0.05): the raw geometric Fresnel below which the
   *  low-res march discards a pixel (returns transparent) BEFORE marching — so raising it culls the
   *  near-head-on pixels the march is cheapest to skip and hardest to see, trading grazing SSR for
   *  cost. The lever for the worst-case (grazing) frame + the SSR spikes (E5). */
  setSsrMinFresnel: (value: number) => void;
  /** SSR march steps (E4): the per-pixel loop of DEPENDENT depth-buffer fetches, which is the most
   *  expensive single thing on a fetch-starved iGPU. Clamped to the GLSL's compile-time max. */
  setSsrSteps: (steps: number) => void;
  /** Newton iterations used to invert the Gerstner horizontal displacement in `sampleHeight` /
   *  `sampleSurface` (default 4). This is the innermost cost of the frame's #1 CPU system — buoyancy
   *  calls it per voxel AND per void cell AND per substep — so it is the lever the perf docs point at.
   *  0 = skip the inversion (evaluate the forward Gerstner straight at the world point).
   *
   *  A FIDELITY knob, not a free win: fewer iterations means the sampled waterline drifts from the
   *  rendered one, so the float feel must be judged before shipping a lower value. Exposed for the
   *  benchmark to price the trade. */
  setSampleIterations: (iterations: number) => void;
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
   *  count scale together rather than the grid getting finer as the sea shrinks.
   *  This is the UNIFORM-grid path (lod-ceiling.mjs sweeps it); calling it
   *  disables the camera-following LOD grid. */
  setGrid: (size: number, segments: number) => void;
  /** Camera-following LOD grid (default ON): a dense near patch + concentric rings
   *  of doubling quad size, one welded mesh (ocean-lod.ts). Off = the uniform grid. */
  setLodEnabled: (on: boolean) => void;
  isLodEnabled: () => boolean;
  /** Rebuild the LOD grid with new parameters (near-patch quad/size, total extent). */
  setLodParams: (opts: Partial<LodGridOptions>) => void;
  /** Per frame, before the pre-passes: snap the LOD mesh to the camera on the
   *  coarsest-quad lattice and hand the offset to the shader, which evaluates the
   *  waves in WORLD space — so every vertex lands on a fixed world lattice and the
   *  follow is invisible (no swimming, no pop). No-op when the LOD grid is off. */
  followCamera: (camera: THREE.Camera) => void;
  /** The current LOD grid's real numbers (for the GUI readout + tools). */
  lodStats: () => {
    enabled: boolean;
    vertices: number;
    triangles: number;
    extent: number;
    nearExtent: number;
    levels: number;
  };
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

// --- Water optics ----------------------------------------------------------
// The water's look DERIVES from three inherent optical properties (per metre), not a painted
// colour. Two set how far you see; the third sets the water's own colour:
//   absorption a — photons removed. Pure water absorbs red heavily, blue least (→ blue ocean).
//     Coastal water adds CDOM ("yellow substance") that absorbs BLUE, so a_B climbs above a_G
//     and GREEN becomes the clear window (→ the Baltic green). Note a_B > a_G for coastal.
//   scattering b — photons redirected. Particulate (coastal) scattering is large and roughly
//     spectrally FLAT (grey), and it DOMINATES real coastal beam attenuation. Under-setting
//     this was why the old model was too clear.
//   backscatter fraction B — the SMALL slice of scattering (~0.5–3%) that returns toward the
//     eye. Only this lights the water body; counting all of b overstates it 10–50×.
// From these:  extinction c = a + b (how fast a submerged image fades along the SLANT path);
//   deep colour = b_b/(a + b_b) · light,  b_b = B·b  (Gordon's semi-infinite reflectance).
// So clear ocean = low grey b + tiny B → dark blue, see ~40 m; turbid coastal = high grey b +
// CDOM blue-absorption + larger B → bright green veil, see a couple of metres. Same equations,
// and any seabed behind the water is tinted by the same terms for free. Magnitudes are
// physically shaped, then dialled against the measuring pole (measuring-pole.ts).
interface WaterType {
  name: string;
  absorption: [number, number, number]; // a per channel (R, G, B), 1/m — pure-water red tail + CDOM in blue
  scattering: [number, number, number]; // b per channel (R, G, B), 1/m — ~grey (flat) for particles
  backscatter: number; // fraction of b that returns to the eye (b_b = B·b); ~0.005 clear → ~0.035 turbid
}

const WATER_TYPES: WaterType[] = [
  // Jerlov's real water types — oceanic I–III and coastal 1/3/5/7/9 (his classification skips
  // the even coastal numbers). Approx straight-down (Secchi) visibility noted; scattering is
  // grey, absorption is pure-water (oceanic) shading to CDOM blue-absorption (coastal).
  { name: "Oceanic I", absorption: [0.4, 0.06, 0.015], scattering: [0.06, 0.06, 0.06], backscatter: 0.005 }, // ~40 m, clearest tropical blue
  { name: "Oceanic II", absorption: [0.42, 0.07, 0.03], scattering: [0.12, 0.12, 0.12], backscatter: 0.007 }, // ~20 m
  { name: "Oceanic III", absorption: [0.45, 0.09, 0.06], scattering: [0.24, 0.24, 0.24], backscatter: 0.01 }, // ~10 m, temperate
  { name: "Coastal 1", absorption: [0.45, 0.12, 0.16], scattering: [0.4, 0.4, 0.4], backscatter: 0.014 }, // ~6 m — CDOM begins (a_B > a_G)
  { name: "Coastal 3", absorption: [0.45, 0.18, 0.3], scattering: [0.57, 0.57, 0.57], backscatter: 0.018 }, // ~4 m
  { name: "Coastal 5", absorption: [0.45, 0.25, 0.55], scattering: [0.75, 0.75, 0.75], backscatter: 0.024 }, // ~3 m green — Baltic / Gulf of Finland
  { name: "Coastal 7", absorption: [0.5, 0.4, 0.85], scattering: [2.1, 2.1, 2.1], backscatter: 0.03 }, // ~1.5 m
  { name: "Coastal 9", absorption: [0.6, 0.65, 1.3], scattering: [4.6, 4.6, 4.6], backscatter: 0.035 }, // <1 m, harbour / river mouth
];
// Default is Coastal 5 — the turbid green of the Baltic off Helsinki, the "regular day out
// at sea" this archipelago game evokes; the clear Oceanic types are for tropical spots.
const DEFAULT_WATER_TYPE = "Coastal 5";

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
// Camera-follow offset (m): the LOD mesh translates with the camera, so the vertex
// shaders add the mesh's world xz back before evaluating the waves — the wave field
// must be sampled in WORLD space or the sea would ride along with the viewer. Zero
// whenever the LOD grid is off (the uniform mesh stays fixed at the origin).
uniform vec2 uWorldOffset;

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
  // Evaluate the waves at the WORLD position: gerstner() returns a displaced
  // POSITION, so subtract the camera-follow offset back out afterwards — the
  // modelViewMatrix re-adds the mesh translation. (With the LOD grid off the
  // offset is zero and this is the old origin-anchored evaluation.)
  vec2 gWorldXz = position.xz + uWorldOffset;
  gerstner(gWorldXz, gDisplaced, gNormal);
  gDisplaced.xz -= uWorldOffset;
  vec3 objectNormal = gNormal;
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif
  // The mesh is world-aligned (rotation baked, translation follow-only), so the
  // Gerstner object normal is the world normal — handed to the fragment shader to
  // wobble the refraction with (its xz is 0 on flat water → no distortion, and
  // grows with the waves).
  vWorldNormal = gNormal;
  // World-space ripple UV (tiling + scroll) — world-anchored so the ripples stay
  // put as the LOD mesh follows the camera. Also the UV the normal map itself is
  // sampled at (see the normal_fragment_* patches in onBeforeCompile).
  vRippleUv = gWorldXz / uRippleMeters + uRippleOffset;
`;

// Vertex displacement ONLY (no normal), for the debug unlit MeshBasicMaterial. Same
// Gerstner wave geometry as the real surface, so a flat-vs-PBR FPS comparison changes
// only the fragment work (shading), not the silhouette or how much screen is covered.
const OCEAN_BEGIN_FLAT = /* glsl */ `
  vec3 gDisplaced;
  vec3 gFlatNormal;
  vec2 gWorldXz = position.xz + uWorldOffset;
  gerstner(gWorldXz, gDisplaced, gFlatNormal);
  gDisplaced.xz -= uWorldOffset;
  vec3 transformed = gDisplaced;
`;

// Fragment-side declarations + helpers for the refraction / depth / SSR composite.
//
// The march count is a UNIFORM (`uSsrSteps`, default SSR_STEPS) with a compile-time MAX bound, so it
// can be swept at runtime (E4) instead of rebuilt per value. GLSL forbids a uniform loop *bound*, but
// a uniform `break` is legal — and because the branch is warp-coherent (every pixel breaks at the same
// i) it is a faithful cost proxy for a baked constant: the trend matches, with only a small fixed
// offset on the absolute ms. Bake the chosen value here once it's picked, to confirm the final number.
const SSR_STEPS_MAX = 48; // the loop's compile-time bound (the old pre-trim count — the useful ceiling)
const SSR_STEPS = 20; // DEFAULT linear march samples — trimmed from 48 to shave the camera-rotation
// cost spikes at the eye-level grazing view (open-water rays run the full count on a sky-miss).
// See docs/PERFORMANCE.md.
const SSR_REFINE = 5; // binary-search refinement steps after a hit
// Two GLSL helpers, split so each shader pulls in only what it uses. The water fragment
// includes OCEAN_DEPTH_FUNC alone (its refraction reads oceanEyeDist); the dedicated SSR
// pass includes both (oceanSsr calls oceanEyeDist). The including shader must declare the
// uniforms these reference — uNear, uFar for the depth helper; plus uProjection,
// uSceneColor, uSceneDepth, uSsrMaxDistance, uSsrThickness for the SSR march.
const OCEAN_DEPTH_FUNC = /* glsl */ `
// Perspective depth [0,1] → positive eye-space distance (metres).
float oceanEyeDist(float depth) {
  float zndc = depth * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - zndc * (uFar - uNear));
}
`;

// Screen-space reflection — used ONLY by the dedicated low-res SSR pass, not the water
// fragment (which just samples that pass's output). Calls oceanEyeDist, so any shader
// including this must also include OCEAN_DEPTH_FUNC.
const OCEAN_SSR_FUNC = /* glsl */ `
// Screen-space reflection. March the reflected ray in VIEW space, projecting each
// step to screen to read the scene depth; a hit is where the ray passes just behind
// the stored surface. Returns reflected scene colour in .rgb and a confidence in .a
// (0 = miss → caller falls back to the env-map sky reflection). This reflects
// dynamic geometry (the cube, later ships/islands) correctly on the displaced
// surface, because it rides the real per-pixel normal.
vec4 oceanSsr(vec3 viewPos, vec3 viewNormal) {
  vec3 incident = normalize(viewPos);
  vec3 dir = reflect(incident, viewNormal);
  // Stride covers the SAME max distance in fewer/more samples, so uSsrSteps trades march RESOLUTION
  // for cost — exactly what baking a smaller constant did.
  float stepSize = uSsrMaxDistance / uSsrSteps;
  vec3 rayPos = viewPos;
  vec2 hitUv = vec2(0.0);
  bool hit = false;
  for (int i = 0; i < ${SSR_STEPS_MAX}; i++) {
    if (float(i) >= uSsrSteps) break; // uniform break — see SSR_STEPS_MAX
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
uniform bool uMergedOcclusion;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uReflectWaveStrength; // wave-slope smear of the reflection (see the SSR composite)
uniform vec3 uAbsorption;
uniform vec3 uScattering;
uniform vec3 uBackscatter;
uniform vec3 uDownwellingBeam; // E_beam / PI, CLEAR sky: the shader applies the cloud shadow itself
uniform vec3 uDownwellingSky;  // E_sky / PI
uniform bool uSsrEnabled;
uniform float uReflectionStrength;
uniform float uReflectMin;
uniform float uSsrMaxDistance; // for the distance fade that kills the SSR horizon seam
uniform sampler2D uSsrReflection; // the low-res SSR pass output this shader samples
uniform sampler2D uReflectRipple; // detail normal map, reused to distort the reflection
uniform float uReflectDistort;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vRippleUv;
${OCEAN_DEPTH_FUNC}
`;

// Occlusion for the MERGED main pass (scene.ts routeMainPass), injected at the very TOP of the
// fragment so an occluded pixel discards before any of the PBR/composite work runs.
//
// In the merged pass the present quad is a pure colour blit — it writes NO depth (writing gl_FragDepth
// from a fullscreen quad disabled early-z and forced per-sample writes into the multisampled
// backbuffer; measured, it cost most of what merging saved — see present-pass.ts). So there is nothing
// in the depth buffer for the water to depth-test against, and the classic test's job moves HERE: the
// shader already knows the scene's depth (it samples the capture for refraction), so a fragment whose
// scene depth is NEARER than the water surface is behind land/hull and discards itself. The classic
// path keeps the real depth test and `uMergedOcclusion` stays false.
//
// (The flat/wireframe debug materials skip this: they are open-water cost probes, and with the merged
// pass on they will draw over an island — a debug shading mode being wrong about occlusion is fine.)
const OCEAN_FRAG_OCCLUSION = /* glsl */ `
  if (uMergedOcclusion) {
    vec2 occlUv = gl_FragCoord.xy / uResolution;
    if (oceanEyeDist(texture2D(uSceneDepth, occlUv).x) < vViewPosition.z) discard;
  }
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
  // Same world-space evaluation as OCEAN_BEGINNORMAL — the SSR pass renders the
  // same camera-following mesh, so its surface must match the visible one exactly.
  vec2 gWorldXz = position.xz + uWorldOffset;
  gerstner(gWorldXz, gDisplaced, gNormal);
  gDisplaced.xz -= uWorldOffset;
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
uniform float uSsrSteps;
varying vec3 vSsrViewPos;
varying vec3 vSsrViewNormal;
${OCEAN_DEPTH_FUNC}
${OCEAN_SSR_FUNC}
void main() {
  vec3 n = normalize(vSsrViewNormal);
  // Same Fresnel cutoff the inline march used — skip where the reflection is invisible.
  float fresnelGeo = pow(1.0 - clamp(dot(normalize(-vSsrViewPos), n), 0.0, 1.0), 5.0);
  if (fresnelGeo <= uSsrMinFresnel) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = oceanSsr(vSsrViewPos, n);
}
`;

// Injected BEFORE <tonemapping_fragment>, i.e. in LINEAR HDR. (Tier-2 change; the reasoning is in
// docs/LIGHTING.md.)
//
// The old comment here — and CLAUDE.md — asserted that "three applies tone mapping in the material
// regardless of render target", so the captured scene came back tone-mapped and the composite had to
// match that space. THAT IS NOT TRUE of this version of three, and it is checkable:
// `WebGLPrograms.getParameters` sets `toneMapping = NoToneMapping` unless
// `currentRenderTarget === null`. The scene capture is a render target, so it was ALWAYS linear HDR,
// and the old code was mixing a linear capture into an already-tone-mapped base — a real bug that
// happened to look plausible because both live near [0,1] at the old exposure.
//
// Compositing before the tonemap fixes that, and buys three things:
//   * the veil becomes a real downwelling irradiance instead of a display-space fudge;
//   * bright warm highlights (the sun's glitter road) survive into the tonemap as HDR, so they can
//     roll off with their hue instead of clipping flat;
//   * HDR bloom becomes possible at all — it needs everything linear until one tonemap at the end.
// With bloom enabled the whole main pass renders into a HalfFloat target, so `tonemapping_fragment`
// is a no-op here and the composite is linear all the way to the final OutputPass. Both paths agree.
//
// See-through: sample the scene behind the water STRAIGHT through, at this fragment's screen UV.
// We deliberately do NOT apply a lateral screen-space refraction offset. A UV offset (by the
// wave normal, or even a Snell-correct refracted-ray direction) shears the submerged silhouette
// of a discrete object that straddles the waterline: its above-water half samples straight, its
// underwater half samples an offset UV, so the two halves detach — the buoy's submerged part
// visibly slides/tears on a wave face (confirmed via A/B). Screen-space refraction of discrete
// straddling objects is fundamentally approximate — there is no cheap correct offset — and the
// default turbid water (~3 m visibility) hides refraction anyway, with no continuous see-through
// background (seabed/shallows) shipped yet to benefit. So we drop it. Revisit a seabed-aware
// offset if/when shallow water over a seabed lands (see docs/FIDELITY.md).
// Body: Beer–Lambert with in-scattering — both the clarity (extinction a+b) and the deep
// colour (albedo b/c) DERIVE from the water type's absorption + scattering (WaterType table).
// Fresnel blend: look down → see into the water; grazing → keep the reflective/lit
// surface gl_FragColor already holds (sun specular + env sky reflection).
const OCEAN_FRAG_WATER = /* glsl */ `
  if (uWaterFx) {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float waterDist = vViewPosition.z;

    float behindDist = oceanEyeDist(texture2D(uSceneDepth, screenUv).x);
    vec3 refracted = texture2D(uSceneColor, screenUv).rgb;

    float thickness = max(behindDist - waterDist, 0.0);
    // Extinction c = a + b (absorption + TOTAL scattering) fades the see-through image over
    // the slant path. The veil the column fills toward uses BACKSCATTER only — most scatter
    // is forward, so b_b = B·b is a small slice — via Gordon's semi-infinite reflectance
    // R∞ = b_b/(a + b_b). Dark for clean water (tiny B), bright green for turbid. Any seabed
    // behind the water is tinted by these same terms for free.
    vec3 extinction = uAbsorption + uScattering;
    vec3 transmit = exp(-extinction * thickness);
    // Gordon's semi-infinite reflectance R_inf = b_b/(a + b_b), lit by the real downwelling radiance
    // just under the surface. Both halves are now physics: the water's optics were already, and the
    // light finally is too.
    vec3 rInf = uBackscatter / max(uAbsorption + uBackscatter, vec3(1e-4));
    // The sea is a material like any other: the cloud above it dims the beam reaching it. Without
    // this the water body stays as bright under a cumulus shadow as in full sun, and the only thing a
    // passing cloud takes away is the glitter — which is why dappled light was invisible on water.
    // shipwrightCloudTransmittance is the project's ONE global lighting chunk (sky.ts), reached the
    // same way every lit material reaches it. Its argument is the view-space position, exactly as
    // three's lights_fragment_begin passes it. (No backticks in GLSL -- it is a template literal.)
    vec3 downwelling = uDownwellingSky + uDownwellingBeam * shipwrightCloudTransmittance(-vViewPosition);
    vec3 deep = rInf * downwelling;
    vec3 body = refracted * transmit + deep * (1.0 - transmit);

    // Geometric Fresnel (0 head-on → 1 grazing). uReflectMin lifts the head-on
    // reflectivity above water's physical ~2% to make the sea read as more
    // reflective (a sky sheen that also veils shallow see-through). The SSR gate
    // uses the RAW geometric term so raising uReflectMin doesn't force the march
    // onto every pixel (which would wreck the perf win).
    float vdotn = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
    float fresnelGeo = pow(1.0 - vdotn, 5.0);
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
      vec2 ssrUv = screenUv + vWorldNormal.xz * uReflectWaveStrength + ripple * uReflectDistort;
      vec4 ssr = texture2D(uSsrReflection, ssrUv);
      // SSR degenerates in two places, both false-hitting the dark below-horizon sky (a black seam
      // at the horizon AND black edges on grazing wave-crest faces at a low camera; confirmed — SSR
      // off removes it, and the env-map sky reflection is correct there). Fade it out by BOTH this
      // fragment's distance (far / horizon water) and its grazing angle (near crest faces viewed
      // edge-on), so those defer to the env sky while near, front-facing water (buoys) keeps SSR.
      // Gated here, not in the SSR pass, because the ripple/normal offset above resamples a nearer,
      // un-faded texel and defeats a pass-side fade.
      float ssrFade = (1.0 - smoothstep(uSsrMaxDistance * 2.0, uSsrMaxDistance * 4.0, waterDist))
                    * smoothstep(0.05, 0.2, vdotn);
      reflective = mix(reflective, ssr.rgb, ssr.a * uReflectionStrength * ssrFade);
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
    // See-through + depth absorption. The scene colour + depth textures (everything but the
    // water) are bound by scene.ts from the shared capture; the shader reads them straight-
    // through (no lateral refraction offset — see OCEAN_FRAG_WATER) to see behind the water.
    // Beer–Lambert absorption tints the water column and fades submerged objects with depth.
    uWaterFx: { value: true }, // debug: gate the whole see-through/depth/SSR composite
    // Merged main pass only (scene.ts routeMainPass → setMergedOcclusion): the water discards its own
    // behind-opaque fragments against the capture depth, replacing the depth test the classic path got
    // from the framebuffer. See OCEAN_FRAG_OCCLUSION.
    uMergedOcclusion: { value: false },
    uSceneColor: { value: null as THREE.Texture | null },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 1 },
    uFar: { value: 20000 },

    // Per-channel inherent optical properties (1/m), loaded from the selected WaterType by
    // applyWaterType (see the WaterType block for the physics). uAbsorption + uScattering set
    // clarity (extinction); uBackscatter (= B·b, the returning slice of scattering) sets the
    // veil colour via R∞ = b_b/(a+b_b). Defaults = Coastal 5 (Baltic off Helsinki).
    uAbsorption: { value: new THREE.Vector3(0.45, 0.25, 0.55) },
    uScattering: { value: new THREE.Vector3(0.75, 0.75, 0.75) },
    uBackscatter: { value: new THREE.Vector3(0.018, 0.018, 0.018) },
    // The radiance the water body is lit by: E_d / PI, where E_d is the downwelling irradiance just
    // below the surface — Fresnel-transmitted beam plus Fresnel-transmitted skylight. DERIVED per
    // frame by `lighting.ts` (see `setDownwelling`), colour and all, which is why `veilForSun` and
    // the fixed cool-neutral `uWaterLight` tint both ceased to exist. Clarity is untouched by this:
    // that is the extinction term. Kept apart so the beam can be cloud-shadowed per fragment.
    uDownwellingBeam: { value: new THREE.Vector3(0, 0, 0) },
    uDownwellingSky: { value: new THREE.Vector3(0, 0, 0) },
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
    uSsrSteps: { value: SSR_STEPS }, // runtime march count (E4); bounded by SSR_STEPS_MAX in the GLSL

    // Output of the low-res SSR pass (bound by scene.ts via setSsrSource); the water
    // shader samples this instead of marching inline.
    uSsrReflection: { value: null as THREE.Texture | null },
    // Ripple distortion of the reflection, applied at FULL res when sampling the low-res
    // SSR texture — restores the fine normal-map blur the smooth pass lacks AND masks its
    // low-res blockiness. Reuses the detail normal map (bound below); uRippleMeters +
    // uRippleOffset reproduce its world-space tiling + scroll (see OCEAN_BEGINNORMAL).
    uReflectRipple: { value: null as THREE.Texture | null },
    // Smear the sampled reflection by the analytic wave slope (world normal xz) — the coarse-swell
    // companion to uReflectDistort's fine ripple smear, so the reflection scatters with the waves.
    uReflectWaveStrength: { value: 0.04 },
    uReflectDistort: { value: 0.03 },
    uRippleMeters: { value: DETAIL_RIPPLE_METERS },
    uRippleOffset: { value: new THREE.Vector2(0, 0) },
    // Camera-follow offset for the LOD grid — see the OCEAN_PARS declaration.
    // Written per frame by followCamera; stays (0,0) on the uniform grid.
    uWorldOffset: { value: new THREE.Vector2(0, 0) },
  };

  // Load a water type's optical coefficients into the uniforms. Colour + clarity derive
  // in the shader — this sets no colour directly. Mutates the Vector3s in place so the
  // shader and any bound GUI controllers see the change without a recompile.
  const applyWaterType = (type: WaterType) => {
    uniforms.uAbsorption.value.set(...type.absorption);
    uniforms.uScattering.value.set(...type.scattering);
    // Backscatter = the returning fraction B of total scattering (b_b = B·b), per channel.
    const [br, bg, bb] = type.scattering;
    uniforms.uBackscatter.value.set(br, bg, bb).multiplyScalar(type.backscatter);
  };
  const initialWaterType = WATER_TYPES.find((t) => t.name === DEFAULT_WATER_TYPE);
  if (initialWaterType) applyWaterType(initialWaterType);

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

  // --- Camera-following LOD grid (default ON) --------------------------------
  // One welded mesh: dense near patch + rings of doubling quad size (ocean-lod.ts).
  // followCamera snaps the mesh to the camera on the coarsest-quad lattice, so
  // every vertex of every ring lands on a fixed set of world positions — the
  // sampled wave field is bitwise-stable across snaps (no swimming, no pop).
  let lodEnabled = true;
  const lodParams: LodGridOptions = { ...LOD_DEFAULTS };
  let lodCoarsestQuad = LOD_DEFAULTS.baseQuad;
  let lodInfo = { vertices: 0, triangles: 0, extent: 0, nearExtent: 0, levels: 0 };
  const buildLodGeometry = () => {
    const grid = buildLodGrid(lodParams);
    lodCoarsestQuad = grid.coarsestQuad;
    lodInfo = {
      vertices: grid.vertexCount,
      triangles: grid.triangleCount,
      extent: grid.extent,
      nearExtent: grid.nearExtent,
      levels: grid.levels,
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(grid.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(grid.index, 1));
    return geo;
  };
  const geometry = buildLodGeometry(); // LOD is the default; setLodEnabled(false) swaps to the uniform grid

  // The ripple map loads asynchronously, and the water renders visibly differently before it
  // arrives. Anything that wants a settled frame (the screenshot suite) must WAIT ON THIS, not on a
  // guessed timeout.
  let detailNormalsLoaded = false;
  const detailNormals = new THREE.TextureLoader().load(DETAIL_NORMALS_URL, () => {
    detailNormalsLoaded = true;
  });
  detailNormals.wrapS = THREE.RepeatWrapping;
  detailNormals.wrapT = THREE.RepeatWrapping;
  // Max anisotropy: the ripple normal map is sampled at a hard grazing angle across the far
  // water, where low anisotropy minifies it into faint diagonal streaks (the scroll direction
  // aliasing). 16× (clamped to the GPU's max) resolves the grazing minification. NB the LOD
  // grid shipped and did NOT change this (verified pixel-identical far glitter) — the residual
  // moiré is per-pixel map minification; the remaining fix is dual-scale normals or a distance
  // fade of ripple strength (docs/FIDELITY.md).
  detailNormals.anisotropy = 16;
  uniforms.uReflectRipple.value = detailNormals; // reuse the ripple map for reflection distortion
  let rippleMeters = DETAIL_RIPPLE_METERS;
  const applyRipple = () => {
    // The ripple mapping lives entirely in the shader (vRippleUv = world.xz /
    // uRippleMeters + scroll) — WORLD-anchored, not geometry-uv based, so the
    // camera-following LOD mesh doesn't carry the ripples with it. The texture's
    // own repeat/offset transform is deliberately unused (see the
    // normal_fragment_* patches in onBeforeCompile).
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
    roughness: 0.4,
    metalness: 0,
    normalMap: detailNormals,
  });
  // Fine-ripple (capillary chop) strength scales with the sea state: a glassy calm is a
  // near-mirror (WMO-0), while a building wind sea grows fine texture. `baseRippleStrength`
  // is the user-tunable base (the "ripples" GUI slider); `applyRippleStrength` multiplies it
  // by a factor derived from the wave-height multiplier so calm eases toward flat. Driven
  // from `setSea` and the GUI so both stay in lock-step on one uniform (no two-writer clash).
  let baseRippleStrength = 0.35;
  const applyRippleStrength = () => {
    const seaFactor = THREE.MathUtils.clamp(globals.amplitude, 0.08, 1.5);
    material.normalScale.set(baseRippleStrength * seaFactor, baseRippleStrength * seaFactor);
  };
  applyRippleStrength();
  // No per-material env scale. The IBL from `scene.environment` is the physically-scaled sky dome,
  // at `scene.environmentIntensity = 1`, exactly like every other material in the project. That is
  // the whole thesis: one lighting model, no per-material exceptions.
  // The fine-ripple normal map must be sampled in WORLD space: the stock
  // vNormalMapUv is geometry-uv based (mesh-local), so on the camera-following
  // LOD mesh the ripples would ride along and jump at every snap. vRippleUv is
  // the same tiling + scroll mapping, world-anchored — swap it into three's
  // resolved chunks: the tangent frame (normal_fragment_begin) AND the sample
  // (normal_fragment_maps). Splicing the installed version's own chunk text
  // keeps this robust to chunk-content changes, and it means the LOD geometry
  // needs no uv attribute at all. The #ifdef guards travel with the text, so
  // the no-normal-map modes (wireframe / setNormalMap(false)) stay correct.
  const worldAnchoredNormalChunk = (chunk: string) =>
    chunk.replaceAll("vNormalMapUv", "vRippleUv");
  material.onBeforeCompile = (shader) => {
    patchGerstnerVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${OCEAN_FRAG_PARS}`)
      // First statement of main(): the merged-pass occlusion discard, before any shading work.
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>\n${OCEAN_FRAG_OCCLUSION}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        worldAnchoredNormalChunk(THREE.ShaderChunk.normal_fragment_begin),
      )
      .replace(
        "#include <normal_fragment_maps>",
        worldAnchoredNormalChunk(THREE.ShaderChunk.normal_fragment_maps),
      )
      // BEFORE the tonemap: the composite runs in linear HDR (see OCEAN_FRAG_WATER).
      .replace(
        "#include <tonemapping_fragment>",
        `${OCEAN_FRAG_WATER}\n\t#include <tonemapping_fragment>`,
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
      uSsrSteps: uniforms.uSsrSteps,
      // Shared BY REFERENCE with the main material, but a ShaderMaterial only
      // uploads the keys listed here — forget one and the SSR surface silently
      // diverges from the visible water.
      uWorldOffset: uniforms.uWorldOffset,
    },
    vertexShader: OCEAN_SSR_VERT,
    fragmentShader: OCEAN_SSR_FRAG,
    blending: THREE.NoBlending, // write the reflected colour + mask raw into the target
  });

  // Typed as the base Mesh so mesh.material can swap between the PBR and debug-flat
  // materials (setShading); the concrete `material` var is still used for tuning.
  const mesh: THREE.Mesh = new THREE.Mesh(geometry, material);
  // Besides layer 0 (the world), the surface is also drawn on the SSR layer (so the reflection pass
  // can render it alone) and the main-pass layer (so the merged main render — quad + water only —
  // still sees it; see layers.ts).
  mesh.layers.enable(SSR_LAYER);
  mesh.layers.enable(MAIN_PASS_LAYER);
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

  // Invert the horizontal displacement with Newton's method: find grid point g such that
  // g + horizontalOffset(g) = the world (x, z), using the offset's Jacobian for quadratic
  // convergence (a few steps nail it even at high steepness). Writes the result into the
  // module-scope `invGrid` scratch (consumed immediately by the caller — no allocation).
  const invGrid = { x: 0, z: 0 };
  // Runtime-settable (benchmark E-lever): the iteration count is the inner cost of the buoyancy hot
  // loop. `sampleIterations = 0` degenerates to "evaluate the forward Gerstner at the world point" —
  // the cheapest possible height sample, and the approximation the perf docs propose testing.
  let sampleIterations = SAMPLE_ITERATIONS;
  const invertToGrid = (x: number, z: number, time: number): void => {
    const speed = uniforms.uSpeed.value;
    let gx = x;
    let gz = z;
    for (let iter = 0; iter < sampleIterations; iter++) {
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
    invGrid.x = gx;
    invGrid.z = gz;
  };

  // Height + normal at a WORLD (x, z). Gerstner also displaces horizontally, so the surface point
  // above (x, z) came from a *different* grid point — invert that (invertToGrid) then evaluate there.
  const sampleSurface = (x: number, z: number, time: number): SurfaceSample => {
    invertToGrid(x, z, time);
    const { height, nx, ny, nz } = evalGrid(invGrid.x, invGrid.z, time);
    return { height, normal: new THREE.Vector3(nx, ny, nz).normalize() };
  };

  // Height ONLY at a WORLD (x, z) — the same value as sampleSurface().height but without allocating
  // the surface-normal Vector3. The buoyancy hot loop (physics.ts) needs only submersion depth and
  // calls this per voxel per substep, so skipping the discarded normal cuts real per-frame GC churn.
  const sampleHeight = (x: number, z: number, time: number): number => {
    invertToGrid(x, z, time);
    return evalGrid(invGrid.x, invGrid.z, time).height;
  };

  return {
    mesh,
    isReady: () => detailNormalsLoaded,
    update: (time) => {
      uniforms.uTime.value = time;
      // Scroll the ripple layers diagonally so the surface never looks static.
      // The scroll lives in the vRippleUv uniform — the texture's own transform
      // is unused now the map is sampled at the world-anchored UV (applyRipple).
      uniforms.uRippleOffset.value.set(time * 0.03, time * 0.015);
    },
    sampleSurface,
    sampleHeight,
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
    setMergedOcclusion: (on: boolean) => {
      uniforms.uMergedOcclusion.value = on;
    },
    setWaterFx: (on: boolean) => {
      uniforms.uWaterFx.value = on;
    },
    setDownwelling: (beam, sky) => {
      // Irradiance -> the Lambertian radiance Gordon's R_inf multiplies.
      uniforms.uDownwellingBeam.value.set(...beam).divideScalar(Math.PI);
      uniforms.uDownwellingSky.value.set(...sky).divideScalar(Math.PI);
    },
    setWaterType: (name: string) => {
      const type = WATER_TYPES.find((t) => t.name === name);
      if (type) applyWaterType(type);
    },
    setSea: (opts) => {
      if (opts.amplitude !== undefined) globals.amplitude = opts.amplitude;
      if (opts.steepness !== undefined) globals.steepness = opts.steepness;
      if (opts.wavelength !== undefined) globals.wavelength = opts.wavelength;
      rebuild();
      applyRippleStrength(); // ease fine ripple toward flat as the sea calms (glassy → mirror)
    },
    setViewParams: (camera: THREE.PerspectiveCamera, width: number, height: number) => {
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      uniforms.uResolution.value.set(width, height);
      uniforms.uProjection.value.copy(camera.projectionMatrix);
    },
    buildGui: ({ sea }) => {
      const waves = sea.addFolder("Waves");
      waves
        .add(globals, "amplitude", 0, 5, 0.01)
        .name("wave height")
        .onChange(() => {
          rebuild();
          applyRippleStrength(); // wave height also drives fine-ripple strength (calm → mirror)
        });
      waves
        .add(globals, "wavelength", 0.25, 3, 0.01)
        .name("wavelength")
        .onChange(rebuild);
      waves
        .add(globals, "steepness", 0, 1.5, 0.01)
        .name("steepness")
        .onChange(rebuild);

      // Water type is the primary colour/clarity control — a Jerlov type whose optics set
      // the colour — so it sits at the Sea level, always visible. The raw absorption/
      // scattering coefficients it loads live in a collapsed "Water body" folder below for
      // fine tuning.
      const tune: ReturnType<GUI["add"]>[] = [];
      const waterType = { type: DEFAULT_WATER_TYPE };
      sea
        .add(waterType, "type", WATER_TYPES.map((t) => t.name))
        .name("water type")
        .onChange((name: string) => {
          const type = WATER_TYPES.find((t) => t.name === name);
          if (type) applyWaterType(type);
          tune.forEach((c) => c.updateDisplay());
        });

      const bodyFolder = sea.addFolder("Water body");
      // These are the selected Jerlov type's measured optics (absorption + scattering, 1/m) and its
      // backscatter fraction — PHYSICAL CONSTANTS of the water, not tuning knobs. Shown READ-ONLY so
      // you can read off what a type loads, but the WATER TYPE dropdown above is the only control:
      // change the type, not the physics. (The downwelling light the body is lit by is likewise DERIVED
      // from the sun + sky in `lighting.ts` -> `setDownwelling`; change the light and the water follows.)
      const absorb = uniforms.uAbsorption.value;
      const scatter = uniforms.uScattering.value;
      const backscatter = uniforms.uBackscatter.value;
      tune.push(
        bodyFolder.add(absorb, "x", 0, 2, 0.005).name("absorb R").disable(),
        bodyFolder.add(absorb, "y", 0, 2, 0.005).name("absorb G").disable(),
        bodyFolder.add(absorb, "z", 0, 2, 0.005).name("absorb B").disable(),
        bodyFolder.add(scatter, "x", 0, 6, 0.01).name("scatter R").disable(),
        bodyFolder.add(scatter, "y", 0, 6, 0.01).name("scatter G").disable(),
        bodyFolder.add(scatter, "z", 0, 6, 0.01).name("scatter B").disable(),
        bodyFolder.add(backscatter, "x", 0, 0.2, 0.001).name("backscatter R").disable(),
        bodyFolder.add(backscatter, "y", 0, 0.2, 0.001).name("backscatter G").disable(),
        bodyFolder.add(backscatter, "z", 0, 0.2, 0.001).name("backscatter B").disable(),
      );
      bodyFolder.close();

      // Surface material + fine ripple detail — rarely touched once dialled, so collapsed.
      const detail = { strength: baseRippleStrength, ripple: rippleMeters };
      const surface = sea.addFolder("Surface");
      surface.addColor(material, "color");
      surface.add(material, "roughness", 0, 1, 0.01);
      surface.add(material, "metalness", 0, 1, 0.01);
      surface
        .add(detail, "strength", 0, 1, 0.01)
        .name("ripples")
        .onChange(() => {
          baseRippleStrength = detail.strength;
          applyRippleStrength(); // re-apply through the current sea-state factor
        });
      surface
        .add(detail, "ripple", 2, 40, 0.5)
        .name("ripple size (m)")
        .onChange(() => {
          rippleMeters = detail.ripple;
          applyRipple();
        });
      surface.close();

      const reflFolder = sea.addFolder("Reflection");
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
      reflFolder
        .add(uniforms.uReflectWaveStrength, "value", 0, 0.2, 0.002)
        .name("wave smear");
      reflFolder.close();
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
    setSsrEnabled: (on) => {
      uniforms.uSsrEnabled.value = on;
    },
    isSsrEnabled: () => uniforms.uSsrEnabled.value === true,
    setSsrMinFresnel: (value) => {
      uniforms.uSsrMinFresnel.value = value;
    },
    setSsrSteps: (steps) => {
      uniforms.uSsrSteps.value = Math.max(1, Math.min(SSR_STEPS_MAX, Math.round(steps)));
    },
    setSampleIterations: (iterations) => {
      sampleIterations = Math.max(0, Math.round(iterations));
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
      // Explicitly requesting the uniform grid switches the LOD grid off — the
      // two are mutually exclusive shapes of the one mesh. The follow offset must
      // go back to zero with it, or the fixed plane would sample shifted waves.
      lodEnabled = false;
      mesh.position.set(0, 0, 0);
      uniforms.uWorldOffset.value.set(0, 0);
      planeSize = size;
      planeSegments = segments;
      mesh.geometry.dispose();
      mesh.geometry = buildGeometry();
    },
    setLodEnabled: (on) => {
      if (on === lodEnabled) return;
      lodEnabled = on;
      mesh.geometry.dispose();
      if (on) {
        mesh.geometry = buildLodGeometry();
        // followCamera snaps into place on the next frame.
      } else {
        mesh.position.set(0, 0, 0);
        uniforms.uWorldOffset.value.set(0, 0);
        mesh.geometry = buildGeometry();
      }
    },
    isLodEnabled: () => lodEnabled,
    setLodParams: (opts) => {
      Object.assign(lodParams, opts);
      if (!lodEnabled) return; // picked up on the next setLodEnabled(true)
      mesh.geometry.dispose();
      mesh.geometry = buildLodGeometry();
    },
    followCamera: (camera) => {
      if (!lodEnabled) return;
      // Snap on the coarsest-quad lattice: every ring's quad size divides it, so
      // all vertices land back on the identical world lattice after any snap.
      const sx = snapToLattice(camera.position.x, lodCoarsestQuad);
      const sz = snapToLattice(camera.position.z, lodCoarsestQuad);
      mesh.position.set(sx, 0, sz);
      uniforms.uWorldOffset.value.set(sx, sz);
    },
    lodStats: () => ({ enabled: lodEnabled, ...lodInfo }),
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      basicMaterial.dispose();
      ssrMaterial.dispose();
      detailNormals.dispose();
    },
  };
}
