import { Vector3 } from "three";
import { acos, cameraPosition, degrees, dot, float, fract, pow, positionWorld, sin, smoothstep, uniform, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { Sun } from "../../engine/astronomy";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { colourUniform } from "../tsl";
import { SKY_INPUTS, type SkyInputs } from "./sky-inputs";
import { onlyWhere, skyDirection } from "./sky-nodes";

/*
 * Rainbows (`rainbow`): while it rains with the sun out, a bow stands
 * opposite the sun: the primary at 42° from the point straight opposite it,
 * red outside and violet in, a fainter secondary at about 51° with its
 * colours the other way round, the sky inside the primary a little brighter
 * and the band between the two (Alexander's band) a little darker. Only the
 * part of the circle above the horizon shows, so a high sun gives a low
 * bow, and above 42° none. It stands in the rain in front of whatever lies
 * past it, so it is drawn on the land beyond a little way off as well as on
 * the sky.
 *
 * The rain and the sun out come from `SKY_INPUTS`, which the engine's weather drives.
 */

/** How strong the bow is: the rain, the sun out, and the sun low enough to put the bow above the horizon. */
export function rainbowAt(sun: Sun, inputs: SkyInputs = SKY_INPUTS): number {
  return inputs.rain * inputs.sunOut * smooth(-1, 3, sun.elevation) * (1 - smooth(36, 42, sun.elevation));
}

const amount = uniform(0);
/** Where the sun is: the bow centres on the point opposite. */
const sunDir = uniform(new Vector3(0, 1, 0));
/** The sunlight the raindrops split. */
const sunLight = colourUniform();

/** The colours across a bow, from violet on its inner edge (0) to red on its outer (1), fading out at both edges. */
function bow(across: Node<"float">): Node<"vec3"> {
  const t = across.clamp(0, 1);
  const hue = float(1).sub(t).mul(0.76);
  const colour = fract(vec3(hue).add(vec3(0, 2 / 3, 1 / 3)))
    .mul(6)
    .sub(3)
    .abs()
    .sub(1)
    .clamp(0, 1);
  return colour.mul(pow(sin(t.mul(Math.PI)), 0.8));
}

/** A colour seen through the rain along a direction: the bows' light added, the sky inside brightened and Alexander's band darkened. */
function throughRain(colour: Node<"vec3">, dir: Node<"vec3">, share: Node<"float">): Node<"vec3"> {
  const angle = degrees(acos(dot(dir, sunDir.negate()).clamp(-1, 1)));
  // Each colour bends by its own angle: red outermost on the primary, innermost on the secondary.
  const primary = bow(angle.sub(40.3).div(2.3));
  const secondary = bow(float(53.6).sub(angle).div(3.4)).mul(0.42);
  const inside = float(1)
    .sub(smoothstep(38, 42, angle))
    .mul(0.08);
  const between = smoothstep(42.4, 43.4, angle)
    .mul(float(1).sub(smoothstep(49.2, 50.2, angle)))
    .mul(0.14);
  const bows = primary.add(secondary).mul(sunLight).mul(0.22);
  return colour.add(colour.mul(inside.sub(between)).add(bows).mul(share));
}

function onSky(sky: Node<"vec3">): Node<"vec3"> {
  const dir = skyDirection();
  return onlyWhere(amount.greaterThan(0), sky, (colour) => throughRain(colour, dir, amount.mul(smoothstep(-0.01, 0.03, dir.y))));
}

/** The bow is in the rain between the eye and what it sees, so only what lies a way off is seen through it. */
function onLand(lit: Node<"vec3">): Node<"vec3"> {
  const toEye = positionWorld.sub(cameraPosition);
  const distance = toEye.length();
  return onlyWhere(amount.greaterThan(0), lit, (colour) => throughRain(colour, toEye.div(distance), amount.mul(smoothstep(40, 260, distance))));
}

export const RAINBOW_ART: FeatureArt = {
  feature: "rainbow",
  stages: [
    { kinds: ["sky"], colour: onSky },
    { kinds: ["land", "ground", "foliage", "solid", "water"], colour: onLand },
  ],
  frame: ({ day, atmosphere }) => {
    const { sun } = day.sky;
    amount.value = rainbowAt(sun);
    sunDir.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
    sunLight.value.copy(atmosphere.uHwSunColor.value);
  },
};
