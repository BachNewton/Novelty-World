import { Vector2, type Texture } from "three";
import type { FeatureArt } from "../feature-art";
import { DISPLAY_TO_LINEAR_GLSL, SceneCopy } from "./scene-copy";

/*
 * Refraction: the real bed seen through the water, from a copy of the scene
 * drawn before the water, its pixel moved by the ripples' normal, further
 * the deeper the water (a bed a hand below barely shifts). A moved pixel
 * that lies in front of the water (a reed, the shore's own edge, Elliott)
 * would pull something above the water into it, so there the straight-down
 * pixel is read instead.
 */

const uniforms = {
  uHwRefraction: { value: null as Texture | null },
  /** The drawing buffer's size, in pixels. */
  uHwRefractionSize: { value: new Vector2(1, 1) },
  /** How far across the screen one metre to the side moves at one metre away: half the projection's scale. */
  uHwRefractionFocal: { value: new Vector2(1, 1) },
  uHwRefractionExposure: { value: 1 },
};

const HEAD = /* glsl */ `
uniform sampler2D uHwRefraction;
uniform vec2 uHwRefractionSize;
uniform vec2 uHwRefractionFocal;
uniform float uHwRefractionExposure;
${DISPLAY_TO_LINEAR_GLSL}
`;

const SURFACE = /* glsl */ `
  vec2 straight = gl_FragCoord.xy / uHwRefractionSize;
  float away = -(viewMatrix * vec4(vHwWorld, 1.0)).z;
  vec3 bend = (viewMatrix * vec4(hwNormal, 0.0)).xyz;
  vec2 uv = straight + bend.xy * 0.45 * min(hwDepth, 2.0) * uHwRefractionFocal / away;
  vec4 behind = texture2D(uHwRefraction, uv);
  if (behind.a < away) behind = texture2D(uHwRefraction, straight);
  hwBed = hwDisplayToLinear(behind.rgb, uHwRefractionExposure);
`;

export const REFRACTION_ART: FeatureArt = {
  feature: "refraction",
  uniforms,
  chunks: [{ kinds: ["water"], fragmentHead: HEAD, surface: SURFACE }],
  passes: [
    {
      id: "water-refraction",
      stage: "opaque",
      order: 0,
      depth: true,
      create: () => {
        const copy = new SceneCopy(1);
        uniforms.uHwRefraction.value = copy.texture;
        return {
          setSize: (width, height) => {
            copy.setSize(width, height);
            uniforms.uHwRefractionSize.value.set(width, height);
          },
          render: (frame) => {
            copy.copy(frame);
            const p = frame.camera.projectionMatrix.elements;
            uniforms.uHwRefractionFocal.value.set(p[0] * 0.5, p[5] * 0.5);
            uniforms.uHwRefractionExposure.value = frame.gl.toneMappingExposure;
          },
          dispose: () => {
            copy.dispose();
            uniforms.uHwRefraction.value = null;
          },
        };
      },
    },
  ],
};
