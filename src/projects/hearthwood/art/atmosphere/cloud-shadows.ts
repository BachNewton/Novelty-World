import { HalfFloatType, LinearFilter, RedFormat, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget, type Texture } from "three";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { NEAR_LIGHT_GLSL } from "./key-light";
import { acquireCloudNoise, CLOUD_FIELD, CLOUD_FIELD_GLSL, releaseCloudNoise, updateCloudField } from "./cloud-field";

/*
 * The clouds' shadows on the land: before the scene is drawn, a small map
 * of how much light the clouds let through, as the sun (or the moon) sees
 * them. The map lies on the plane of the clouds' base, centred where the
 * camera's own light comes down through it, and each texel holds the light
 * left after the ray up towards the sun has crossed the cloud layer. A
 * point on the land finds its texel by following the light up to that
 * plane, so the shadow falls true at any height of ground, and the map
 * reaches tens of kilometres, past where the clouds fade into the horizon.
 * Out beyond it the land is in the clouds' average shade.
 */

/** Texels a side. */
const MAP = 512;
/** How wide the map is, in metres. */
const REACH = 48000;
/** Steps up through the cloud layer for each texel, and the longest stretch of it marched, in metres. */
const STEPS = 10;
const LONGEST = 6000;

const MAP_FRAGMENT = /* glsl */ `
${CLOUD_FIELD_GLSL}
uniform vec4 uFrame;
uniform vec3 uSun;
varying vec2 vUv;

void main() {
  vec2 xz = uFrame.xy + (vUv - 0.5) * uFrame.z;
  vec3 start = vec3(xz.x, uFrame.w, xz.y);
  float span = min((uHwCloudShape.w - uHwCloudShape.z) / max(uSun.y, 0.05), ${LONGEST.toFixed(1)});
  float step = span / float(${STEPS});
  float depth = 0.0;
  for (int i = 0; i < ${STEPS}; i++) {
    depth += hwCloudDensity(start + uSun * (float(i) + 0.5) * step) * step;
  }
  gl_FragColor = vec4(exp(-depth * 0.0045), 0.0, 0.0, 1.0);
}
`;

const uniforms = {
  uHwCloudShadow: { value: null as Texture | null },
  /** The map's centre (x, z), its width, and the height of the plane it lies on. */
  uHwCloudShadowFrame: { value: new Vector4(0, 0, REACH, 1500) },
  /** The light's direction the map was drawn for, and the light left out beyond the map (the clouds' average). */
  uHwCloudShadowSun: { value: new Vector4(0, 1, 0, 1) },
};

const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uHwCloudShadow;
uniform vec4 uHwCloudShadowFrame;
uniform vec4 uHwCloudShadowSun;

// How much of the sun's (or moon's) light the clouds let through to a point.
float hwCloudShadow(vec3 world) {
  vec3 sun = uHwCloudShadowSun.xyz;
  vec2 up = world.xz + sun.xz * ((uHwCloudShadowFrame.w - world.y) / max(sun.y, 0.05));
  vec2 uv = (up - uHwCloudShadowFrame.xy) / uHwCloudShadowFrame.z + 0.5;
  float edge = smoothstep(0.42, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
  return mix(texture2D(uHwCloudShadow, uv).r, uHwCloudShadowSun.w, edge);
}
`;

const direction = new Vector3();

export const CLOUD_SHADOWS_ART: FeatureArt = {
  feature: "cloudShadows",
  uniforms,
  chunks: [
    {
      kinds: ["land", "ground", "foliage", "solid"],
      fragmentHead: SHADOW_GLSL,
      // Only the sun's (or moon's) light is shaded: the fire's stays as it is.
      light: /* glsl */ `
        ${NEAR_LIGHT_GLSL}
        hwDirect = hwNear + (hwDirect - hwNear) * hwCloudShadow(vHwWorld);
      `,
    },
    {
      kinds: ["water"],
      fragmentHead: SHADOW_GLSL,
      light: /* glsl */ `hwDirect *= hwCloudShadow(vHwWorld);`,
    },
  ],
  frame: updateCloudField,
  passes: [
    {
      id: "cloud-shadows",
      stage: "before",
      order: 5,
      create: () => {
        acquireCloudNoise();
        const material = new ShaderMaterial({
          uniforms: { ...CLOUD_FIELD, uFrame: { value: new Vector4() }, uSun: { value: new Vector3(0, 1, 0) } },
          vertexShader: FULL_SCREEN_VERTEX,
          fragmentShader: MAP_FRAGMENT,
        });
        const quad = new FullScreen(material);
        const target = new WebGLRenderTarget(MAP, MAP, { type: HalfFloatType, format: RedFormat, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
        uniforms.uHwCloudShadow.value = target.texture;
        return {
          render: ({ gl, camera, atmosphere, weather }) => {
            const sun = direction.copy(atmosphere.uHwSunDir.value);
            sun.y = Math.max(sun.y, 0.05);
            sun.normalize();
            const base = CLOUD_FIELD.uHwCloudShape.value.z;
            const eye = camera.position;
            // Centred where the light falling on the camera crosses the clouds' base.
            const along = (base - eye.y) / sun.y;
            const frame = uniforms.uHwCloudShadowFrame.value.set(eye.x + sun.x * along, eye.z + sun.z * along, REACH, base);
            (material.uniforms.uFrame.value as Vector4).copy(frame);
            (material.uniforms.uSun.value as Vector3).copy(sun);
            // Beyond the map, the clouds' average: a shade as deep as the cover.
            uniforms.uHwCloudShadowSun.value.set(sun.x, sun.y, sun.z, 1 - 0.55 * weather.weather.cloudCover);
            quad.render(gl, target);
          },
          dispose: () => {
            quad.dispose();
            target.dispose();
            uniforms.uHwCloudShadow.value = null;
            releaseCloudNoise();
          },
        };
      },
    },
  ],
};
