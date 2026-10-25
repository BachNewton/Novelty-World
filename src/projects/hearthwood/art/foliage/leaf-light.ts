import { diffuseColor, dot, float, max, normalWorld, normalize, positionWorld, cameraPosition, pow, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt, ReflectedLight } from "../feature-art";

/*
 * Light through leaves: a leaf with the key light behind it glows, deeper in
 * its own colour, brightest looking straight towards the light, which is the
 * golden-hour forest. How much gets through comes from how the leaf faces:
 * one turned away from the light (the far side of a crown, lit from behind)
 * lets most through, one facing it lets little, so the thin rim of a crown
 * and a fern's frond shine and the near face stays as it is. It reads no
 * shadow map: a crown's heart is dark already, its own shadow in the map.
 */

function leafLight(light: ReflectedLight, air: AtmosphereUniforms): ReflectedLight {
  const view = normalize(positionWorld.sub(cameraPosition));
  const toLight = max(dot(view, air.uHwSunDir), 0);
  const glow = toLight.mul(toLight).mul(0.5).add(pow(toLight, 8).mul(1.8)).add(0.1);
  const through = max(dot(normalWorld, air.uHwSunDir).negate(), 0).mul(0.5).add(0.2);
  const albedo = diffuseColor.rgb;
  // What a leaf lets through is its own colour, deepened: its strongest channel kept, the others thinned.
  const deep: Node<"vec3"> = albedo.mul(albedo).div(max(max(albedo.r, albedo.g), max(albedo.b, float(0.02))));
  const glowing = air.uHwKeyLight.mul(deep).mul(through.mul(glow).mul(1 / Math.PI));
  return { direct: light.direct.add(vec3(glowing)), indirect: light.indirect };
}

export const LEAF_LIGHT_ART: FeatureArt = {
  feature: "leafLight",
  stages: [{ kinds: ["foliage"], light: (light, { air }) => leafLight(light, air) }],
};
