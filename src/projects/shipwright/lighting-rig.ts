import * as THREE from "three";
import { PROBE_LAYER } from "./layers";
import { luminance, type Rgb } from "./sky-model";

/**
 * The irradiance probe — what `measuring-pole.ts` is to water clarity, this is to light.
 *
 * `measure()` renders a sun-facing card into an off-screen HalfFloat target and reads back the LINEAR
 * radiance, with each light source isolated. This is the instrument that found the original bug, and
 * it is strictly better than reading a screenshot: rendering into a render target means three applies
 * NO tone mapping (it only tone-maps when drawing to the canvas), so we read true linear radiance and
 * never have to undo sRGB or invert AgX to reason about a ratio.
 *
 * The VISIBLE calibration rig used to live here too — five spheres of known albedo. It has grown into
 * its own thing (`material-rig.ts` + `materials.ts`): a grid of measured materials at three depths,
 * with no dependency on this file or on the lighting model, so it can be dropped onto an older build
 * and A/B'd against it. A calibration instrument that only compiles against the thing it calibrates
 * is not an instrument.
 *
 * The probe is PERMANENT rather than a temporary set of debug setters. The intent is that no lighting
 * back-door survives into the shipped model, and a single self-contained `measure()` that saves and
 * restores every value it touches satisfies that better than three raw intensity setters would.
 * Nothing outside this file can reach in and scale a light.
 */

export interface LightingRig {
  /**
   * Measure the scene's irradiance on a diffuse card, per light source, in LINEAR renderer units.
   * Renders off-screen; leaves the scene exactly as it found it.
   */
  measure: (opts: MeasureOptions) => LightingMeasurement;
  dispose: () => void;
}

export interface MeasureOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Unit vector toward the sun. The card is oriented to face it (or straight up if it has set). */
  sunDirection: THREE.Vector3;
  /** Every directional light in the scene, so the probe can isolate them without naming the sun. */
  directionalLights: THREE.DirectionalLight[];
}

export interface LightingMeasurement {
  /** Radiance of a sun-facing 0.18 card lit ONLY by the directional sources. */
  sunFacingBeam: Rgb;
  /** ...lit ONLY by `scene.environment` (the sky dome's PMREM). */
  sunFacingSky: Rgb;
  /** ...lit by everything. */
  sunFacingAll: Rgb;
  /** The same three, on a card lying flat (the orientation LIGHTING.md's target table uses). */
  horizontalBeam: Rgb;
  horizontalSky: Rgb;
  horizontalAll: Rgb;
  /** `luminance(horizontalBeam) / luminance(horizontalSky)`. The acceptance number. */
  ratioHorizontal: number;
  /** The same on the sun-facing card. Always higher; report which one you mean. */
  ratioSunFacing: number;
}

/** Probe target side. We average the whole thing, so a handful of texels is plenty; small keeps the
 *  synchronous `readRenderTargetPixels` stall (which is what makes this a debug tool) negligible. */
const PROBE_SIZE = 8;

/** Where the probe card lives: high above the sea, outside every other object's bounds, so nothing
 *  can occlude or bounce onto it — but BELOW the lowest cloud base (stratus, 700 m), so the cloud
 *  shadow it samples is the one a point on the ground would see. The probe camera is a 2 m ortho box
 *  aimed straight at it. */
const PROBE_ORIGIN = new THREE.Vector3(0, 500, 0);

// The card and the probe camera live on their own render layer (PROBE_LAYER, see layers.ts), so a
// probe renders ONE quad rather than the whole scene six times. Directional lights are layer-filtered
// too (three skips a light the camera cannot see), so `measure` temporarily enables the layer on each.

export const createLightingRig = (): LightingRig => {
  // --- The probe -------------------------------------------------------------
  // A PURE Lambertian, and it has to be: `specularIntensity: 0` on a physical material zeroes both
  // F0 and F90 (three: `specularF90 = mix(specularIntensity, 1.0, metalness)`), so the card has no
  // specular lobe at all. A `MeshStandardMaterial` keeps its dielectric F0 = 0.04, whose GGX lobe at
  // roughness 1 spans the hemisphere and does NOT vanish with the beam's cosine — measured, that
  // inflated the beam reading by 5 % at the zenith and 17 % at 1 degrees, growing exactly as the sun
  // dropped. An irradiance meter must measure irradiance, not a scene object's total response.
  //
  // This is an INSTRUMENT, not a scene object, so it is not the per-material lighting exception the
  // overhaul exists to delete. It is never rendered into a frame the user sees.
  const probeCard = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.18, 0.18, 0.18),
      roughness: 1,
      metalness: 0,
      specularIntensity: 0,
      side: THREE.DoubleSide,
    }),
  );
  probeCard.position.copy(PROBE_ORIGIN);
  probeCard.frustumCulled = false;
  probeCard.layers.set(PROBE_LAYER);

  const probeTarget = new THREE.WebGLRenderTarget(PROBE_SIZE, PROBE_SIZE, {
    type: THREE.HalfFloatType,
  });
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  probeCamera.layers.set(PROBE_LAYER);
  const pixels = new Uint16Array(PROBE_SIZE * PROBE_SIZE * 4);

  /** Decode an IEEE-754 half-float. `readRenderTargetPixels` hands back the raw 16-bit words. */
  const halfToFloat = (h: number): number => {
    const sign = (h & 0x8000) !== 0 ? -1 : 1;
    const exponent = (h & 0x7c00) >> 10;
    const fraction = h & 0x03ff;
    if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024);
    if (exponent === 0x1f) return fraction !== 0 ? NaN : sign * Infinity;
    return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
  };

  /** Render the card alone and average its linear radiance. Nothing here is tone-mapped: three only
   *  applies tone mapping when the destination is the canvas, so a render target IS linear HDR. */
  const shootCard = (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    normal: THREE.Vector3,
  ): Rgb => {
    probeCard.lookAt(PROBE_ORIGIN.clone().add(normal));
    probeCard.updateMatrixWorld();
    probeCamera.position.copy(PROBE_ORIGIN).addScaledVector(normal, 3);
    probeCamera.lookAt(PROBE_ORIGIN);
    probeCamera.updateMatrixWorld();

    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(probeTarget);
    renderer.render(scene, probeCamera);
    renderer.readRenderTargetPixels(probeTarget, 0, 0, PROBE_SIZE, PROBE_SIZE, pixels);
    renderer.setRenderTarget(previousTarget);

    const out: Rgb = [0, 0, 0];
    const n = PROBE_SIZE * PROBE_SIZE;
    for (let i = 0; i < n; i++) {
      out[0] += halfToFloat(pixels[i * 4]);
      out[1] += halfToFloat(pixels[i * 4 + 1]);
      out[2] += halfToFloat(pixels[i * 4 + 2]);
    }
    return [out[0] / n, out[1] / n, out[2] / n];
  };

  const measure = ({
    renderer,
    scene,
    sunDirection,
    directionalLights,
  }: MeasureOptions): LightingMeasurement => {
    // Save everything we are about to poke, so the live scene is untouched afterwards.
    const savedIntensities = directionalLights.map((l) => l.intensity);
    const savedLightLayers = directionalLights.map((l) => l.layers.mask);
    const savedEnvIntensity = scene.environmentIntensity;
    const savedShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const wasCardInScene = probeCard.parent !== null;

    // Nothing but the card is on PROBE_LAYER, so each shot draws exactly one quad. The lights have
    // to be able to see it, and the shadow map must not re-render the world six times for a card
    // 4 km above every caster.
    directionalLights.forEach((l) => l.layers.enable(PROBE_LAYER));
    renderer.shadowMap.autoUpdate = false;
    if (!wasCardInScene) scene.add(probeCard);

    // A sun-facing card is exactly vertical when the sun is on the horizon, which is a perfectly
    // meaningful reading (the beam is unforeshortened). Only fall back to "up" once the sun has set,
    // where a sun-facing card would be staring at the ground.
    const sunFacingNormal =
      sunDirection.y >= 0 ? sunDirection.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const upNormal = new THREE.Vector3(0, 1, 0);

    const withSources = (beam: boolean, sky: boolean) => {
      directionalLights.forEach((l, i) => {
        l.intensity = beam ? savedIntensities[i] : 0;
      });
      scene.environmentIntensity = sky ? savedEnvIntensity : 0;
    };

    withSources(true, false);
    const sunFacingBeam = shootCard(renderer, scene, sunFacingNormal);
    const horizontalBeam = shootCard(renderer, scene, upNormal);

    withSources(false, true);
    const sunFacingSky = shootCard(renderer, scene, sunFacingNormal);
    const horizontalSky = shootCard(renderer, scene, upNormal);

    withSources(true, true);
    const sunFacingAll = shootCard(renderer, scene, sunFacingNormal);
    const horizontalAll = shootCard(renderer, scene, upNormal);

    // Restore. The probe is a measurement, not a mutation.
    directionalLights.forEach((l, i) => {
      l.intensity = savedIntensities[i];
      l.layers.mask = savedLightLayers[i];
    });
    scene.environmentIntensity = savedEnvIntensity;
    renderer.shadowMap.autoUpdate = savedShadowAutoUpdate;
    if (!wasCardInScene) scene.remove(probeCard);

    const skyH = luminance(horizontalSky);
    const skyF = luminance(sunFacingSky);
    return {
      sunFacingBeam,
      sunFacingSky,
      sunFacingAll,
      horizontalBeam,
      horizontalSky,
      horizontalAll,
      ratioHorizontal: skyH > 0 ? luminance(horizontalBeam) / skyH : 0,
      ratioSunFacing: skyF > 0 ? luminance(sunFacingBeam) / skyF : 0,
    };
  };

  return {
    measure,
    dispose: () => {
      probeCard.geometry.dispose();
      (probeCard.material as THREE.Material).dispose();
      probeTarget.dispose();
    },
  };
};
