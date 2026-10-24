import { abs, float, mat2, min, mix, smoothstep, step, uniform, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { groundSeason } from "../../engine/seasons";
import { valueNoise } from "../atmosphere";
import type { FeatureArt } from "../feature-art";
import { typed } from "../tsl";
import { waterDepth, waterFalling, waterMoving, waterP, type WaterStep } from "./surface";

/*
 * Winter ice at the edges of lakes and rivers. It grows out from the shore
 * into deeper water as winter comes on and melts back in spring, by the
 * seasons' own ice on the ground's calendar (`engine/seasons.ts`), so the
 * water freezes as the land's snow lies. Running water freezes only along its
 * edges, and a falling river never. The ice's edge wanders, it is pale and
 * matt with a dusting of snow and dark cracks, and its surface is flat, so
 * no ripple crosses it.
 */

/** How deep the water is that the ice reaches out over at its greatest, in metres. */
const ICE_REACH = 2.2;

const cover = uniform(0);
const noise = (p: Node<"vec2">): Node<"float"> => typed<"float">(valueNoise(p));

/** How frozen the surface is here, 0 to 1. */
function frozen(): Node<"float"> {
  const reach = cover.mul(ICE_REACH).mul(float(1).sub(waterMoving.mul(0.8))).mul(float(1).sub(waterFalling));
  const wander = noise(waterP.mul(0.07)).sub(0.5).mul(1.4).add(noise(waterP.mul(0.5)).sub(0.5).mul(0.25));
  const edge = reach.add(cover.mul(wander));
  return float(1).sub(smoothstep(edge.sub(0.05), edge, waterDepth)).mul(step(0.001, reach));
}

export const ICE_STEP: WaterStep = {
  feature: "lakeIce",
  surface: (surface, { shallow, foam }) => {
    const ice = frozen().toVar();
    const p = waterP;
    const dust = smoothstep(0.3, 0.75, noise(p.mul(0.7)).mul(0.6).add(noise(p.mul(3.1)).mul(0.4)));
    // Fine dark cracks, straighter than the noise they come from: two ridges of it, crossing.
    const ridgeA = abs(noise(p.mul(vec2(0.9, 0.25)).add(3.1)).sub(0.5));
    const ridgeB = abs(noise(mat2(0.6, -0.8, 0.8, 0.6).mul(p).mul(vec2(0.9, 0.3)).add(7.7)).sub(0.5));
    const crack = float(1).sub(float(1).sub(smoothstep(0, 0.018, min(ridgeA, ridgeB))).mul(float(1).sub(dust)).mul(0.22));
    // The rim where the ice meets the open water is wet and darker.
    const rim = smoothstep(0, 0.25, ice).mul(float(1).sub(smoothstep(0.25, 0.9, ice)));
    const pale = mix(mix(shallow, foam, 0.7), foam, dust).mul(crack).mul(float(1).sub(rim.mul(0.25)));
    return {
      normal: mix(surface.normal, vec3(0, 1, 0), ice).normalize(),
      body: mix(surface.body, pale, ice),
      reflect: surface.reflect,
      fresnel: mix(surface.fresnel, 0.05, ice),
      foam: surface.foam.mul(float(1).sub(ice)),
      glint: surface.glint.mul(float(1).sub(ice.mul(0.85))),
      ice,
    };
  },
};

export const ICE_ART: FeatureArt = {
  feature: "lakeIce",
  frame: ({ day }) => {
    cover.value = groundSeason(day.date.realDayOfYear).ice;
  },
};
