import { Vector3 } from "three";
import { cameraPosition, exp, float, max, min, positionWorld, uniform } from "three/tsl";
import type { Node } from "three/webgpu";
import type { FeatureArt } from "../feature-art";
import { REGION_ABSORPTION, WATER_SCATTER, type Absorption } from "./absorption";

/*
 * Under the water. The scene tells the water where its surface lies above
 * the eye (`setWaterAtEye`, from the engine's water table where the camera
 * is, and the absorption of the region's water there); with the eye under
 * it, everything drawn fades into the water's own colour by how far light
 * travels through water to reach the eye (only the stretch below the
 * surface counts, for anything seen up through it), and the water's colour
 * darkens the deeper the eye goes. It is a colour stage of every kind; the
 * campfire and the fireflies make their own light and are never under water.
 */

/** Where the water's surface lies at the eye, if the eye is over water at all. */
export interface WaterAtEye {
  level: number | null;
  absorb: Absorption;
}

const eye: WaterAtEye = { level: null, absorb: REGION_ABSORPTION.greenwood };

/** The scene says where the water is at the eye, every frame: its surface's height (null on dry land) and its absorption. */
export function setWaterAtEye(level: number | null, absorb: Absorption): void {
  eye.level = level;
  eye.absorb = absorb;
}

/** Far below anything, for an eye that is over dry land. */
const NO_WATER = -1e9;

const eyeWater = uniform(NO_WATER);
const eyeAbsorb = uniform(new Vector3(...REGION_ABSORPTION.greenwood));

/** A colour drawn at this pixel, seen by an eye under the water: lit by the light come down through the water above the eye. */
function underwater(colour: Node<"vec3">, light: Node<"vec3">): Node<"vec3"> {
  const ray = positionWorld.sub(cameraPosition);
  const whole = ray.length();
  // With the eye above the water the depth is 0, so nothing is fogged and the colour comes back as it was, with no select: selecting between this and the colour drew the solids and plants black on dry land.
  const depth = max(eyeWater.sub(cameraPosition.y), 0);
  // All of the ray when it ends below the surface (it never climbs that far), else the stretch under it.
  const wet = min(whole, whole.mul(depth).div(max(ray.y, 1e-4)));
  const down = exp(eyeAbsorb.add(WATER_SCATTER).mul(depth).negate());
  const extinct = eyeAbsorb.add(WATER_SCATTER);
  const through = exp(extinct.mul(wet).negate());
  return colour.mul(through).add(light.mul(down).mul(float(WATER_SCATTER).div(extinct)).mul(float(1).sub(through)));
}

export const UNDERWATER_ART: FeatureArt = {
  feature: "underwaterFog",
  stages: [{ kinds: ["land", "ground", "foliage", "solid", "water", "sky"], colour: (colour, { air }) => underwater(colour, air.uHwSkyLight.add(air.uHwSunLight)) }],
  frame: () => {
    eyeWater.value = eye.level ?? NO_WATER;
    eyeAbsorb.value.set(...eye.absorb);
  },
};
