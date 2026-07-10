import * as THREE from "three";

/**
 * Standalone volumetric cloud pass — the clean-room successor to the flat 2-D deck and the
 * heightfield-relief spike.
 *
 * ## What this is and why it is separate
 *
 * It is a dome mesh with a raymarching `ShaderMaterial`, added to the scene and drawn OVER the sky,
 * NOT code inside the sky dome's fragment. That separation is deliberate:
 *
 *  - the sunset-revert plan (docs/SUNSET-JOURNEY.md) will replace the sky *rendering*, and a cloud
 *    pass baked into that shader would have to move with it. A standalone pass composites over
 *    whatever sky is underneath;
 *  - it is how sky-cloud-3d, SoT, and every modern engine structure clouds — a system, not sky code.
 *
 * ## The technique (clean-room, from public sources)
 *
 * A bounded raymarch, the textbook recipe (Schneider "Nubis", Häggström, Bruneton), whose parameters
 * we calibrated against sky-cloud-3d's demo but whose code is our own — no third-party shader or asset
 * is copied (its license is non-commercial; ours is clean regardless):
 *
 *  - march the view ray through the cloud slab `[base, base + thickness]` in `STEPS` steps;
 *  - at each sample, a density from our own value-noise fBm, shaped by a coverage threshold and a
 *    vertical profile (dense low-mid, wispy top), eroded by higher-frequency pseudo-3-D detail so it
 *    billows and overhangs instead of extruding a heightfield;
 *  - a short `LIGHT_STEPS` march toward the sun for self-shadowing (Beer–Lambert), so the sunlit rim
 *    lights and the core darkens — the cue that reads as "cloud", not "lit solid";
 *  - a Henyey–Greenstein phase on the view–sun angle for the forward silver lining.
 *
 * ## What is NOT here yet (the perf work, deferred on purpose)
 *
 * This renders per-frame, full-res, in the main view — the un-optimised cost, the one that maxes a GPU
 * in the reference demo. Making it shippable is the *next* project: low-res march + temporal reproject,
 * bake into the PMREM env for reflections + distant sky, keep only the hero region marching each frame.
 * This module exists first to answer "does the LOOK land?" — perf is measured, then earned, afterwards.
 *
 * The light coupling (cloud shadows on the sea, exposure) is likewise NOT wired yet: this is appearance
 * only. When it graduates, the density integrates to the same coverage/optical-depth the existing
 * shadow map and exposure read, preserving the "one model" property.
 */

export interface VolumetricCloudParams {
  /** Fraction of sky covered, 0–1 (raises the noise threshold). */
  coverage: number;
  /** Cloud-base altitude, metres. */
  base: number;
  /** Vertical extent of the slab, metres. Taller = more towering; a dial for the "inspired-by" storm. */
  thickness: number;
  /** Extinction per metre per unit density. Higher = darker/denser; the other storm dial. */
  absorption: number;
  /** Overall density multiplier. */
  density: number;
  /** Horizontal size of one cloud feature, metres. */
  featureSize: number;
  /** Wind velocity over the cloud plane, m/s. */
  wind: [number, number];
  /** Scales the sun's contribution into the dome's radiance units (tuning). */
  sunGain: number;
  /** Scales the ambient sky contribution. */
  ambientGain: number;
}

export const CUMULUS: VolumetricCloudParams = {
  coverage: 0.42,
  base: 1200,
  thickness: 550,
  absorption: 0.03,
  density: 1,
  featureSize: 700,
  wind: [7, 2],
  sunGain: 1,
  ambientGain: 0.7,
};

/** The "big dark clouds rolling in" mood, by the two dials Kyle spotted: taller + more absorbing. */
export const STORM: VolumetricCloudParams = {
  coverage: 0.7,
  base: 900,
  thickness: 1600,
  absorption: 0.06,
  density: 1.15,
  featureSize: 1100,
  wind: [11, 3],
  sunGain: 1,
  ambientGain: 0.5,
};

export interface CloudLight {
  /** Unit vector TOWARD the sun. */
  sunDirection: THREE.Vector3;
  /** Sun beam radiance-ish (linear HDR), e.g. the DirectionalLight's colour × intensity. */
  sunColor: THREE.Color;
  /** Ambient sky radiance the cloud scatters — the dome's overcast-zenith radiance. */
  skyColor: THREE.Color;
}

export interface VolumetricClouds {
  mesh: THREE.Mesh;
  /** Follow the sun/sky. Call from `daylight.onState`. */
  setLight(light: CloudLight): void;
  /** Advance wind drift. Call per frame with scene time in seconds. */
  setTime(seconds: number): void;
  setParams(patch: Partial<VolumetricCloudParams>): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w; // pin to the far plane, like the sky dome
}
`;

// NB: no backticks inside this GLSL — it is a template literal (the same trap sky.ts documents).
const FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldPosition;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uTime;
uniform float uCoverage;
uniform float uBase;
uniform float uThickness;
uniform float uAbsorption;
uniform float uDensity;
uniform float uFeatureScale; // 1 / featureSize
uniform vec2 uWind;          // m/s
uniform float uSunGain;
uniform float uAmbientGain;

const int STEPS = 28;
const int LIGHT_STEPS = 6;
const float MAX_DISTANCE = 14000.0;
const float PI = 3.141592653589793;

// --- our own value-noise fBm (clean-room; same shape as clouds.ts CLOUD_FIELD_GLSL, written fresh) ---
float vhash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + 13.1) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = vhash(i);
  float b = vhash(i + vec2(1.0, 0.0));
  float c = vhash(i + vec2(0.0, 1.0));
  float d = vhash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  float tot = 0.0;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    tot += amp;
    p = p * 2.0 + vec2(37.1, 17.3);
    amp *= 0.5;
  }
  return v / tot;
}

// Cloud density in [0,1] at a world point.
float density(vec3 p) {
  vec2 uv = (p.xz + uWind * uTime) * uFeatureScale;
  float shape = fbm(uv);
  // Coverage: higher coverage lowers the threshold the noise must clear.
  float cov = smoothstep(1.0 - uCoverage, 1.0 - uCoverage + 0.22, shape);
  if (cov <= 0.0) return 0.0;
  // Vertical profile: dense in the lower-middle, wispy at the top, roundish base.
  float h = clamp((p.y - uBase) / uThickness, 0.0, 1.0);
  float profile = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.55, 1.0, h));
  // Pseudo-3-D erosion: higher-frequency detail that varies with height carves billows/overhangs,
  // so this is a soft blob, not a single-valued heightfield surface.
  float ero = fbm(uv * 3.1 + vec2(p.y * 0.02, uTime * 0.05));
  float d = clamp(cov * profile - ero * 0.4, 0.0, 1.0);
  return d * uDensity;
}

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// Two-term: a forward lobe for the silver lining + a gentle back lobe. 4*pi normalises HG to mean 1.
float phase(float c) {
  return 4.0 * PI * mix(hg(c, 0.75), hg(c, -0.25), 0.4);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPosition - ro);
  if (rd.y < 0.02) discard;

  float tBase = (uBase - ro.y) / rd.y;
  float tTop = (uBase + uThickness - ro.y) / rd.y;
  if (tBase > MAX_DISTANCE) discard;
  tTop = min(tTop, MAX_DISTANCE);
  float dt = (tTop - tBase) / float(STEPS);

  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float ph = phase(dot(rd, uSunDirection));
  float lightStep = uThickness / float(LIGHT_STEPS);

  float T = 1.0;
  vec3 L = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float t = tBase + (float(i) + jitter) * dt;
    vec3 p = ro + rd * t;
    float d = density(p);
    if (d > 0.001) {
      // Self-shadow: march toward the sun and accumulate density in the way.
      float sunDepth = 0.0;
      for (int j = 1; j <= LIGHT_STEPS; j++) {
        sunDepth += density(p + uSunDirection * (lightStep * float(j)));
      }
      float sunT = exp(-uAbsorption * sunDepth * lightStep);
      vec3 scatter = uSunColor * uSunGain * sunT * ph + uSkyColor * uAmbientGain;
      float Ti = exp(-uAbsorption * d * dt);
      L += T * scatter * (1.0 - Ti);
      T *= Ti;
      if (T < 0.02) break;
    }
  }

  gl_FragColor = vec4(L, 1.0 - T);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createVolumetricClouds(params: VolumetricCloudParams = CUMULUS): VolumetricClouds {
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyColor: { value: new THREE.Color(0.2, 0.3, 0.45) },
    uTime: { value: 0 },
    uCoverage: { value: params.coverage },
    uBase: { value: params.base },
    uThickness: { value: params.thickness },
    uAbsorption: { value: params.absorption },
    uDensity: { value: params.density },
    uFeatureScale: { value: 1 / params.featureSize },
    uWind: { value: new THREE.Vector2(params.wind[0], params.wind[1]) },
    uSunGain: { value: params.sunGain },
    uAmbientGain: { value: params.ambientGain },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true, // so the ocean and terrain (nearer depth) occlude the far-pinned dome
    side: THREE.BackSide,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.scale.setScalar(9000);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3; // after the sky dome, before nothing that matters

  return {
    mesh,
    setLight(light) {
      uniforms.uSunDirection.value.copy(light.sunDirection);
      uniforms.uSunColor.value.copy(light.sunColor);
      uniforms.uSkyColor.value.copy(light.skyColor);
    },
    setTime(seconds) {
      uniforms.uTime.value = seconds;
    },
    setParams(patch) {
      if (patch.coverage !== undefined) uniforms.uCoverage.value = patch.coverage;
      if (patch.base !== undefined) uniforms.uBase.value = patch.base;
      if (patch.thickness !== undefined) uniforms.uThickness.value = patch.thickness;
      if (patch.absorption !== undefined) uniforms.uAbsorption.value = patch.absorption;
      if (patch.density !== undefined) uniforms.uDensity.value = patch.density;
      if (patch.featureSize !== undefined) uniforms.uFeatureScale.value = 1 / patch.featureSize;
      if (patch.wind !== undefined) uniforms.uWind.value.set(patch.wind[0], patch.wind[1]);
      if (patch.sunGain !== undefined) uniforms.uSunGain.value = patch.sunGain;
      if (patch.ambientGain !== undefined) uniforms.uAmbientGain.value = patch.ambientGain;
    },
    setEnabled(enabled) {
      mesh.visible = enabled;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
