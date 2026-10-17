import { Color } from "three";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { moonPhaseLight } from "./sky-light";
import { SKY_NOISE_GLSL } from "./sky-noise";
import { skyColours } from "./tokens";

/*
 * The Milky Way (`milkyWay`): the galaxy's band where it really lies among
 * the stars, so from the north it arches through Cassiopeia and Cygnus
 * overhead on autumn evenings and lies low in spring, with the galaxy's
 * bright centre barely above the southern horizon in summer. A soft glow
 * of clouds broken by a dark lane of dust, faint, and only on dark nights:
 * twilight and a bright moon wash it out.
 */

const uniforms = {
  uHwMilkyWay: { value: new Color() },
};

/** The galaxy's north pole and its centre among the stars (right ascension and declination as a direction on the celestial sphere). */
const POLE = galactic(192.86, 27.13);
const CENTRE = galactic(266.4, -28.94);

function galactic(rightAscension: number, declination: number): string {
  const a = (rightAscension * Math.PI) / 180;
  const d = (declination * Math.PI) / 180;
  return `vec3(${(Math.cos(d) * Math.cos(a)).toFixed(5)}, ${(Math.cos(d) * Math.sin(a)).toFixed(5)}, ${Math.sin(d).toFixed(5)})`;
}

const HEAD = /* glsl */ `
uniform vec3 uHwMilkyWay;
${SKY_NOISE_GLSL}
`;

const COLOUR = /* glsl */ `
  vec3 dir = normalize(vHwWorld - cameraPosition);
  // Nothing to draw while the night is too light for it.
  if (dir.y > -0.02 && uHwMilkyWay.g > 0.0) {
    vec3 c = dir * uCelestial;
    vec3 pole = ${POLE};
    vec3 centre = ${CENTRE};
    float latitude = dot(c, pole);
    float longitude = atan(dot(c, cross(pole, centre)), dot(c, centre));
    float spread = 0.15 + 0.06 * hwSkyNoise3(c * 3.0);
    float band = exp(-latitude * latitude / (spread * spread));
    float bulge = exp(-longitude * longitude / 0.5 - latitude * latitude / 0.03);
    float clouds = hwSkyFbm3(c * 7.0);
    float lane = exp(-pow((latitude - 0.03 * sin(longitude * 3.0)) / 0.035, 2.0)) * smoothstep(0.35, 0.7, hwSkyFbm3(c * 11.0 + 4.0)) * (1.0 - 0.6 * abs(longitude) / 3.1416);
    float glow = (band * (0.35 + 1.1 * clouds * clouds) + 1.4 * bulge * clouds) * (1.0 - 0.8 * lane);
    hwColour += uHwMilkyWay * glow * smoothstep(-0.02, 0.3, dir.y);
  }
`;

/** How bright the band's glow is on a dark night, at the sky's own brightness. */
const GLOW = 0.05;

export const MILKY_WAY_ART: FeatureArt = {
  feature: "milkyWay",
  uniforms,
  chunks: [{ kinds: ["sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day }) => {
    const { sun, moon } = day.sky;
    const dark = 1 - smooth(-16, -9, sun.elevation);
    const moonWash = 1 - 0.85 * moonPhaseLight(moon) * smooth(-2, 10, moon.elevation);
    uniforms.uHwMilkyWay.value.copy(skyColours()["milky-way"]).multiplyScalar(GLOW * dark * moonWash);
  },
};
