import { abs, dot, float, max, pow, reflect, vec3 } from "three/tsl";
import type { FeatureArt } from "../feature-art";
import type { Node } from "three/webgpu";
import { skyAlong } from "../sky/sky";
import { waterView, type WaterStep } from "./surface";

/*
 * The sky mirrored: the sky's colour along the reflected ray, as the dome
 * draws it (`skyAlong`, from the sky's own uniforms), and as much of it as
 * water really reflects: little looking straight down, nearly all at a
 * grazing look (Schlick's Fresnel, for water's index). It turns on the key
 * light's glint off the surface (the sun by day, the moon by night), which
 * the water's material lights (`water.ts`).
 */

/** The direction the surface mirrors, kept above the horizon: a ripple tipped past it still shows the sky low down. */
export function mirrored(normal: Node<"vec3">): Node<"vec3"> {
  const ray = reflect(waterView.negate(), normal);
  return vec3(ray.x, abs(ray.y), ray.z);
}

export const SKY_REFLECTION_STEP: WaterStep = {
  feature: "skyReflection",
  surface: (surface, { air, sky }) => {
    const facing = max(dot(waterView, surface.normal), 0);
    return {
      ...surface,
      reflect: skyAlong(air, sky, mirrored(surface.normal)),
      fresnel: pow(float(1).sub(facing), 5).mul(0.98).add(0.02),
      glint: float(1),
    };
  },
};

export const SKY_REFLECTION_ART: FeatureArt = { feature: "skyReflection" };
