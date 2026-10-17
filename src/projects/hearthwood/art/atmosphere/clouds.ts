import { Color, HalfFloatType, Matrix4, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Texture } from "three";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { weatherColours } from "./colours";
import { acquireCloudNoise, CLOUD_FIELD, CLOUD_FIELD_GLSL, releaseCloudNoise, updateCloudField } from "./cloud-field";

/*
 * The clouds: marched through the cloud field (`cloud-field.ts`) along each
 * ray into the sky, before the scene is drawn, into a frame of their own at
 * half the screen's size (clouds are soft, so nothing is lost), which the
 * sky lays over itself where nothing else is drawn. Low heaped clouds and
 * layered grey ones are the one layer, shaped by the weather; a thin high
 * veil streams above them. Each step through a cloud is lit by the sun or
 * the moon through the cloud between it and the light, scattered forward
 * most (so the edges towards the sun shine silver) and a little back, and
 * by the sky from above and the darker land from below; a flash of
 * lightning lights them from inside.
 */

/** The steps along a ray through the heaped layer, and towards the light from each. */
const STEPS = 48;
const LIGHT_STEPS = 4;
/** The longest stretch of a ray marched through the layer, in metres: far towards the horizon the fog takes over. */
const LONGEST = 7000;
/** How far off the clouds fade into the horizon, in metres. */
const FADE = [16000, 42000] as const;
/** The high veil's height, in metres. */
const VEIL = 6500;

const FRAGMENT = /* glsl */ `
${CLOUD_FIELD_GLSL}
uniform mat4 uViewToWorld;
uniform mat4 uProjectionInverse;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform vec3 uLight;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform vec3 uCloud;
uniform vec3 uShade;
uniform vec3 uFlash;
uniform float uVeil;
varying vec2 vUv;

float forward(float cosine, float g) {
  float gg = g * g;
  return (1.0 - gg) / pow(1.0 + gg - 2.0 * g * cosine, 1.5);
}

// Interleaved gradient noise: a different start along each pixel's ray, so the steps never show as bands.
float dither(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, 0.5, 1.0);
  vec3 dir = normalize((uViewToWorld * vec4(view.xyz / view.w, 0.0)).xyz);
  vec3 colour = vec3(0.0);
  float through = 1.0;
  if (dir.y > 0.0) {
    float t0 = max(0.0, (uHwCloudShape.z - uEye.y) / dir.y);
    float t1 = (uHwCloudShape.w - uEye.y) / dir.y;
    float fade = 1.0 - smoothstep(${FADE[0].toFixed(1)}, ${FADE[1].toFixed(1)}, t0);
    t1 = min(t1, t0 + ${LONGEST.toFixed(1)});
    float cosine = dot(dir, uLightDir);
    // Mostly forward, for the silver edges towards the light, with a little thrown back.
    float phase = mix(forward(cosine, 0.6), forward(cosine, -0.25), 0.35);
    if (fade > 0.0 && t1 > t0) {
      float step = (t1 - t0) / float(${STEPS});
      float t = t0 + step * dither(gl_FragCoord.xy);
      for (int i = 0; i < ${STEPS}; i++) {
        vec3 p = uEye + dir * t;
        float density = hwCloudDensity(p);
        if (density > 0.01) {
          float sigma = density * 0.012;
          // The cloud between this point and the light.
          float toLight = 0.0;
          float reach = 40.0;
          for (int j = 0; j < ${LIGHT_STEPS}; j++) {
            toLight += hwCloudDensity(p + uLightDir * reach) * reach;
            reach *= 2.2;
          }
          float lit = exp(-toLight * 0.006) * (1.0 - 0.6 * exp(-density * 4.0));
          float h = clamp(hwCloudHeight(p.y), 0.0, 1.0);
          vec3 ambient = mix(uGroundLight * uShade, uSkyLight, 0.35 + 0.65 * h);
          vec3 light = (uLight * phase * lit + ambient + uFlash * (1.0 - 0.5 * h)) * uCloud;
          float absorbed = exp(-sigma * step);
          colour += through * light * (1.0 - absorbed);
          through *= absorbed;
          if (through < 0.02) break;
        }
        t += step;
      }
      colour *= fade;
      through = mix(1.0, through, fade);
    }
    // The high veil: thin streaks drawn along the wind, lit from the sun's side.
    float tv = (${VEIL.toFixed(1)} - uEye.y) / dir.y;
    vec2 q = (uEye.xz + dir.xz * tv + uHwCloudDrift * 1.6);
    float streaks = texture2D(uHwCloudNoise, q / vec2(21000.0, 7000.0)).a * texture2D(uHwCloudNoise, q / 4100.0 + 0.5).r;
    float veil = smoothstep(0.18, 0.5, streaks) * uVeil * (1.0 - smoothstep(30000.0, 90000.0, tv));
    vec3 veilLight = (uLight * (0.5 + 0.5 * forward(cosine, 0.75)) * 0.6 + uSkyLight * 0.9 + uFlash * 0.3) * uCloud;
    colour += through * veilLight * veil * 0.55;
    through *= 1.0 - veil * 0.55;
  }
  gl_FragColor = vec4(colour, 1.0 - through);
}
`;

/** What the sky reads: the clouds' frame, and the screen's size to read it by. */
const uniforms = {
  uHwCloudFrame: { value: null as Texture | null },
  uHwCloudFrameSize: { value: new Vector2(1, 1) },
};

const lighting = {
  light: new Color(),
  sky: new Color(),
  ground: new Color(),
  flash: new Color(),
};

export const CLOUDS_ART: FeatureArt = {
  feature: "clouds",
  uniforms,
  chunks: [
    {
      kinds: ["sky"],
      fragmentHead: /* glsl */ `
        uniform sampler2D uHwCloudFrame;
        uniform vec2 uHwCloudFrameSize;
      `,
      colour: /* glsl */ `
        // Four taps a little apart soften the march's dither, which the half-sized frame would otherwise show.
        vec2 hwAt = gl_FragCoord.xy / uHwCloudFrameSize;
        vec2 hwTexel = 1.5 / uHwCloudFrameSize;
        vec4 hwCloud = 0.25 * (texture2D(uHwCloudFrame, hwAt + vec2(hwTexel.x, 0.0)) + texture2D(uHwCloudFrame, hwAt - vec2(hwTexel.x, 0.0))
          + texture2D(uHwCloudFrame, hwAt + vec2(0.0, hwTexel.y)) + texture2D(uHwCloudFrame, hwAt - vec2(0.0, hwTexel.y)));
        hwColour = hwColour * (1.0 - hwCloud.a) + hwCloud.rgb;
      `,
    },
  ],
  frame: (frame) => {
    updateCloudField(frame);
    const { day, atmosphere, weather } = frame;
    lighting.light.copy(atmosphere.uHwSunColor.value).multiplyScalar(day.light.sun * day.sky.key.strength * 0.55);
    lighting.sky.copy(atmosphere.uHwSkyLight.value).multiplyScalar(0.95);
    lighting.ground.copy(atmosphere.uHwSkyLight.value).multiplyScalar(0.55).add(atmosphere.uHwSunLight.value);
    lighting.flash.copy(weatherColours().lightning).multiplyScalar(weather.flash * 3);
  },
  passes: [
    {
      id: "clouds",
      stage: "before",
      order: 10,
      create: () => {
        acquireCloudNoise();
        const colours = weatherColours();
        const material = new ShaderMaterial({
          uniforms: {
            ...CLOUD_FIELD,
            uViewToWorld: { value: new Matrix4() },
            uProjectionInverse: { value: new Matrix4() },
            uEye: { value: new Vector3() },
            uLightDir: { value: new Vector3(0, 1, 0) },
            uLight: { value: lighting.light },
            uSkyLight: { value: lighting.sky },
            uGroundLight: { value: lighting.ground },
            uCloud: { value: colours.cloud },
            uShade: { value: colours.cloudShade },
            uFlash: { value: lighting.flash },
            uVeil: { value: 0 },
          },
          vertexShader: FULL_SCREEN_VERTEX,
          fragmentShader: FRAGMENT,
        });
        const quad = new FullScreen(material);
        const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
        uniforms.uHwCloudFrame.value = target.texture;
        return {
          setSize: (width, height) => {
            target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
            uniforms.uHwCloudFrameSize.value.set(width, height);
          },
          render: ({ gl, camera, atmosphere, weather }) => {
            const u = material.uniforms;
            // Drawn before the scene, which is what would bring the camera's matrix up to where it now is.
            camera.updateMatrixWorld();
            (u.uViewToWorld.value as Matrix4).copy(camera.matrixWorld);
            (u.uProjectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
            (u.uEye.value as Vector3).setFromMatrixPosition(camera.matrixWorld);
            (u.uLightDir.value as Vector3).copy(atmosphere.uHwSunDir.value);
            const w = weather.weather;
            u.uVeil.value = (0.1 + 0.5 * w.humidity * w.humidity) * (1 - w.precipitation) * (0.3 + 0.7 * Math.min(1, w.cloudCover * 1.6));
            quad.render(gl, target);
          },
          dispose: () => {
            quad.dispose();
            target.dispose();
            uniforms.uHwCloudFrame.value = null;
            releaseCloudNoise();
          },
        };
      },
    },
  ],
};
