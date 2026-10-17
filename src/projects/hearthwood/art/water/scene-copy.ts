import { HalfFloatType, LinearFilter, ShaderMaterial, WebGLRenderTarget, type PerspectiveCamera, type Texture } from "three";
import { DEPTH_GLSL } from "../depth";
import type { PassFrame } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";

/*
 * A copy of the scene behind the water, for the water to read while it is
 * drawn: the colour as the screen shows it, and in its alpha the distance
 * along the view, in metres (the reversed depth read through `depth.ts`;
 * nothing drawn reads as `SKY_DISTANCE`). Made by a pass of the `opaque`
 * stage, after everything but the water is drawn, so the water is never in
 * it. Each feature that reads the scene owns its own copy, at the size it
 * needs, so it is allocated only while that feature is on.
 */

/** The distance a pixel with nothing drawn on it is copied as: further than anything drawn, and within a half float. */
export const SKY_DISTANCE = 65000;

export const COPY_FRAGMENT = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
${DEPTH_GLSL}
void main() {
  float depth = texture2D(tDepth, vUv).r;
  float distance = hwIsFar(depth) ? ${SKY_DISTANCE.toFixed(1)} : min(hwLinearDepth(depth, uNear, uFar), ${SKY_DISTANCE.toFixed(1)});
  gl_FragColor = vec4(texture2D(tColour, vUv).rgb, distance);
}
`;

/** The frame as the screen shows it (tone mapped and encoded) back to the linear light the water's shader works in, near enough: the tone mapping is all but straight below the highlights. */
export const DISPLAY_TO_LINEAR_GLSL = /* glsl */ `
#ifndef HW_DISPLAY_TO_LINEAR
#define HW_DISPLAY_TO_LINEAR
vec3 hwDisplayToLinear(vec3 shown, float exposure) {
  vec3 linear = mix(shown / 12.92, pow((shown + 0.055) / 1.055, vec3(2.4)), step(0.04045, shown));
  return linear / exposure;
}
#endif
`;

export class SceneCopy {
  private readonly target: WebGLRenderTarget;
  private readonly quad: FullScreen;

  /** `scale` is the copy's size against the drawing buffer. */
  constructor(private readonly scale: number) {
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.quad = new FullScreen(
      new ShaderMaterial({
        uniforms: { tColour: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
        vertexShader: FULL_SCREEN_VERTEX,
        fragmentShader: COPY_FRAGMENT,
      }),
    );
  }

  get texture(): Texture {
    return this.target.texture;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }

  /** Copies the scene drawn so far. */
  copy({ gl, colour, depth, camera }: PassFrame): void {
    if (!colour || !depth) throw new Error("The scene's copy for the water needs the scene's colour and depth: its pass must be of the opaque stage and read depth");
    const view = camera as PerspectiveCamera;
    const uniforms = this.quad.material.uniforms;
    uniforms.tColour.value = colour;
    uniforms.tDepth.value = depth;
    uniforms.uNear.value = view.near;
    uniforms.uFar.value = view.far;
    this.quad.render(gl, this.target);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.dispose();
  }
}

