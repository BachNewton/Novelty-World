import { BRDF_Lambert, cameraPosition, cameraViewMatrix, diffuseColor, dot, float, max, mix, normalView, positionWorld, smoothstep, vec2, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt, ReflectedLight } from "../feature-art";
import { typed } from "../tsl";
import { CLOUD_FIELD, cloudCoverage, updateCloudField } from "./cloud-field";
import { FIRE, updateFire } from "./fire";

/*
 * The clouds' shadows on the land (`cloudShadows`): each point follows the
 * key light up to the clouds' base and reads the shared cloud field there
 * (`cloud-field.ts`), so a shadow lies under its cloud and falls true at any
 * height of ground; the key light is dimmed by as much cloud as stands in
 * its way. Analytic, with no map: one look at the field per pixel. Far off,
 * where a cloud's shadow would be finer than the land can show, it eases
 * to the clouds' average shade. Only the sun's or the moon's light is
 * shaded: the fire's is worked out again here (as the storybook light gives
 * it) and kept whole.
 */

/** How much of the key light a full cloud keeps back: heaped clouds more than thin layers. */
const DEPTH = { layered: 0.5, heaped: 0.72 } as const;
/** How far off the shadows ease into the clouds' average shade, in metres. */
const FAR = [6000, 24000] as const;
/** The fire's light as the campfire shines it (its `distance` and `decay`), and the storybook light's wrap. */
const FIRE_REACH = 26;
const WRAP = 0.35;

/** How much of the key light the clouds let through to this point. */
function cloudShade(air: AtmosphereUniforms): Node<"float"> {
  const sun = air.uHwSunDir;
  const shape = CLOUD_FIELD.shape;
  const rise = max(shape.z.sub(positionWorld.y), 0).div(max(sun.y, 0.08));
  const up = positionWorld.xz.add(vec2(sun.x, sun.z).mul(rise));
  const away = positionWorld.xz.sub(cameraPosition.xz).length();
  const cover = mix(cloudCoverage(up, 0.06), shape.x, smoothstep(FAR[0], FAR[1], away));
  const depth = mix(float(DEPTH.layered), float(DEPTH.heaped), shape.y);
  return float(1).sub(cover.mul(depth));
}

/** The fire's share of the direct light, as the storybook light gives it, so it can be spared. */
function fireDirect(): Node<"vec3"> {
  const toFire = FIRE.position.sub(positionWorld);
  const distance = toFire.length();
  const dirView = cameraViewMatrix.mul(vec4(toFire.div(max(distance, 1e-3)), 0)).xyz;
  const wrapped = dot(normalView, dirView).add(WRAP).div(1 + WRAP).clamp();
  const falloff = float(1).div(max(distance.mul(distance), 0.01)).mul(float(1).sub(distance.div(FIRE_REACH).pow(4)).clamp().pow(2));
  return FIRE.light.mul(falloff).mul(wrapped).mul(typed<"vec3">(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
}

function shaded({ direct, indirect }: ReflectedLight, air: AtmosphereUniforms): ReflectedLight {
  const fire = fireDirect().min(direct);
  return { direct: fire.add(direct.sub(fire).mul(cloudShade(air))), indirect };
}

export const CLOUD_SHADOWS_ART: FeatureArt = {
  feature: "cloudShadows",
  stages: [{ kinds: ["land", "ground", "foliage", "solid"], light: (light, { air }) => shaded(light, air) }],
  frame: (frame) => {
    updateCloudField(frame);
    updateFire(frame);
  },
};
