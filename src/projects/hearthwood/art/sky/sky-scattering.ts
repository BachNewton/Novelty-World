import { Vector3, type DataTexture } from "three";
import type { FeatureArt } from "../feature-art";
import { SCATTERING_GLSL, tableTexture } from "./scattering-glsl";
import { skyTables } from "./scattering";
import { rgb, skyLighting, sunGlow } from "./sky-light";
import { skyColours } from "./tokens";

/*
 * The physical sky (`skyScattering`): the dome drawn per pixel from how the
 * air scatters the sun's and the moon's light (`scattering-glsl.ts`), with
 * the sun's disc in the colour the air leaves it, and the haze laid over
 * its foot just as it lies over the far land, so the two meet with no seam.
 * The water's shaders can ask it for the sky in a direction too.
 */

const uniforms = {
  uHwSkyTransmittance: { value: null as DataTexture | null },
  uHwSkyMultiple: { value: null as DataTexture | null },
  uHwSkySun: { value: new Vector3(0, 1, 0) },
  uHwSkySunLight: { value: new Vector3() },
  uHwSkySunGlow: { value: new Vector3(1, 1, 1) },
  uHwSkyMoon: { value: new Vector3(0, -1, 0) },
  uHwSkyMoonLight: { value: new Vector3() },
  uHwSkyAirglow: { value: new Vector3() },
  uHwSkyAltitude: { value: 100 },
  uHwSkySaturation: { value: 1 },
};

/** The sun's disc, a little larger than life, darker towards its rim, in the colour the air leaves its light. */
const DISC_GLSL = /* glsl */ `
vec3 hwSunDisc(vec3 dir) {
  float apart = length(dir - uHwSkySun);
  const float RADIUS = 0.0075;
  float inside = 1.0 - smoothstep(RADIUS * 0.85, RADIUS * 1.05, apart);
  float rim = sqrt(max(0.0, 1.0 - (apart / RADIUS) * (apart / RADIUS)));
  vec3 light = hwSkyTransmittanceTo(HW_PLANET + max(1.0, uHwSkyAltitude), uHwSkySun.y) * uHwSkySunLight;
  return light * inside * (0.45 + 0.55 * rim) * 12.0;
}
`;

export const SKY_SCATTERING_ART: FeatureArt = {
  feature: "skyScattering",
  uniforms,
  chunks: [
    { kinds: ["water"], fragmentHead: SCATTERING_GLSL },
    {
      kinds: ["sky"],
      fragmentHead: `${SCATTERING_GLSL}\n${DISC_GLSL}`,
      colour: /* glsl */ `
        vec3 dir = normalize(vHwWorld - cameraPosition);
        vec3 sky = hwSkyRadiance(dir) + hwSunDisc(dir);
        // The haze over the far land, along this direction, so the land and the sky meet in the same air.
        hwColour = mix(sky, hwHazeColour(dir), hwHazeAmount(cameraPosition, cameraPosition + dir * 60000.0));
      `,
    },
  ],
  frame: ({ day, camera }) => {
    if (uniforms.uHwSkyTransmittance.value === null) {
      const tables = skyTables();
      uniforms.uHwSkyTransmittance.value = tableTexture(tables.transmittance);
      uniforms.uHwSkyMultiple.value = tableTexture(tables.multiple);
    }
    const colours = skyColours();
    const lighting = skyLighting(day.sky.sun, day.sky.moon, rgb(colours.moonlight), rgb(colours.airglow), sunGlow(day.sky.sun, colours));
    uniforms.uHwSkySun.value.set(lighting.sun.direction.x, lighting.sun.direction.y, lighting.sun.direction.z);
    uniforms.uHwSkySunLight.value.fromArray(lighting.sun.light);
    uniforms.uHwSkySunGlow.value.fromArray(lighting.sun.glow ?? [1, 1, 1]);
    uniforms.uHwSkyMoon.value.set(lighting.moon.direction.x, lighting.moon.direction.y, lighting.moon.direction.z);
    uniforms.uHwSkyMoonLight.value.fromArray(lighting.moon.light);
    uniforms.uHwSkyAirglow.value.fromArray(lighting.airglow);
    uniforms.uHwSkyAltitude.value = camera.position.y;
    uniforms.uHwSkySaturation.value = lighting.saturation;
  },
};
