import { Color, HalfFloatType, LinearFilter, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget } from "three";
import { DEPTH_GLSL } from "../depth";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";

/*
 * Sun shafts: the cheap, screen-space god rays. Over the finished frame, at
 * half its size, the open sky near the sun (read from the reversed depth:
 * only where nothing is drawn) is smeared out along lines from the sun's
 * place on the screen, so trees, ridges and clouds standing against it cast
 * streaks of shadow through a glow of light, and the result is laid over
 * the frame. It knows nothing of the world beyond the screen: a sun behind
 * the camera or below the horizon casts none, and the shafts fade as it
 * nears the frame's edge. How strongly depends on the air: more in mist and
 * haze, little on a crisp day.
 */

/** Samples along each pixel's line towards the sun. */
const SAMPLES = 48;

const SMEAR = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tColour;
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform float uAspect;
varying vec2 vUv;

float dither(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

// The open sky's light near the sun: what the shafts are smeared from.
vec3 opening(vec2 uv) {
  if (!hwIsFar(texture2D(tDepth, uv).r)) return vec3(0.0);
  vec2 off = (uv - uSun) * vec2(uAspect, 1.0);
  return texture2D(tColour, uv).rgb * exp(-dot(off, off) * 9.0);
}

void main() {
  vec2 step = (uSun - vUv) / float(${SAMPLES});
  vec2 uv = vUv + step * dither(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  float weight = 1.0;
  for (int i = 0; i < ${SAMPLES}; i++) {
    sum += opening(uv) * weight;
    weight *= 0.965;
    uv += step;
  }
  gl_FragColor = vec4(sum / float(${SAMPLES}), 1.0);
}
`;

const COMPOSE = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tShafts;
uniform vec3 uTint;
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tColour, vUv);
  vec3 shafts = texture2D(tShafts, vUv).rgb * uTint * uStrength;
  gl_FragColor = vec4(1.0 - (1.0 - c.rgb) * (1.0 - min(shafts, vec3(1.0))), c.a);
}
`;

const sunAt = new Vector3();
const facing = new Vector3();
const tint = new Color();

export const SUN_SHAFTS_ART: FeatureArt = {
  feature: "sunShafts",
  passes: [
    {
      id: "sun-shafts",
      stage: "post",
      // After the crepuscular rays, before the glow.
      order: 60,
      depth: true,
      create: () => {
        const smear = new FullScreen(
          new ShaderMaterial({
            uniforms: { tColour: { value: null }, tDepth: { value: null }, uSun: { value: new Vector2() }, uAspect: { value: 1 } },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: SMEAR,
          }),
        );
        const compose = new FullScreen(
          new ShaderMaterial({
            uniforms: { tColour: { value: null }, tShafts: { value: null }, uTint: { value: tint }, uStrength: { value: 0 } },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: COMPOSE,
          }),
        );
        const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
        return {
          setSize: (width, height) => {
            target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
          },
          render: ({ gl, camera, colour, depth, output, atmosphere, weather, width, height }) => {
            if (!colour || !depth) throw new Error("Sun shafts read the finished frame and its depth");
            // Where the sun (or the moon) stands on the screen, and how far it is in front of the camera.
            sunAt.copy(atmosphere.uHwSunDir.value).multiplyScalar(1000).add(camera.position).project(camera);
            const ahead = Math.min(1, Math.max(0, camera.getWorldDirection(facing).dot(atmosphere.uHwSunDir.value) * 4));
            const inFrame = 1 - Math.min(1, Math.max(0, Math.max(Math.abs(sunAt.x), Math.abs(sunAt.y)) - 1) / 0.6);
            const up = Math.min(1, Math.max(0, atmosphere.uHwSunDir.value.y * 8 + 0.2));
            const w = weather.weather;
            const air = Math.min(1, 0.3 + w.mist * 0.8 + Math.max(0, w.haze - 0.3) * 0.25);
            const strength = ahead * inFrame * up * air * (1 - 0.8 * w.precipitation);
            const u = smear.material.uniforms;
            u.tColour.value = colour;
            u.tDepth.value = depth;
            (u.uSun.value as Vector2).set(sunAt.x * 0.5 + 0.5, sunAt.y * 0.5 + 0.5);
            u.uAspect.value = width / height;
            smear.render(gl, target);
            tint.copy(atmosphere.uHwKeyLight.value).multiplyScalar(0.4);
            const c = compose.material.uniforms;
            c.tColour.value = colour;
            c.tShafts.value = target.texture;
            c.uStrength.value = 1.4 * strength;
            compose.render(gl, output);
          },
          dispose: () => {
            smear.dispose();
            compose.dispose();
            target.dispose();
          },
        };
      },
    },
  ],
};
