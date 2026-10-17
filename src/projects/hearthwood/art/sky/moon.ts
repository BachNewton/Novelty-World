import { Color, Vector3 } from "three";
import { celestialFrame } from "../../engine/astronomy";
import { CALENDAR } from "../../engine/calendar";
import type { FeatureArt } from "../feature-art";
import { lightColourThroughAir, smooth } from "../light/sun";
import { SKY_NOISE_GLSL } from "./sky-noise";
import { skyColours } from "./tokens";

/*
 * The moon (`moon`): a lit sphere, so its phase is the sun lighting it from
 * where the sun really is, never a drawn crescent. Its face keeps the same
 * dark seas towards the world, turned with the sky's pole as it crosses;
 * its dark side holds a faint earthshine while it is a thin crescent; low
 * in the sky it dims and warms through the air, as a rising moon does; and
 * in haze a soft halo spreads round it. It is drawn a little larger than
 * life, so it reads as the moon in a storybook rather than a bright star.
 */

const uniforms = {
  uHwMoonDir: { value: new Vector3(0, -1, 0) },
  /** The sun's direction, which lights it. */
  uHwMoonSunDir: { value: new Vector3(0, 1, 0) },
  /** Which way its north is on the sky: towards the celestial pole. */
  uHwMoonNorth: { value: new Vector3(0, 1, 0) },
  /** The sunlight on its face, already as bright as the sky is drawn and coloured by the air below it. */
  uHwMoonLight: { value: new Color() },
  uHwMoonEarthshine: { value: new Color() },
  uHwMoonHalo: { value: new Color() },
  uHwMoonHighland: { value: new Color() },
  uHwMoonMare: { value: new Color() },
};

/** The moon's angular radius, in radians: about three times life. */
const RADIUS = 0.014;

/** How bright the moon's face is drawn by night, and by day, when the eye is set for the bright sky. */
const NIGHT_FACE = 0.75;
const DAY_FACE = 0.45;

const HEAD = /* glsl */ `
uniform vec3 uHwMoonDir;
uniform vec3 uHwMoonSunDir;
uniform vec3 uHwMoonNorth;
uniform vec3 uHwMoonLight;
uniform vec3 uHwMoonEarthshine;
uniform vec3 uHwMoonHalo;
uniform vec3 uHwMoonHighland;
uniform vec3 uHwMoonMare;
${SKY_NOISE_GLSL}
`;

const COLOUR = /* glsl */ `
  vec3 dir = normalize(vHwWorld - cameraPosition);
  vec3 east = normalize(cross(uHwMoonNorth, uHwMoonDir));
  vec3 north = cross(uHwMoonDir, east);
  vec2 p = vec2(dot(dir, east), dot(dir, north)) / ${RADIUS};
  float rr = dot(p, p);
  float facing = dot(dir, uHwMoonDir);
  if (facing > 0.0 && rr < 1.6) {
    float edge = 1.2 * uSkyPixel / ${RADIUS};
    float disc = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, sqrt(rr));
    float towards = sqrt(max(0.0, 1.0 - rr));
    vec3 normal = p.x * east + p.y * north - towards * uHwMoonDir;
    float sunward = dot(normal, uHwMoonSunDir);
    // The moon's dust throws light back towards the sun, so its face stays bright to the rim (Lommel and Seeliger) and the terminator is a soft line.
    float lit = smoothstep(-0.04, 0.12, sunward) * max(sunward, 0.0) / (max(sunward, 0.0) + towards + 0.05) * 2.0;
    vec3 face = vec3(p, towards);
    float seas = smoothstep(0.48, 0.66, 0.62 * hwSkyNoise3(face * 2.1 + vec3(3.7, 1.2, 0.4)) + 0.38 * hwSkyNoise3(face * 4.7 + 8.1));
    float craters = hwSkyNoise3(face * 13.0) * 0.18;
    vec3 albedo = mix(uHwMoonHighland, uHwMoonMare, seas) * (0.91 + craters);
    hwColour += disc * albedo * (uHwMoonLight * lit + uHwMoonEarthshine * (1.0 - smoothstep(-0.1, 0.2, sunward)));
  }
  float apart = length(dir - uHwMoonDir);
  hwColour += uHwMoonHalo * (exp(-apart * 30.0) * 0.7 + exp(-apart * 6.0) * 0.3) * step(0.0, facing);
`;

export const MOON_ART: FeatureArt = {
  feature: "moon",
  uniforms,
  chunks: [{ kinds: ["sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day: state, atmosphere }) => {
    const { sun, moon } = state.sky;
    const colours = skyColours();
    uniforms.uHwMoonDir.value.set(moon.direction.x, moon.direction.y, moon.direction.z);
    uniforms.uHwMoonSunDir.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
    const pole = celestialFrame(state.date.realDayOfYear, state.date.hour, CALENDAR.latitude).pole;
    uniforms.uHwMoonNorth.value.set(pole.x, pole.y, pole.z);

    // By day the eye is set for the bright sky and the moon is a pale ghost in it; by night it is the brightest thing up there.
    const day = smooth(-8, -2, sun.elevation);
    const face = NIGHT_FACE + (DAY_FACE - NIGHT_FACE) * day;
    const air = lightColourThroughAir(moon.direction);
    const dimmed = smooth(-1, 4, moon.elevation) * (0.35 + 0.65 * smooth(0, 18, moon.elevation));
    uniforms.uHwMoonLight.value.setRGB(air[0], air[1], air[2]).multiplyScalar(face * dimmed);
    // Earthshine: the earth, almost full as seen from a thin crescent, lights the moon's dark side.
    const crescent = Math.pow(1 - moon.illuminated, 3);
    uniforms.uHwMoonEarthshine.value.copy(colours.earthshine).multiplyScalar(0.5 * crescent * dimmed * (1 - smooth(-6, 0, sun.elevation)));
    // A halo in haze, as bright as the moon is full; thicker air spreads more light round it.
    const haze = Math.min(1, atmosphere.uHwHazeDensity.value / 0.003);
    const halo = (0.04 + 0.22 * haze) * moon.illuminated * moon.illuminated * dimmed * (1 - smooth(-8, -2, sun.elevation));
    uniforms.uHwMoonHalo.value.copy(colours["moon-halo"]).multiplyScalar(halo);
    uniforms.uHwMoonHighland.value.copy(colours["moon-highland"]);
    uniforms.uHwMoonMare.value.copy(colours["moon-mare"]);
  },
};
