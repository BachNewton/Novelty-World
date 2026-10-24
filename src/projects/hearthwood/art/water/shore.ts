import { float, max, sin, smoothstep } from "three/tsl";
import { valueNoise } from "../atmosphere";
import type { FeatureArt } from "../feature-art";
import { typed } from "../tsl";
import { waterDepth, waterMoving, waterP, type WaterStep } from "./surface";

/*
 * The shore, drawn as a storybook draws it: where the water is very shallow
 * it brightens to a soft edge, and a line of foam laps along the very edge,
 * breathing in and out, broken into lace, so every shoreline reads against
 * the land at a glance. A river is shallow all across, so only its very
 * edge brightens.
 */

export const SHORE_STEP: WaterStep = {
  feature: "shoreHighlight",
  surface: (surface, { air, foam }) => {
    const t = air.uHwTime;
    const breath = sin(t.mul(0.8).add(waterP.x.mul(0.3)).add(waterP.y.mul(0.2)));
    const reach = breath.mul(0.12).add(0.28).mul(float(1).sub(waterMoving.mul(0.7)));
    const edge = float(1).sub(smoothstep(0, reach, waterDepth));
    const glow = float(1).sub(smoothstep(0, reach.mul(2), waterDepth));
    // A second, fainter line a little further out, where the last wave reached.
    const outer = smoothstep(0.08, 0, waterDepth.sub(reach.mul(1.6)).abs()).mul(0.45);
    const lace = smoothstep(0.45, 0.75, typed<"float">(valueNoise(waterP.mul(2.2).add(t.mul(0.15)))));
    return {
      ...surface,
      body: surface.body.add(foam.mul(glow.mul(0.14))),
      foam: max(surface.foam, max(edge, outer).mul(lace.mul(0.5).add(0.5)).mul(0.85)),
    };
  },
};

export const SHORE_ART: FeatureArt = { feature: "shoreHighlight" };
