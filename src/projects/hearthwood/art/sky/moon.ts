import { Vector3 } from "three";
import { cross, dot, exp, float, max, mix, smoothstep, sqrt, uniform, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { celestialFrame } from "../../engine/astronomy";
import { CALENDAR } from "../../engine/calendar";
import type { FeatureArt } from "../feature-art";
import { lightColourThroughAir, smooth } from "../light/sun";
import { colourUniform, typed } from "../tsl";
import { followSky, onlyWhere, skyDirection, skyFrame, skyNoise3 } from "./sky-nodes";
import { skyColours } from "./tokens";

/*
 * The moon (`moon`): a lit sphere, so its phase is the sun lighting it from
 * where the sun really is, never a drawn crescent. Each pixel of its disc
 * finds the point of the sphere it sees and lights it by the sun's true
 * direction, so a full moon stands opposite the sun and a crescent's horns
 * point away from it. Its face keeps the same dark seas towards the world,
 * turned with the sky's pole as it crosses; its dark side holds a faint
 * earthshine while it is a thin crescent; low in the sky it dims and warms
 * through the air; and in haze a soft halo spreads round it. It is drawn
 * about three times life, so it reads as a storybook's moon.
 */

const towards = uniform(new Vector3(0, -1, 0));
/** The sun's direction, which lights it. */
const sunward = uniform(new Vector3(0, 1, 0));
/** Which way its north is on the sky: towards the celestial pole. */
const pole = uniform(new Vector3(0, 1, 0));
const light = colourUniform();
const earthshine = colourUniform();
const halo = colourUniform();
const highland = colourUniform();
const mare = colourUniform();

/** The moon's angular radius, in radians: about three times life. */
const RADIUS = 0.014;

/** How bright the moon's face is drawn by night, and by day, when the eye is set for the bright sky. */
const NIGHT_FACE = 0.75;
const DAY_FACE = 0.45;

function moon(sky: Node<"vec3">): Node<"vec3"> {
  const dir = skyDirection();
  const facing = dot(dir, towards);
  const nearby = facing.greaterThan(0.95);
  return onlyWhere(nearby, sky, (colour) => {
    const east = cross(pole, towards).normalize();
    const north = cross(towards, east);
    const p = vec2(dot(dir, east), dot(dir, north)).div(RADIUS);
    const rr = dot(p, p);
    const edge = skyFrame.pixel.mul(1.2 / RADIUS);
    const disc = float(1).sub(smoothstep(float(1).sub(edge), edge.add(1), sqrt(rr)));
    const out = sqrt(max(float(1).sub(rr), 0));
    // The point of the sphere this pixel sees, facing the eye.
    const normal = east.mul(p.x).add(north.mul(p.y)).sub(towards.mul(out));
    const lit = dot(normal, sunward);
    // Moon dust throws light back towards the sun, so its face stays bright to the rim (Lommel and Seeliger) and the terminator is a soft line.
    const shine = smoothstep(-0.04, 0.12, lit).mul(max(lit, 0)).div(max(lit, 0).add(out).add(0.05)).mul(2);
    const face = vec3(p, out);
    const seas = smoothstep(
      0.48,
      0.66,
      typed<"float">(skyNoise3(face.mul(2.1).add(vec3(3.7, 1.2, 0.4))))
        .mul(0.62)
        .add(typed<"float">(skyNoise3(face.mul(4.7).add(8.1))).mul(0.38)),
    );
    const craters = typed<"float">(skyNoise3(face.mul(13))).mul(0.18);
    const albedo = mix(highland, mare, seas).mul(craters.add(0.91));
    const onFace = albedo.mul(light.mul(shine).add(earthshine.mul(float(1).sub(smoothstep(-0.1, 0.2, lit)))));
    const apart = dir.sub(towards).length();
    // Faded out before the edge of what is drawn round the moon, so it ends in no line.
    const glow = halo
      .mul(
        exp(apart.mul(-30))
          .mul(0.7)
          .add(exp(apart.mul(-6)).mul(0.3)),
      )
      .mul(smoothstep(0.95, 0.975, facing));
    return colour.add(onFace.mul(disc)).add(glow);
  });
}

export const MOON_ART: FeatureArt = {
  feature: "moon",
  stages: [{ kinds: ["sky"], colour: moon }],
  frame: ({ day: state, atmosphere, sky }) => {
    followSky(sky);
    const { sun, moon: m } = state.sky;
    const colours = skyColours();
    towards.value.set(m.direction.x, m.direction.y, m.direction.z);
    sunward.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
    const p = celestialFrame(state.date.realDayOfYear, state.date.hour, CALENDAR.latitude).pole;
    pole.value.set(p.x, p.y, p.z);

    // By day the eye is set for the bright sky and the moon is a pale ghost in it; by night it is the brightest thing up there.
    const day = smooth(-8, -2, sun.elevation);
    const face = NIGHT_FACE + (DAY_FACE - NIGHT_FACE) * day;
    const air = lightColourThroughAir(m.direction);
    const dimmed = smooth(-1, 4, m.elevation) * (0.35 + 0.65 * smooth(0, 18, m.elevation));
    light.value.setRGB(air[0], air[1], air[2]).multiplyScalar(face * dimmed);
    // Earthshine: the earth, almost full as seen from a thin crescent, lights the moon's dark side.
    const crescent = Math.pow(1 - m.illuminated, 3);
    earthshine.value.copy(colours.earthshine).multiplyScalar(0.5 * crescent * dimmed * (1 - smooth(-6, 0, sun.elevation)));
    // A halo in haze, as bright as the moon is full; thicker air spreads more light round it.
    const haze = Math.min(1, atmosphere.uHwHazeDensity.value / 0.003);
    halo.value.copy(colours["moon-halo"]).multiplyScalar((0.04 + 0.22 * haze) * m.illuminated * m.illuminated * dimmed * (1 - day));
    highland.value.copy(colours["moon-highland"]);
    mare.value.copy(colours["moon-mare"]);
  },
};
