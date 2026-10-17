import { Color, Matrix4, ShaderMaterial, Vector3 } from "three";
import { DEPTH_GLSL } from "../depth";
import { AIR_MARCH_GLSL } from "./air-march";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { acquireCloudNoise, CLOUD_FIELD, CLOUD_FIELD_GLSL, releaseCloudNoise, updateCloudField } from "./cloud-field";

/*
 * Crepuscular rays: beams of sunlight fanning out from behind the clouds.
 * Over the finished frame, each pixel's ray is marched through the air
 * below the clouds, out to whatever it meets (read from the reversed depth)
 * or to the clouds' base, and at each step asks whether the sun shines
 * there or the cloud overhead shades it (from the cloud field's cover,
 * along the sun's direction). Where more of the ray is lit than the air on
 * average, the air glows with scattered sunlight, brightest looking towards
 * the sun; where a cloud's shadow falls along it, the air is dimmer. So the
 * beams and the shafts of shadow between them stand out of the haze, most
 * on a day of broken cloud and a low sun, and not at all under a clear or
 * a closed sky.
 */

/** Steps along each ray, and how far the air is marched at most, in metres. */
const STEPS = 28;
const REACH = 12000;

const FRAGMENT = /* glsl */ `
${DEPTH_GLSL}
${AIR_MARCH_GLSL}
${CLOUD_FIELD_GLSL}
uniform sampler2D tColour;
uniform sampler2D tDepth;
uniform mat4 uProjectionInverse;
uniform mat4 uViewToWorld;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform float uAir;
uniform float uStrength;
varying vec2 vUv;

float forward(float cosine, float g) {
  float gg = g * g;
  return (1.0 - gg) / pow(1.0 + gg - 2.0 * g * cosine, 1.5);
}

float dither(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

// Whether the sun reaches a point under the clouds: the cover of the cloud the light comes down through.
float sunlit(vec3 p) {
  float base = uHwCloudShape.z;
  if (p.y >= base) return 1.0;
  vec2 through = p.xz + uSunDir.xz * ((base + 0.35 * (uHwCloudShape.w - base) - p.y) / max(uSunDir.y, 0.06));
  return 1.0 - hwCloudCoverage(through);
}

void main() {
  vec4 colour = texture2D(tColour, vUv);
  float depth = texture2D(tDepth, vUv).r;
  vec4 ray = hwAirRay(vUv, depth, uProjectionInverse, ${REACH.toFixed(1)});
  vec3 dir = normalize((uViewToWorld * vec4(ray.xyz, 0.0)).xyz);
  float reach = ray.w;
  if (dir.y > 0.0) reach = min(reach, max(0.0, (uHwCloudShape.z - uEye.y) / dir.y));

  float lit = 0.0;
  float air = 0.0;
  float jitter = dither(gl_FragCoord.xy);
  float last = 0.0;
  for (int i = 1; i <= ${STEPS}; i++) {
    // Closer together near the eye, where the beams are seen side on.
    float f = (float(i) - jitter) / float(${STEPS});
    float t = reach * f * f;
    vec3 p = uEye + dir * t;
    float w = exp(-max(p.y, 0.0) / 1600.0) * (t - last);
    last = t;
    lit += sunlit(p) * w;
    air += w;
  }
  float share = air > 0.0 ? lit / air : 1.0;
  float average = 1.0 - 0.7 * uHwCloudShape.x;
  float glow = 1.0 - exp(-air * uAir);
  float cosine = dot(dir, uSunDir);
  float phase = 0.35 * forward(cosine, 0.72) + 0.25;
  vec3 beams = uSun * phase * glow * (share - average) * uStrength;
  gl_FragColor = vec4(max(colour.rgb + beams, vec3(0.0)), colour.a);
}
`;

const sun = new Color();

export const CREPUSCULAR_RAYS_ART: FeatureArt = {
  feature: "crepuscularRays",
  frame: updateCloudField,
  passes: [
    {
      id: "crepuscular-rays",
      stage: "post",
      // Before the glow, so a beam's brightest end blooms in mist too.
      order: 50,
      depth: true,
      create: () => {
        acquireCloudNoise();
        const quad = new FullScreen(
          new ShaderMaterial({
            uniforms: {
              ...CLOUD_FIELD,
              tColour: { value: null },
              tDepth: { value: null },
              uProjectionInverse: { value: new Matrix4() },
              uViewToWorld: { value: new Matrix4() },
              uEye: { value: new Vector3() },
              uSunDir: { value: new Vector3(0, 1, 0) },
              uSun: { value: sun },
              uAir: { value: 0 },
              uStrength: { value: 0 },
            },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: FRAGMENT,
          }),
        );
        return {
          render: ({ gl, camera, colour, depth, output, atmosphere, weather }) => {
            if (!colour || !depth) throw new Error("Crepuscular rays read the finished frame and its depth");
            const u = quad.material.uniforms;
            u.tColour.value = colour;
            u.tDepth.value = depth;
            (u.uProjectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
            (u.uViewToWorld.value as Matrix4).copy(camera.matrixWorld);
            (u.uEye.value as Vector3).setFromMatrixPosition(camera.matrixWorld);
            (u.uSunDir.value as Vector3).copy(atmosphere.uHwSunDir.value);
            sun.copy(atmosphere.uHwKeyLight.value).multiplyScalar(0.18);
            const w = weather.weather;
            // The air's thickness along a ray, as the fog's clear air reckons it; the beams show most in broken cloud.
            u.uAir.value = 1.4e-5 * Math.pow(w.haze / 0.3, 1.2) * 5;
            u.uStrength.value = Math.min(1, 4 * w.cloudCover * (1 - w.cloudCover) + 0.15) * (1 - 0.7 * w.precipitation);
            quad.render(gl, output);
          },
          dispose: () => {
            quad.dispose();
            releaseCloudNoise();
          },
        };
      },
    },
  ],
};
