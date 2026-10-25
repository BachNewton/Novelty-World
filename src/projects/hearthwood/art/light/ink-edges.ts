import { PerspectiveCamera } from "three";
import { float, max, min, mix, perspectiveDepthToViewZ, screenSize, screenUV, smoothstep, uniform, vec2, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { FeatureArt } from "../feature-art";
import { colourUniform, typed } from "../tsl";

/*
 * Ink edges (`inkEdges`): a soft line where a near form stands in front of
 * what lies behind it, as a storybook's ink outlines its shapes: a trunk
 * against the meadow, Elliott against the far hills. It is read from depth
 * alone, four taps round each pixel: where any of them lies much further
 * off than the pixel itself, the pixel is on a silhouette's near side. The
 * line is the moment's shadow colour rather than black, thins and fades
 * with distance, so it rings only the forms near the eye and the far land
 * and its skyline never fill with lines.
 * It works on the scene's own light, before the tone curve and the bloom.
 */

/** How far the line reaches (metres): full near the eye, gone past it. */
const NEAR = 6;
const FAR = 140;
/** How much further behind, as a share of the pixel's own distance, a neighbour must lie to make an edge. */
const JUMP = 0.12;
const STRENGTH = 0.55;

const ink = colourUniform();
const near = uniform(0.1);
const far = uniform(1000);

/** Metres along the view from a depth as the depth buffer holds it. */
function distanceOf(depth: Node<"float">): Node<"float"> {
  return typed<"float">(perspectiveDepthToViewZ(depth, near, far)).negate();
}

export const INK_EDGES_ART: FeatureArt = {
  feature: "inkEdges",
  post: [
    {
      id: "ink-edges",
      order: -20,
      build: ({ colour, depthAt, viewZ }) => {
        const here = viewZ;
        const fade = float(1).sub(smoothstep(NEAR, FAR, here));
        // The line is a pixel and a half wide near the eye, under one far off.
        const width = mix(0.6, 1.5, fade);
        const step = vec2(width, width).div(screenSize);
        const behind = (dx: number, dy: number): Node<"float"> => distanceOf(depthAt(screenUV.add(step.mul(vec2(dx, dy))))).sub(here);
        const deepest = max(max(behind(1, 0), behind(-1, 0)), max(behind(0, 1), behind(0, -1)));
        const edge = smoothstep(here.mul(JUMP), here.mul(JUMP * 3), deepest);
        const line = edge.mul(fade).mul(STRENGTH);
        return { colour: vec4(mix(colour.rgb, min(colour.rgb, ink), line), colour.a) };
      },
    },
  ],
  frame: ({ atmosphere, camera }) => {
    ink.value.copy(atmosphere.uHwShadowTint.value).multiplyScalar(0.35);
    if (camera instanceof PerspectiveCamera) {
      near.value = camera.near;
      far.value = camera.far;
    }
  },
};
