import * as THREE from "three";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import {
  CLOUD_ASYMMETRY,
  CLOUD_FIELD_GLSL,
  CLOUD_GENERA,
  CLOUD_GENUS_NAMES,
  CLOUD_SHADOW_STEP_FEATURES,
  CLOUD_SHADOW_TAPS,
  CLOUD_VIEW_ASYMMETRY,
  DEFAULT_GENUS,
  cloudStateFromGenus,
  cloudThreshold,
  isCloudGenus,
  type CloudGenusName,
  type CloudState,
} from "./clouds";
import {
  DEFAULT_ADAPTATION_FLOOR_LUX,
  DEFAULT_EXPOSURE_KEY,
  DEFAULT_GROUND_ALBEDO,
  computeLighting,
  skyShapeElevation,
  sourceTints,
  sunSkyRatio,
  sunSkyRatioSunFacing,
  type LightingState,
} from "./lighting";
import { DEFAULT_SKY, OZONE_ZENITH_TAU, sunTerms, type Rgb, type SkyParams } from "./sky-model";

/**
 * The sky, and the light it casts. Owns everything that used to be scattered across `scene.ts`:
 * the dome, the sun, the PMREM bake, the shadow frustum, the cloud shadow map, and exposure.
 *
 * ## The one sanctioned way to touch every material
 *
 * Cloud shadows must multiply the sun's contribution on *every* lit surface. Patching each material
 * is exactly the mistake that made the islands and the buoys look photographed in different scenes.
 * So there is **one** override of three's `lights_fragment_begin` ShaderChunk (plus `lights_pars_begin`
 * for the declarations), installed once, and every `MeshStandardMaterial` / `Physical` / `Lambert` /
 * `Phong` in the project picks it up from that one place. See `installGlobalLighting`.
 *
 * It multiplies **all** directional lights, not "the sun" — so a moon, added later, is cloud-shadowed
 * for free, and nothing here assumes there is exactly one of them.
 *
 * ## What is NOT double-counted
 *
 * - The **sun disc** is drawn by the dome but excluded from the PMREM bake (`uShowSunDisc = 0` while
 *   baking), because the `DirectionalLight` already carries the beam. Baking it would light every
 *   surface twice.
 * - The **cloud beam attenuation** is applied per-fragment by the shadow map, so `sunLight.intensity`
 *   carries the *unattenuated* clear-sky beam. The CPU-side energy budget (exposure, the veil) uses
 *   the field's spatial mean instead — the same number the shadow map averages to, by construction.
 * - `hemiLight` is **gone**. It was a second sky on top of the PMREM sky. The half of it that was
 *   doing real work — bounce off the water and rock below the horizon — is now the dome's own
 *   `groundRadiance`, derived from the scene's total irradiance.
 */

const DEG = Math.PI / 180;

// --- The global lighting uniforms -------------------------------------------
// Module-level singletons, injected into EVERY material's program (see installGlobalLighting). One
// Shipwright scene exists at a time; a second mount rebinds these rather than allocating a parallel
// set.

/** 1×1 white, so a material compiled before the cloud shadow map exists reads "no cloud". A null
 *  sampler binds three's black `emptyTexture`, which would shadow the entire world. */
const makeWhitePixel = (): THREE.DataTexture => {
  const tex = new THREE.DataTexture(new Float32Array([1, 1, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
};

const LIGHTING_UNIFORMS = {
  uCloudShadowMap: { value: null as THREE.Texture | null },
  uCloudSunDirection: { value: new THREE.Vector3(0, 1, 0) },
  uCloudShadowAltitude: { value: 1200 },
  uCloudShadowOrigin: { value: new THREE.Vector2() },
  uCloudShadowScale: { value: 1 / 6000 },
  /** 0 disables the lookup entirely (clear sky, or a sun too low for the projection to mean much). */
  uCloudShadowStrength: { value: 0 },
  /** The field's spatial mean transmittance — what a fragment outside the map should see. */
  uCloudBeamMean: { value: 1 },
};

/** Declarations, prepended to the fragment-only `lights_pars_begin`. The helper takes the view
 *  position as a PARAMETER rather than reading `vViewPosition`, so it is safe to declare even in
 *  shaders (e.g. `ShadowMaterial`) that include this chunk without that varying. */
const LIGHTS_PARS_PREFIX = /* glsl */ `
uniform sampler2D uCloudShadowMap;
uniform vec3 uCloudSunDirection;
uniform float uCloudShadowAltitude;
uniform vec2 uCloudShadowOrigin;
uniform float uCloudShadowScale;
uniform float uCloudShadowStrength;
uniform float uCloudBeamMean;

// World position from the view position three already computed. three's fragment prefix always
// declares viewMatrix and cameraPosition, and viewMatrix's rotation is orthonormal, so its inverse
// rotation is just the transpose. (GLSL ES 3.00, which is what WebGL2 compiles to.)
vec3 shipwrightWorldFromView(vec3 viewPosition) {
  return cameraPosition + transpose(mat3(viewMatrix)) * viewPosition;
}

// Fraction of the direct beam that survives the cloud deck above this point. Projected from the
// light along its own direction onto the cloud plane, so it is correct for ANY directional source.
float shipwrightCloudTransmittance(vec3 viewPosition) {
  // No map (clear sky, or a sun so low the cloud-plane projection runs to the horizon): fall back to
  // the field's MEAN transmittance, which is 1.0 under a clear sky and ~0 under stratus. Returning a
  // literal 1.0 here let the sun blaze at full strength through an overcast deck below 1 degree --
  // exactly the "the picture and the light disagree" failure this model exists to remove.
  if (uCloudShadowStrength <= 0.0) return uCloudBeamMean;
  vec3 world = shipwrightWorldFromView(viewPosition);
  float t = (uCloudShadowAltitude - world.y) / max(uCloudSunDirection.y, 1e-3);
  vec2 plane = world.xz + uCloudSunDirection.xz * t;
  vec2 uv = (plane - uCloudShadowOrigin) * uCloudShadowScale;
  // Outside the map, fall back to the field's MEAN transmittance rather than to an edge texel, so
  // the far sea has no hard boundary. Feather across the last few percent.
  vec2 e = smoothstep(vec2(0.0), vec2(0.03), uv) * (1.0 - smoothstep(vec2(0.97), vec2(1.0), uv));
  float w = e.x * e.y;
  float sampled = texture2D(uCloudShadowMap, clamp(uv, 0.0, 1.0)).r;
  return mix(uCloudBeamMean, sampled, w);
}
`;

/** The one line we insert. Anchored on `getDirectionalLightInfo`, which appears exactly once in the
 *  chunk — `RE_Direct(...)` appears three times (point / spot / directional) and is not a safe anchor. */
const DIR_LIGHT_ANCHOR = "\t\tgetDirectionalLightInfo( directionalLight, directLight );";

let globalLightingInstalled = false;
/** How many live `Daylight`s depend on the global patch. The last one out puts the lights back. */
let globalLightingUsers = 0;
const USER_HOOK = Symbol("shipwright.onBeforeCompile");
/** Written into the prepended declarations so a re-evaluated module can SEE its own prior work.
 *  `globalLightingInstalled` lives in module scope and resets on hot reload; `THREE` does not. */
const PARS_SENTINEL = "// shipwright-lighting-installed";
/** The white 1x1 the shadow lookup falls back to. Kept so teardown can point the uniform back at it. */
let whitePixel: THREE.DataTexture | undefined;

interface HookedMaterial extends THREE.Material {
  [USER_HOOK]?: (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;
}

/**
 * Install the project's single global lighting patch. Idempotent.
 *
 * Two halves, and both have to be global or the "one model" thesis fails:
 *
 * 1. **The shader.** `lights_fragment_begin` gains one multiply on every directional light's
 *    contribution. Every lit material in three includes that chunk, so every lit material in the
 *    project is cloud-shadowed, with no per-material code anywhere.
 *
 * 2. **The uniforms.** three only binds uniforms a material actually owns, and a `ShaderChunk` cannot
 *    add them. `Material.onBeforeCompile` can — it receives the program parameters and whatever it
 *    puts in `shader.uniforms` becomes `materialProperties.uniforms`. But an *instance* assignment
 *    (`ocean.ts` does one) shadows a prototype method, so a plain prototype override would silently
 *    skip exactly the materials that need it most. Hence the accessor: user hooks are stored aside
 *    and chained, and no material can opt out.
 *
 * This mutates the imported `three` module for the whole page. That is the point — but it means the
 * defaults must be inert: `uCloudShadowStrength = 0` short-circuits the lookup, so any other scene
 * on the page renders exactly as before. `uninstallGlobalLighting` makes that true again on teardown:
 * shipwright is the only three.js scene on the page TODAY, and this file's own thesis is that there is
 * exactly one global patch — so it has to be able to un-patch, or the next project inherits our sky.
 *
 * The idempotency guard is deliberately BELT AND BRACES. `globalLightingInstalled` is module scope and
 * resets on hot reload; the mutated `THREE` singleton does not. So the real guard is a sentinel written
 * into the chunk itself: without it, one Fast Refresh of this module prepends the declarations twice
 * and every shader on the page fails to compile.
 */
/** three's own chunks, captured before we touch them, so teardown restores byte-for-byte. */
let pristineParsBegin: string | undefined;
let pristineFragmentBegin: string | undefined;

export const installGlobalLighting = (): void => {
  globalLightingUsers++;
  if (globalLightingInstalled || THREE.ShaderChunk.lights_pars_begin.includes(PARS_SENTINEL)) {
    globalLightingInstalled = true;
    return;
  }
  globalLightingInstalled = true;

  whitePixel ??= makeWhitePixel();
  LIGHTING_UNIFORMS.uCloudShadowMap.value ??= whitePixel;

  pristineParsBegin = THREE.ShaderChunk.lights_pars_begin;
  pristineFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;

  THREE.ShaderChunk.lights_pars_begin = `${PARS_SENTINEL}\n${LIGHTS_PARS_PREFIX}${THREE.ShaderChunk.lights_pars_begin}`;

  if (!THREE.ShaderChunk.lights_fragment_begin.includes(DIR_LIGHT_ANCHOR)) {
    throw new Error("Shipwright lighting: three's lights_fragment_begin no longer matches the anchor");
  }
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
    DIR_LIGHT_ANCHOR,
    `${DIR_LIGHT_ANCHOR}\n\t\tdirectLight.color *= shipwrightCloudTransmittance( geometryPosition );`,
  );

  Object.defineProperty(THREE.Material.prototype, "onBeforeCompile", {
    configurable: true,
    get(this: HookedMaterial) {
      const user = this[USER_HOOK];
      return (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => {
        Object.assign(shader.uniforms, LIGHTING_UNIFORMS);
        user?.(shader, renderer);
      };
    },
    set(this: HookedMaterial, fn: HookedMaterial[typeof USER_HOOK]) {
      this[USER_HOOK] = fn;
    },
  });
};

/**
 * Put three back exactly as we found it. Called by the last `Daylight` to be disposed.
 *
 * The old `dispose()` freed this module's GPU resources and stopped there, which left the *global*
 * uniform `uCloudShadowStrength = 1` pointing at a **disposed** render target. Nothing bit, because
 * shipwright is the only three.js scene on this page today. The moment a second one mounts — or a
 * client-side navigation remounts this one without a full reload — every lit material on the page
 * would sample a dead texture through a chunk we patched and never unpatched. A global mutation that
 * cannot be undone is a global mutation you have inflicted on everyone else.
 *
 * Ordering matters: make the uniforms inert FIRST, so any frame that renders between here and the
 * chunk restore short-circuits the lookup instead of touching the texture we are about to drop.
 */
export const uninstallGlobalLighting = (): void => {
  globalLightingUsers = Math.max(0, globalLightingUsers - 1);
  if (globalLightingUsers > 0 || !globalLightingInstalled) return;

  LIGHTING_UNIFORMS.uCloudShadowStrength.value = 0;
  if (whitePixel !== undefined) LIGHTING_UNIFORMS.uCloudShadowMap.value = whitePixel;

  if (pristineParsBegin !== undefined) THREE.ShaderChunk.lights_pars_begin = pristineParsBegin;
  if (pristineFragmentBegin !== undefined) {
    THREE.ShaderChunk.lights_fragment_begin = pristineFragmentBegin;
  }
  pristineParsBegin = undefined;
  pristineFragmentBegin = undefined;

  // Restoring the prototype means deleting our accessor: three's `Material` has no own
  // `onBeforeCompile` on the prototype (it is an instance-assigned no-op in its constructor), so
  // `delete` is the correct inverse of `defineProperty` here, not a re-definition.
  delete (THREE.Material.prototype as Partial<THREE.Material>).onBeforeCompile;

  whitePixel?.dispose();
  whitePixel = undefined;
  globalLightingInstalled = false;
};

/**
 * Every opaque object casts and receives. Call it on anything you add to the world.
 *
 * Shadow flags are per-OBJECT, not per-material, so this is not a lighting exception — it is the
 * geometry telling the renderer it is solid. The two deliberate abstainers, both documented where
 * they live: the **ocean** (a screen-space composite that shadows would have to be reconciled with,
 * out of scope) and the **unlit debug overlays** (`MeshBasicMaterial` ignores lights entirely).
 */
export const enableShadows = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
};

// --- The dome ----------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w; // pin to the far plane
}
`;

// The fragment mirrors `sky-model.ts` term for term (Preetham's clear radiance) and `clouds.ts` (the
// deck). Change one, change the other.
//
// NB: no backticks anywhere inside the GLSL — it lives in a template literal, and one in a comment
// silently terminates it. The parse error then points hundreds of characters away at something
// innocent. This has cost real time three times over.
const SKY_FRAG = /* glsl */ `
varying vec3 vWorldPosition;

uniform vec3 uSunShapeDirection;   // toward the sun, CLAMPED to the horizon (see skyShapeElevation)
uniform vec3 uSunDiscDirection;    // the true sun direction, which may be below the horizon
uniform vec3 uOzoneTau; // Chappuis absorption, vertical; the reason the zenith is blue not cyan
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform vec3 uTintRayleigh;
uniform vec3 uTintMie;
uniform float uSunShapeY;
uniform float uMieG;
uniform float uLitRayleigh; // fraction of each scatterer's column still lit by the direct beam --
uniform float uLitMie;      // 1 above the horizon, and the reason twilight goes blue (sky-model.ts)
uniform float uDomeScale;
uniform vec3 uSunDiscRadiance;
uniform float uSunDiscCosInner;
uniform float uSunDiscCosOuter;
uniform float uShowSunDisc;
uniform vec3 uOvercastZenith;
uniform vec3 uGroundRadiance;
uniform float uCloudTau;
uniform float uCloudFraction; // the field's MEAN THICKNESS over the plane, not its covered fraction
uniform float uCloudAltitude;
uniform float uCloudThreshold;
uniform float uCloudEdge;
uniform float uCloudTaper;
uniform float uCloudBillow;
uniform float uCloudShear;
uniform float uCloudFrequency;
uniform vec2 uCloudOffset;
uniform vec2 uCloudSunStep;   // sun direction on the cloud plane x one tap length, in METRES
uniform float uCloudShadeMean;
uniform float uCloudScatterShare;

${CLOUD_FIELD_GLSL}

const vec3 up = vec3(0.0, 1.0, 0.0);
const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4e3;
const float mieZenithLength = 1.25e3;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase(float cosTheta) {
  return THREE_OVER_SIXTEENPI * (1.0 + cosTheta * cosTheta);
}
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
}

void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);

  // --- Preetham clear-sky radiance, in RAW units (no display scale of its own).
  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - degrees(zenithAngle), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  // Ozone's own thin-shell (~25 km) air mass: bounded (~11) at the horizon, not the sea-level ~38, so
  // it blues the zenith without over-dimming the warm twilight horizon. Matches sky-model.ts.
  float ozoneRel2 = pow(6371.0 / 6396.0, 2.0);
  float ozoneAirMass = 1.0 / sqrt(1.0 - ozoneRel2 * (1.0 - direction.y * direction.y));
  vec3 Fex = exp(-(uBetaR * sR + uBetaM * sM + uOzoneTau * ozoneAirMass));

  float cosTheta = dot(direction, uSunShapeDirection);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  float mPhase = hgPhase(cosTheta, uMieG);
  // In-scattering SOURCE: only the sunlit part of each column contributes. Numerator only -- the
  // denominator is the total scattering coefficient, which does not care where the sun is. Below the
  // horizon the aerosol column goes dark almost at once (scale height 1.2 km) and takes the sharp
  // forward-scattering aureole with it, while the Rayleigh column (8.4 km) lingers: sunset's hot white
  // spot becomes a wide blue twilight arch, and a chrome ball stops reflecting a sun that has set.
  vec3 wR = uLitRayleigh * uBetaR * rPhase;
  vec3 wM = uLitMie * uBetaM * mPhase;
  vec3 ratio = (wR + wM) / (uBetaR + uBetaM);

  vec3 Lin = pow(uSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(uSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSunShapeY, 5.0), 0.0, 1.0));
  // No L0 floor. three's Sky adds 0.1 * Fex, a constant times the VIEW-path transmittance -- so it
  // peaks at the zenith and dies at the horizon. Below the horizon Lin collapses with Earth's shadow
  // and that floor does not (it never depended on the sun), so it became 99.9% of the -6 degree sky
  // and drew the afterglow straight UP. See sky-model.ts clearSkyRadiance.

  // Preetham's in-scattering source is a SCALAR (uSunE), so its aureole stayed white around a sun
  // whose blue Beer's law had already eaten. Each species instead scatters the beam that reached IT:
  // the aerosol sits at 1.2 km and has crossed nearly the whole column (deep orange); the Rayleigh
  // air reaches 8.4 km and has not (stays blue). Mixed by the same weights ratio itself is built from.
  vec3 tint = (wR * uTintRayleigh + wM * uTintMie) / max(wR + wM, vec3(1e-12));

  // uDomeScale carries the dome's ENERGY, set per elevation from a real clear-sky irradiance model.
  // Preetham's own magnitude is discarded: it under-delivers the low-sun sky by ~10x (see lighting.ts).
  // It is measured on the TINTED dome, so the energy still lands on Haurwitz and the tint moves hue alone.
  vec3 radiance = Lin * tint * uDomeScale;

  // --- The solar disc. Its radiance is E_beam / solid angle, so integrating it returns exactly the
  // beam the DirectionalLight carries -- and it reddens with air mass for free, because E_beam does.
  // Excluded from the PMREM bake (uShowSunDisc = 0) so the beam is never counted twice.
  float discCos = dot(direction, uSunDiscDirection);
  float disc = smoothstep(uSunDiscCosOuter, uSunDiscCosInner, discCos) * uShowSunDisc;
  radiance += uSunDiscRadiance * disc;

  // --- The cloud deck. Same field the shadow map and the CPU integral read. Only ABOVE the horizon:
  // below it the cloud plane is behind you, and drawing it there put an opaque wall under the horizon.
  if (uCloudTau > 0.0 && uCloudFrequency > 0.0 && direction.y > 0.0) {
    float dy = direction.y;
    float cloudDist = uCloudAltitude / max(dy, 0.02);
    float thickness = cloudThickness(direction.xz * cloudDist);
    // Toward the horizon the cloud-plane coordinate runs away, so fade the sample toward the field's
    // MEAN rather than toward zero -- otherwise an overcast sky opens into clear blue at the horizon.
    thickness = mix(uCloudFraction, thickness, smoothstep(0.0, 0.10, dy));

    // FULL tau here, no similarity transform: (1 - g) belongs to the BEAM (a photon scattered 2 deg
    // forward is still in the beam), not to how opaque a cloud looks against the sky behind it. See
    // clouds.ts cloudViewOpacity -- with (1 - g) applied, cirrus at tau 0.35 was 7% opaque and simply
    // invisible.
    float path = min(1.0 / max(dy, 0.05), 38.0);
    float alpha = 1.0 - exp(-uCloudTau * thickness * path);
    // CIE Standard Overcast Sky: zenith is 3x the horizon, azimuthally uniform, no disc. Its zenith
    // radiance is set from the energy the deck actually transmits, so the picture and the light agree.
    // That is the AMBIENT (multiply-scattered) half of a cloud's radiance.
    vec3 cloudRadiance = uOvercastZenith * ((1.0 + 2.0 * dy) / 3.0);

    // SELF-SHADOW. March a few taps of the same noise along the sun's direction across the cloud
    // plane and accumulate the thickness in the way. This is the single biggest step from "flat
    // opaque smear" to "cumulus": a cloud's sun-facing side lights up and its far side goes dark,
    // because something finally samples the cloud's own depth toward the sun.
    vec2 planeUv = direction.xz * cloudDist;
    float sunDepth = 0.0;
    for (int i = 1; i <= ${CLOUD_SHADOW_TAPS}; i++) {
      sunDepth += cloudThickness(planeUv + uCloudSunStep * float(i));
    }
    float sunTransmit = exp(-uCloudTau * (1.0 - ${CLOUD_ASYMMETRY.toFixed(4)}) * sunDepth * ${CLOUD_SHADOW_STEP_FEATURES.toFixed(4)});

    // Henyey-Greenstein on the VIEW-SUN angle: forward scattering, so a cloud between you and the sun
    // gets a silver lining. 4*pi*HG has a mean of 1 over the sphere, so this tilts the single-scatter
    // lobe without adding energy.
    float sunPhase = 4.0 * pi * hgPhase(dot(direction, uSunDiscDirection), ${CLOUD_VIEW_ASYMMETRY.toFixed(3)});

    // Multiple scatter (isotropic) + single scatter (self-shadowed, phase-tilted), divided by the
    // field's own spatial mean (measured on the CPU by cloudStats). The deck redistributes its
    // radiance -- lit sides, dark sides -- without inventing or destroying any of the energy the light
    // model already budgeted for it.
    //
    // uCloudScatterShare falls as 1/(1 + tau*(1-g)): 0.94 for cirrus, 0.03 for a thunderhead. A photon
    // in an optically thick cloud scatters dozens of times and arrives from everywhere, so a Cb base is
    // flat and dark whatever the sun is doing -- while a cirrus veil is almost pure single scatter and
    // blazes when you look through it at the sun.
    float shade = (1.0 - uCloudScatterShare) + uCloudScatterShare * sunTransmit * sunPhase;
    cloudRadiance *= shade / uCloudShadeMean;

    // AERIAL PERSPECTIVE. The cloud is cloudDist metres away and the air between scatters: it dims the
    // cloud and fills in with AIRLIGHT. Blue extinguishes first (Rayleigh), so a distant dark cloud
    // base hazes to blue-grey; without this a low deck stacks into a hard dark belt at the horizon.
    //
    // But the airlight is lit by whatever is actually above it. Approximating it by the clear-sky
    // radiance -- as if a blue sky were shining down through the deck -- is only right for ISOLATED
    // clouds. Under total overcast there is no blue sky, and the light in front of the deck is the
    // deck's own. Getting this wrong made a stratus dome dissolve into a clean blue gradient at low
    // sun, where the cloud is 14 km away along a near-horizontal ray: the light said overcast and the
    // sky said clear, which is the one failure this whole model exists to prevent.
    //
    // uCloudFraction is the field's MEAN THICKNESS, so it interpolates exactly the right way: ~0 for a
    // sparse cumulus field (airlight = the sky between the clouds), ~1 for a stratus deck.
    vec3 aerial = exp(-(uBetaR + uBetaM) * cloudDist);
    vec3 airlight = mix(radiance, cloudRadiance, uCloudFraction);
    vec3 hazed = mix(cloudRadiance, airlight, 1.0 - aerial);
    radiance = mix(radiance, hazed, alpha);
  }

  // --- Below the horizon: the SEA, and it is a Fresnel reflector, not a Lambertian card.
  //
  // Looking steeply down you see water: reflectance ~2 %, so almost all of what you get is the light
  // the sea bounces back up (uGroundRadiance). Looking along the surface you see a mirror: Fresnel
  // goes to 1 at grazing, so the far sea IS the horizon sky -- which is exactly what radiance already
  // holds here, because Preetham's zenith angle clamps at 90 degrees.
  //
  // One Schlick term therefore does three jobs at once: it makes the ocean plane's finite far edge
  // seamless, it stops the dome's lower half lighting every underside as though the sea were a lamp
  // (which is what let hemiLight be deleted), and it gives a chrome ball a sea to reflect instead of a
  // flat grey fill.
  if (direction.y < 0.0) {
    float cosIncidence = -direction.y;
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosIncidence, 5.0);
    radiance = mix(uGroundRadiance, radiance, fresnel);
  }

  // Mobile render fix, retained: PMREM bakes into a HalfFloat target (ceiling 65504). Desktop drivers
  // clamp an over-range write; many mobile drivers emit +Inf, which PMREM's blur smears into NaN
  // across the whole env map. Clamp below the ceiling so the baked value is finite everywhere.
  gl_FragColor = vec4(min(radiance, vec3(60000.0)), 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// --- The cloud shadow pass ---------------------------------------------------
// A fullscreen quad that writes exp(-k * thickness) -- the SAME expression `cloudStats.beamFactor`
// averages on the CPU, so the scalar the exposure uses and the texture the fragments sample cannot
// drift apart. Rendered into cloud-plane space, not world space: at a low sun the world projects
// tens of kilometres along the beam, and a world-anchored map could never cover it.

const CLOUD_SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const CLOUD_SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uCloudShadowOrigin;
uniform float uCloudShadowSpan;
uniform float uCloudExtinction; // tau * (1 - g) * slantPath, all folded into one scalar
uniform float uCloudThreshold;
uniform float uCloudEdge;
uniform float uCloudTaper;
uniform float uCloudBillow;
uniform float uCloudShear;
uniform float uCloudFrequency;
uniform vec2 uCloudOffset;

${CLOUD_FIELD_GLSL}

void main() {
  vec2 plane = uCloudShadowOrigin + vUv * uCloudShadowSpan;
  float thickness = cloudThickness(plane);
  gl_FragColor = vec4(exp(-uCloudExtinction * thickness), 0.0, 0.0, 1.0);
}
`;

/** Texels of the cloud shadow map. 512² over 8 km is ~16 m/texel; cumulus cells are ~650 m across, so
 *  this is far finer than the field it samples, and it measures at 0.14 ms. */
const CLOUD_SHADOW_SIZE = 512;
const CLOUD_SHADOW_SPAN = 8000; // metres of cloud plane the map covers
/** How far ahead the cloud map's focus may chase the view ray to the water. Much longer than the sun
 *  shadow frustum's 400 m, because this map is 8 km across and an aerial camera looks kilometres out. */
const CLOUD_FOCUS_MAX_REACH = 3000;
/** Below this the beam is negligible and the cloud-plane projection runs to the horizon. */
const CLOUD_SHADOW_MIN_ELEVATION = 1;

const SHADOW_RADIUS = 200; // metres, half-extent of the sun's ortho shadow frustum
const SHADOW_FOCUS_AHEAD = 90; // metres ahead when the view ray never meets the sea

export interface DaylightOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
}

export interface Daylight {
  sunLight: THREE.DirectionalLight;
  /** The current physical state. Read-only; everything downstream derives from it. */
  state: () => LightingState;
  /** Called whenever the light changes, from ANY source — the GUI, `setSun`, the benchmark. The one
   *  seam through which the rest of the scene (today: the water's downwelling veil) follows the sun,
   *  so nothing has to remember to re-derive after poking a dial. */
  onState: (listener: (state: LightingState) => void) => void;
  setSun: (elevationDeg: number, azimuthDeg: number) => void;
  sun: () => { elevation: number; azimuth: number };
  setCloudGenus: (name: string) => void;
  cloudGenus: () => CloudGenusName;
  setCloudOverrides: (patch: Partial<CloudState>) => void;
  /** The aerosol load. Drives the beam's extinction as well as the dome's, so a hazy sunset has a
   *  dim, deep-orange, lookable-at sun and a clear one has a blinding white disc. */
  setTurbidity: (turbidity: number) => void;
  setExposureKey: (key: number) => void;
  setAdaptationFloorLux: (lux: number) => void;
  /** Advance the cloud scroll + re-anchor the sun's shadow frustum on the view. Once per frame. */
  update: (time: number) => void;
  /** Redraw the cloud shadow map. Call inside a GPU-timed span, before the scene's other passes. */
  renderCloudShadow: (renderer: THREE.WebGLRenderer) => void;
  /** Read the cloud shadow map back and report its statistics. The instrument for "is the deck
   *  actually shadowing anything, and by how much" — a uniform map means a uniform sea, and no amount
   *  of staring at a frame distinguishes that from a scene that happens to sit in a gap. */
  cloudShadowStats: (renderer: THREE.WebGLRenderer) => {
    min: number;
    max: number;
    mean: number;
    strength: number;
    beamMean: number;
  };
  /** Called by `applyState`; exposed so the debug probe can force a re-bake after poking uniforms. */
  refresh: () => void;
  buildGui: (folders: { environment: GUI }) => void;
  dispose: () => void;
}

export const createDaylight = ({ scene, renderer, camera }: DaylightOptions): Daylight => {
  installGlobalLighting();

  // --- Sun ------------------------------------------------------------------
  const sunLight = new THREE.DirectionalLight(0xffffff, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 1200;
  sunLight.shadow.bias = -0.0005;
  // Large normalBias: the terrain is one huge surface at grazing sun, where depth bias alone either
  // acnes or peter-pans. Offsetting along the normal is the robust lever here.
  sunLight.shadow.normalBias = 0.5;
  Object.assign(sunLight.shadow.camera, {
    left: -SHADOW_RADIUS,
    right: SHADOW_RADIUS,
    top: SHADOW_RADIUS,
    bottom: -SHADOW_RADIUS,
  });
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight);
  scene.add(sunLight.target);

  renderer.shadowMap.enabled = true;
  // NOT PCFSoftShadowMap — three deprecated it and silently falls back to PCFShadowMap with a warning.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // --- Dome -----------------------------------------------------------------
  const skyUniforms = {
    uSunShapeDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunDiscDirection: { value: new THREE.Vector3(0, 1, 0) },
    uOzoneTau: { value: new THREE.Vector3(...OZONE_ZENITH_TAU) },
    uBetaR: { value: new THREE.Vector3() },
    uBetaM: { value: new THREE.Vector3() },
    uSunE: { value: 0 },
    uTintRayleigh: { value: new THREE.Vector3(1, 1, 1) },
    uTintMie: { value: new THREE.Vector3(1, 1, 1) },
    uSunShapeY: { value: 0 },
    uMieG: { value: DEFAULT_SKY.mieDirectionalG },
    uLitRayleigh: { value: 1 },
    uLitMie: { value: 1 },
    uDomeScale: { value: 1 },
    uSunDiscRadiance: { value: new THREE.Vector3() },
    uSunDiscCosInner: { value: Math.cos(0.267 * DEG) },
    uSunDiscCosOuter: { value: Math.cos(0.30 * DEG) },
    uShowSunDisc: { value: 1 },
    uOvercastZenith: { value: new THREE.Vector3() },
    uGroundRadiance: { value: new THREE.Vector3() },
    uCloudTau: { value: 0 },
    uCloudFraction: { value: 0 },
    uCloudAltitude: { value: 1200 },
    uCloudThreshold: { value: 1.001 },
    uCloudEdge: { value: 0.3 },
    uCloudTaper: { value: 0.5 },
    uCloudBillow: { value: 0 },
    uCloudShear: { value: 1 },
    uCloudFrequency: { value: 0 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudSunStep: { value: new THREE.Vector2() },
    uCloudShadeMean: { value: 1 },
    uCloudScatterShare: { value: 1 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    name: "ShipwrightSky",
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), skyMaterial);
  skyMesh.scale.setScalar(10000);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // --- Cloud shadow map ------------------------------------------------------
  const cloudShadowUniforms = {
    uCloudShadowOrigin: { value: new THREE.Vector2() },
    uCloudShadowSpan: { value: CLOUD_SHADOW_SPAN },
    uCloudExtinction: { value: 0 },
    uCloudThreshold: { value: 1.001 },
    uCloudEdge: { value: 0.3 },
    uCloudTaper: { value: 0.5 },
    uCloudBillow: { value: 0 },
    uCloudShear: { value: 1 },
    uCloudFrequency: { value: 0 },
    uCloudOffset: { value: new THREE.Vector2() },
  };
  const cloudShadowMaterial = new THREE.ShaderMaterial({
    name: "ShipwrightCloudShadow",
    uniforms: cloudShadowUniforms,
    vertexShader: CLOUD_SHADOW_VERT,
    fragmentShader: CLOUD_SHADOW_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  // HalfFloat, not R8: an 8-bit transmittance bands visibly across a soft cumulus penumbra.
  const cloudShadowTarget = new THREE.WebGLRenderTarget(CLOUD_SHADOW_SIZE, CLOUD_SHADOW_SIZE, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  cloudShadowTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
  cloudShadowTarget.texture.wrapT = THREE.ClampToEdgeWrapping;
  cloudShadowTarget.texture.minFilter = THREE.LinearFilter;
  cloudShadowTarget.texture.magFilter = THREE.LinearFilter;
  const cloudShadowScene = new THREE.Scene();
  const cloudShadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cloudShadowMaterial);
  cloudShadowQuad.frustumCulled = false;
  cloudShadowScene.add(cloudShadowQuad);
  const cloudShadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  LIGHTING_UNIFORMS.uCloudShadowMap.value = cloudShadowTarget.texture;
  LIGHTING_UNIFORMS.uCloudShadowScale.value = 1 / CLOUD_SHADOW_SPAN;
  cloudShadowUniforms.uCloudShadowSpan.value = CLOUD_SHADOW_SPAN;

  // --- PMREM ----------------------------------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envTarget: THREE.WebGLRenderTarget | undefined;
  scene.environmentIntensity = 1; // and it stays 1 — envIntensityForSun is gone

  // --- Live parameters -------------------------------------------------------
  const sunAngles = { elevation: 14, azimuth: 85 };
  const skyParams: SkyParams = { ...DEFAULT_SKY };
  let genusName: CloudGenusName = DEFAULT_GENUS;
  let cloud: CloudState = cloudStateFromGenus(CLOUD_GENERA[DEFAULT_GENUS]);
  const tuning = {
    exposureKey: DEFAULT_EXPOSURE_KEY,
    adaptationFloorLux: DEFAULT_ADAPTATION_FLOOR_LUX,
    groundAlbedo: DEFAULT_GROUND_ALBEDO,
  };
  let cloudTime = 0;
  const cloudOffset: [number, number] = [0, 0];
  let state: LightingState = computeLighting({
    elevationDeg: sunAngles.elevation,
    azimuthDeg: sunAngles.azimuth,
    sky: skyParams,
    cloud,
    cloudOffset,
    ...tuning,
  });

  const sunDirection = new THREE.Vector3(0, 1, 0);
  const shapeDirection = new THREE.Vector3(0, 1, 0);

  /** Keep the shadow frustum over whatever the camera is LOOKING AT. Anchoring it at the camera's
   *  POSITION is the obvious thing and it is wrong: an overhead look-at camera can sit 300 m from
   *  what it frames, which silently drops every shadow. Because this world is a sea at y = 0, the
   *  honest anchor is where the view ray meets the water; when the eye looks level or up, the ray
   *  never lands, so fall back to a fixed distance ahead. */
  const shadowFocus = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const syncSunShadow = () => {
    camera.getWorldDirection(viewDirection);
    const looksDown = viewDirection.y < -0.05;
    const reach = looksDown ? Math.min(-camera.position.y / viewDirection.y, 400) : SHADOW_FOCUS_AHEAD;
    shadowFocus.copy(camera.position).addScaledVector(viewDirection, reach);
    shadowFocus.y = 0;
    sunLight.target.position.copy(shadowFocus);
    sunLight.target.updateMatrixWorld();
    sunLight.position.copy(shadowFocus).addScaledVector(sunDirection, 600);
  };

  /** Re-centre the cloud shadow map on the cloud-plane point that the VIEW's focus projects to, snapped
   *  to a texel so the field does not shimmer as the camera moves.
   *
   *  Centring it on the CAMERA's position is the obvious thing and it is wrong, for exactly the reason
   *  `syncSunShadow` above already records: a camera 700 m back and 450 m up from the water it frames
   *  puts most of that water outside a 6 km window, where every fragment feathers to the field's mean.
   *  The sea then renders perfectly, uniformly lit under a broken cumulus deck — and three separate
   *  blind reviewers reported "no dappling" before the shadow map's own readback showed the map was
   *  fine and the projection was not. `shadowFocus` is where the view ray meets the sea. */
  const cloudFocus = new THREE.Vector3();
  const syncCloudShadowOrigin = () => {
    // Its OWN focus, not the sun frustum's. `shadowFocus` caps its reach at 400 m, which is right for a
    // 200 m ortho shadow box and useless for an 8 km cloud map: from an aerial camera 450 m up, 400 m
    // along the view ray is still 340 m above the sea, so the map stayed centred on the camera and
    // most of the visible water fell outside it — feathering to the field's mean, i.e. rendering as a
    // perfectly, uniformly lit sea under a broken deck. Three blind reviewers reported "no dappling"
    // before the map's own readback proved the map was fine and the projection was not.
    camera.getWorldDirection(viewDirection);
    const looksDown = viewDirection.y < -0.02;
    const reach = looksDown
      ? Math.min(-camera.position.y / viewDirection.y, CLOUD_FOCUS_MAX_REACH)
      : SHADOW_FOCUS_AHEAD;
    cloudFocus.copy(camera.position).addScaledVector(viewDirection, reach);
    cloudFocus.y = 0;

    const sy = Math.max(sunDirection.y, 1e-3);
    const t = cloud.altitude / sy;
    const cx = cloudFocus.x + sunDirection.x * t;
    const cz = cloudFocus.z + sunDirection.z * t;
    const texel = CLOUD_SHADOW_SPAN / CLOUD_SHADOW_SIZE;
    const originX = Math.round((cx - CLOUD_SHADOW_SPAN / 2) / texel) * texel;
    const originZ = Math.round((cz - CLOUD_SHADOW_SPAN / 2) / texel) * texel;
    cloudShadowUniforms.uCloudShadowOrigin.value.set(originX, originZ);
    LIGHTING_UNIFORMS.uCloudShadowOrigin.value.set(originX, originZ);
  };

  const applyState = () => {
    const { elevation, azimuth } = sunAngles;
    state = computeLighting({
      elevationDeg: elevation,
      azimuthDeg: azimuth,
      sky: skyParams,
      cloud,
      cloudOffset,
      ...tuning,
    });

    // Sun direction (three's spherical convention, matching the old scene.ts).
    const phi = (90 - elevation) * DEG;
    const theta = azimuth * DEG;
    sunDirection.setFromSphericalCoords(1, phi, theta);
    const shapePhi = (90 - skyShapeElevation(elevation)) * DEG;
    shapeDirection.setFromSphericalCoords(1, shapePhi, theta);

    // The light. Colour carries the beam's chromaticity, intensity its luminance, so the GUI shows a
    // number a human can read and `color` stays inside [0,1]. `sources` is a LIST — a moon would
    // simply be a second entry, and nothing below reads "the sun" by name.
    const sun = state.sources.length > 0 ? state.sources[0] : null;
    const beam: Rgb = sun ? sun.irradiance : [0, 0, 0];
    const beamLum = 0.2126 * beam[0] + 0.7152 * beam[1] + 0.0722 * beam[2];
    sunLight.intensity = beamLum;
    if (beamLum > 0) sunLight.color.setRGB(beam[0] / beamLum, beam[1] / beamLum, beam[2] / beamLum);
    // Below the horizon the light is off, but it must stay in the scene: removing and re-adding it
    // would recompile every material (NUM_DIR_LIGHTS changes). Intensity 0 costs a multiply.
    syncSunShadow();

    // The dome. `sunTerms` takes BOTH the frozen shape elevation and the true one: the shape is
    // clamped at the horizon (Preetham is undefined below it) while Earth's shadow keeps rising.
    const terms = sunTerms(
      skyShapeElevation(elevation) * DEG,
      skyParams,
      elevation * DEG,
      sourceTints(elevation, skyParams.turbidity),
    );
    skyUniforms.uSunShapeDirection.value.copy(shapeDirection);
    skyUniforms.uSunDiscDirection.value.copy(sunDirection);
    skyUniforms.uBetaR.value.set(...terms.betaR);
    skyUniforms.uBetaM.value.set(...terms.betaM);
    skyUniforms.uSunE.value = terms.sunE;
    skyUniforms.uTintRayleigh.value.set(...terms.tintRayleigh);
    skyUniforms.uTintMie.value.set(...terms.tintMie);
    skyUniforms.uSunShapeY.value = terms.sunY;
    skyUniforms.uMieG.value = skyParams.mieDirectionalG;
    skyUniforms.uLitRayleigh.value = terms.litRayleigh;
    skyUniforms.uLitMie.value = terms.litMie;
    skyUniforms.uDomeScale.value = state.domeScale;
    skyUniforms.uSunDiscRadiance.value.set(...(sun ? sun.discRadiance : ([0, 0, 0] as Rgb)));
    skyUniforms.uOvercastZenith.value.set(...state.overcastZenithRadiance);
    skyUniforms.uGroundRadiance.value.set(...state.groundRadiance);

    const threshold = cloudThreshold(cloud);
    const frequency = 1 / cloud.featureSize;
    skyUniforms.uCloudTau.value = cloud.tau;
    skyUniforms.uCloudFraction.value = state.cloudPlaneThickness;
    skyUniforms.uCloudAltitude.value = cloud.altitude;
    skyUniforms.uCloudThreshold.value = threshold;
    skyUniforms.uCloudEdge.value = cloud.edge;
    skyUniforms.uCloudTaper.value = cloud.taper;
    skyUniforms.uCloudBillow.value = cloud.billow;
    skyUniforms.uCloudShear.value = cloud.shear;
    skyUniforms.uCloudFrequency.value = cloud.coverage > 0 ? frequency : 0;
    skyUniforms.uCloudOffset.value.set(cloudOffset[0], cloudOffset[1]);
    skyUniforms.uCloudShadeMean.value = state.cloudShadeMean;
    skyUniforms.uCloudScatterShare.value = state.cloudScatterShare;
    // The self-shadow march: one tap length along the sun's direction, projected onto the cloud
    // plane. Same direction, same step, same units the CPU twin measured `shadeMean` with.
    const sunPlaneX = sunDirection.y > 1e-3 ? sunDirection.x / sunDirection.y : 1;
    const sunPlaneZ = sunDirection.y > 1e-3 ? sunDirection.z / sunDirection.y : 0;
    const sunPlaneLen = Math.hypot(sunPlaneX, sunPlaneZ) || 1;
    const stepLength = cloud.featureSize * CLOUD_SHADOW_STEP_FEATURES;
    skyUniforms.uCloudSunStep.value.set(
      (sunPlaneX / sunPlaneLen) * stepLength,
      (sunPlaneZ / sunPlaneLen) * stepLength,
    );

    // The cloud shadow pass, and the uniforms every lit material reads.
    const sinH = Math.sin(Math.max(elevation, 0) * DEG);
    const slant = Math.min(1 / Math.max(sinH, 1e-4), 38);
    const active = cloud.coverage > 0 && cloud.tau > 0 && elevation > CLOUD_SHADOW_MIN_ELEVATION;
    cloudShadowUniforms.uCloudExtinction.value = cloud.tau * (1 - CLOUD_ASYMMETRY) * slant;
    cloudShadowUniforms.uCloudThreshold.value = threshold;
    cloudShadowUniforms.uCloudEdge.value = cloud.edge;
    cloudShadowUniforms.uCloudTaper.value = cloud.taper;
    cloudShadowUniforms.uCloudBillow.value = cloud.billow;
    cloudShadowUniforms.uCloudShear.value = cloud.shear;
    cloudShadowUniforms.uCloudFrequency.value = frequency;
    cloudShadowUniforms.uCloudOffset.value.set(cloudOffset[0], cloudOffset[1]);

    LIGHTING_UNIFORMS.uCloudSunDirection.value.copy(sunDirection);
    LIGHTING_UNIFORMS.uCloudShadowAltitude.value = cloud.altitude;
    LIGHTING_UNIFORMS.uCloudShadowStrength.value = active ? 1 : 0;
    // Outside the shadow map, and below the elevation where the projection is meaningful, every
    // fragment sees the field's spatial mean — which is exactly what the CPU energy budget used.
    LIGHTING_UNIFORMS.uCloudBeamMean.value = state.cloudBeamFactor;
    syncCloudShadowOrigin(); // after syncSunShadow above, which is what sets `shadowFocus`

    // Exposure. A real photographic meter on the scene's own light (see lighting.ts), NOT a curve
    // in sun elevation, and it never divides by the sun.
    renderer.toneMappingExposure = state.exposure;

    // Bake the env map WITHOUT the disc: the DirectionalLight already carries the beam.
    skyUniforms.uShowSunDisc.value = 0;
    envScene.add(skyMesh);
    envTarget?.dispose();
    envTarget = pmrem.fromScene(envScene);
    scene.add(skyMesh);
    skyUniforms.uShowSunDisc.value = 1;
    scene.environment = envTarget.texture;

    listeners.forEach((listener) => listener(state));
  };
  const listeners: ((state: LightingState) => void)[] = [];
  applyState();

  return {
    sunLight,
    state: () => state,
    onState: (listener) => {
      listeners.push(listener);
      listener(state); // fire immediately, so a subscriber never starts out of sync
    },
    sun: () => ({ ...sunAngles }),
    setSun: (elevation, azimuth) => {
      sunAngles.elevation = elevation;
      sunAngles.azimuth = azimuth;
      applyState();
    },
    setCloudGenus: (name) => {
      if (!isCloudGenus(name)) return;
      genusName = name;
      cloud = cloudStateFromGenus(CLOUD_GENERA[name]);
      applyState();
    },
    cloudGenus: () => genusName,
    setCloudOverrides: (patch) => {
      cloud = { ...cloud, ...patch };
      applyState();
    },
    setTurbidity: (turbidity) => {
      skyParams.turbidity = turbidity;
      applyState();
    },
    setExposureKey: (key) => {
      tuning.exposureKey = key;
      applyState();
    },
    setAdaptationFloorLux: (lux) => {
      tuning.adaptationFloorLux = lux;
      applyState();
    },
    update: (time) => {
      syncSunShadow();
      syncCloudShadowOrigin();
      // Scroll the deck. The offset is in NOISE units, the same space the CPU twin reads, so the
      // dome, the shadow map and the energy budget all see one field drifting together.
      if (cloud.coverage > 0 && time !== cloudTime) {
        cloudTime = time;
        cloudOffset[0] = (cloud.wind[0] * time) / cloud.featureSize;
        cloudOffset[1] = (cloud.wind[1] * time) / cloud.featureSize;
        skyUniforms.uCloudOffset.value.set(cloudOffset[0], cloudOffset[1]);
        cloudShadowUniforms.uCloudOffset.value.set(cloudOffset[0], cloudOffset[1]);
      }
    },
    renderCloudShadow: (r) => {
      if (LIGHTING_UNIFORMS.uCloudShadowStrength.value <= 0) return;
      const previous = r.getRenderTarget();
      r.setRenderTarget(cloudShadowTarget);
      r.render(cloudShadowScene, cloudShadowCamera);
      r.setRenderTarget(previous);
    },
    cloudShadowStats: (r) => {
      // The WHOLE map. Reading a 64x64 corner would report the distribution of one cloud, not of the
      // field, and would have hidden the projection bug above rather than exposed it.
      const side = CLOUD_SHADOW_SIZE;
      const pixels = new Uint16Array(side * side * 4);
      const half = (h: number) => {
        const e = (h & 0x7c00) >> 10;
        const f = h & 0x03ff;
        if (e === 0) return Math.pow(2, -14) * (f / 1024);
        if (e === 0x1f) return NaN;
        return Math.pow(2, e - 15) * (1 + f / 1024);
      };
      r.readRenderTargetPixels(cloudShadowTarget, 0, 0, side, side, pixels);
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < side * side; i++) {
        const v = half(pixels[i * 4]);
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += v;
      }
      return {
        min,
        max,
        mean: sum / (side * side),
        strength: LIGHTING_UNIFORMS.uCloudShadowStrength.value,
        beamMean: LIGHTING_UNIFORMS.uCloudBeamMean.value,
      };
    },
    refresh: applyState,
    buildGui: ({ environment }) => {
      const sunFolder = environment.addFolder("Sun");
      // -18° is astronomical twilight: the bottom of the model's domain. Night proper is out of scope.
      sunFolder
        .add(sunAngles, "elevation", -18, 90, 0.1)
        .listen()
        .onChange((v: number) => {
          sunAngles.elevation = v;
          applyState();
        });
      sunFolder
        .add(sunAngles, "azimuth", -180, 180, 0.1)
        .listen()
        .onChange((v: number) => {
          sunAngles.azimuth = v;
          applyState();
        });

      const lightFolder = environment.addFolder("Lighting");
      lightFolder
        .add(tuning, "exposureKey", 0.05, 0.5, 0.005)
        .name("key (middle grey)")
        .onChange(applyState);
      // The ONE adaptation knob. 3 lux is the civil-twilight threshold; drop it and night stays
      // exposed like day, raise it and dusk darkens sooner. The night LOOK is a design call.
      lightFolder
        .add(tuning, "adaptationFloorLux", 0.001, 1000, 0.001)
        .name("adaptation floor (lx)")
        .onChange(applyState);
      // Read-only: the broadband albedo of what lies below the horizon (mostly sea, a little rock) is a
      // PHYSICAL CONSTANT, not a tuning knob. Shown so the value is legible, locked so it can't be fudged.
      lightFolder.add(tuning, "groundAlbedo", 0, 0.5, 0.01).name("ground albedo").disable();
      const readout = {
        get exposure() {
          return Number(state.exposure.toFixed(3));
        },
        get illuminance() {
          return Math.round(state.illuminanceLux);
        },
        get sunSky() {
          return Number(sunSkyRatio(state).toFixed(2));
        },
        get sunSkyFacing() {
          return Number(sunSkyRatioSunFacing(state).toFixed(2));
        },
      };
      lightFolder.add(readout, "exposure").listen().disable();
      lightFolder.add(readout, "illuminance").name("illuminance (lx)").listen().disable();
      lightFolder.add(readout, "sunSky").name("sun:sky (horizontal)").listen().disable();
      lightFolder.add(readout, "sunSkyFacing").name("sun:sky (sun-facing)").listen().disable();
      lightFolder.close();

      const atmo = environment.addFolder("Atmosphere");
      atmo.add(skyParams, "turbidity", 0, 20, 0.1).onChange(applyState);
      atmo.add(skyParams, "rayleigh", 0, 4, 0.01).onChange(applyState);
      atmo.add(skyParams, "mieCoefficient", 0, 0.1, 0.001).name("haze").onChange(applyState);
      atmo.add(skyParams, "mieDirectionalG", 0, 1, 0.01).name("sun glow").onChange(applyState);
      atmo.close();

      const clouds = environment.addFolder("Clouds");
      const genusProxy = { genus: genusName };
      clouds
        .add(genusProxy, "genus", CLOUD_GENUS_NAMES)
        .onChange((name: string) => {
          if (!isCloudGenus(name)) return;
          genusName = name;
          cloud = cloudStateFromGenus(CLOUD_GENERA[name]);
          applyState();
          clouds.controllersRecursive().forEach((c) => c.updateDisplay());
        });
      clouds.add(cloud, "coverage", 0, 1, 0.01).listen().onChange(applyState);
      clouds.add(cloud, "tau", 0, 150, 0.05).name("optical depth").listen().onChange(applyState);
      clouds.add(cloud, "altitude", 200, 12000, 50).listen().onChange(applyState);
      clouds.add(cloud, "featureSize", 200, 8000, 50).name("feature size (m)").listen().onChange(applyState);
      clouds.add(cloud, "edge", 0.02, 0.8, 0.01).name("edge softness").listen().onChange(applyState);
      clouds.add(cloud, "taper", 0, 1, 0.01).name("edge taper").listen().onChange(applyState);
      clouds.add(cloud, "billow", 0, 1, 0.01).name("billow (convective)").listen().onChange(applyState);
      clouds.add(cloud, "shear", 0.05, 1, 0.01).name("wind shear").listen().onChange(applyState);
      clouds.close();
    },
    dispose: () => {
      // Before anything is freed: the global uniform still points at `cloudShadowTarget`.
      uninstallGlobalLighting();
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      cloudShadowQuad.geometry.dispose();
      cloudShadowMaterial.dispose();
      cloudShadowTarget.dispose();
      envTarget?.dispose();
      pmrem.dispose();
    },
  };
};
