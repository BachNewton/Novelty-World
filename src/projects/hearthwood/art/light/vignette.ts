import { float, screenSize, screenUV, smoothstep, vec2, vec4 } from "three/tsl";
import type { FeatureArt } from "../feature-art";

/** The vignette (`vignette`): the corners of the frame darken softly, rounder than the frame, like a plate in an old storybook. Last of the steps, as a frame round the picture. */
export const VIGNETTE_ART: FeatureArt = {
  feature: "vignette",
  post: [
    {
      id: "vignette",
      order: 100,
      build: ({ colour }) => {
        const aspect = screenSize.x.div(screenSize.y).sqrt();
        const off = screenUV.sub(0.5).mul(vec2(aspect, float(1).div(aspect)));
        const edge = smoothstep(0.32, 0.85, off.length().mul(1.25));
        return vec4(colour.rgb.mul(float(1).sub(edge.mul(edge).mul(0.32))), colour.a);
      },
    },
  ],
};
