import { ShaderMaterial } from "three";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";

/** The vignette (`vignette`): the corners of the frame darken softly, rounder than the frame, like a plate in an old storybook. */
const FRAGMENT = /* glsl */ `
uniform sampler2D tColour;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec4 colour = texture2D(tColour, vUv);
  vec2 off = (vUv - 0.5) * vec2(sqrt(uAspect), 1.0 / sqrt(uAspect));
  float edge = smoothstep(0.32, 0.85, length(off) * 1.25);
  gl_FragColor = vec4(colour.rgb * (1.0 - 0.32 * edge * edge), colour.a);
}
`;

export const VIGNETTE_ART: FeatureArt = {
  feature: "vignette",
  passes: [
    {
      id: "vignette",
      stage: "post",
      // Last, over every other effect, as a frame round the picture.
      order: 1000,
      create: () => {
        const quad = new FullScreen(
          new ShaderMaterial({
            uniforms: { tColour: { value: null }, uAspect: { value: 1 } },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: FRAGMENT,
          }),
        );
        return {
          render: ({ gl, colour, output, width, height }) => {
            quad.material.uniforms.tColour.value = colour;
            quad.material.uniforms.uAspect.value = width / height;
            quad.render(gl, output);
          },
          dispose: () => quad.dispose(),
        };
      },
    },
  ],
};
