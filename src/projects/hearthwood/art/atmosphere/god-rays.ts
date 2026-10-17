import { Color, HalfFloatType, LinearFilter, Matrix4, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget } from "three";
import { featureDefine, liveFeatures } from "../../features";
import { DEPTH_GLSL } from "../depth";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { SHADOW_GLSL, SHADOW_UNIFORMS } from "../shadows/shadow-map";
import { AIR_MARCH_GLSL } from "./air-march";
import { fogLayers } from "./fog";

/*
 * God rays: light shafts through the air itself. Each pixel's ray is
 * marched out through the air near the eye, to what it meets (read from the
 * reversed depth) or a few hundred metres, and at every step asks the key
 * light's shadow maps (`shadows/shadow-map.ts`) whether the sun, or the
 * moon, reaches that point of the air. Where it does, the air scatters its
 * light towards the eye: strongly forward, so looking towards a low sun
 * through the trees the light pours between the trunks, and a little back,
 * so the shafts still show with the sun behind. How much the air scatters is
 * the fog's own air (`fog.ts`): the clear air hardly at all, a misty dawn a
 * great deal. The march runs at half the screen's size, dithered, and is
 * softened as it is laid back over the frame. Without the shadows there is
 * nothing to tell light from shade, and so no shafts.
 */

/** Steps along each ray, and the furthest it is marched, in metres. */
const STEPS = 32;
const REACH = 320;

const MARCH = /* glsl */ `
${DEPTH_GLSL}
${AIR_MARCH_GLSL}
// The key light's direction, which the shadow maps' GLSL reads too.
uniform vec3 uHwSunDir;
${SHADOW_GLSL}
uniform sampler2D tDepth;
uniform mat4 uProjectionInverse;
uniform mat4 uViewToWorld;
uniform vec3 uEye;
uniform vec3 uFogDensity;
uniform vec4 uFogLayers;
varying vec2 vUv;

// Scattering by the air towards the eye: mostly forward (Henyey-Greenstein), a little back.
float hwAirPhase(float cosine) {
  float forward = 0.51 / pow(1.49 - 1.4 * cosine, 1.5);
  float back = 0.91 / pow(1.09 + 0.6 * cosine, 1.5);
  return 0.8 * forward + 0.2 * back;
}

// Whether the key light reaches a point of the air, from the first shadow map that holds it: one tap, compared in hardware.
float hwAirLit(vec3 p) {
  for (int k = 0; k < HW_SHADOW_MAPS; k++) {
    vec3 c = hwShadowCoord(p, k);
    if (!hwInShadowMap(c)) continue;
    return texture(uHwShadowMap, vec3(hwShadowUv(c.xy, k), c.z));
  }
  return 1.0;
}

float hwAirDensity(float y) {
  return uFogDensity.x * exp(-max(y, 0.0) / uFogLayers.x)
    + uFogDensity.y * exp(-max(y - uFogLayers.y, -uFogLayers.z) / uFogLayers.z)
    + uFogDensity.z * exp(-max(y - uFogLayers.y, -uFogLayers.w) / uFogLayers.w);
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec4 ray = hwAirRay(vUv, depth, uProjectionInverse, ${REACH.toFixed(1)});
  vec3 dir = normalize((uViewToWorld * vec4(ray.xyz, 0.0)).xyz);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float lit = 0.0;
  float through = 1.0;
  float last = 0.0;
  for (int i = 1; i <= ${STEPS}; i++) {
    // Closer together near the eye, where a shaft between two trunks is narrow.
    float f = (float(i) - jitter) / float(${STEPS});
    float t = ray.w * f * f;
    vec3 p = uEye + dir * t;
    float scatter = hwAirDensity(p.y) * (t - last);
    last = t;
    lit += hwAirLit(p) * scatter * through;
    through *= exp(-scatter);
  }
  gl_FragColor = vec4(lit * hwAirPhase(dot(dir, uHwSunDir)), 0.0, 0.0, 1.0);
}
`;

const COMPOSE = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tShafts;
uniform vec2 uTexel;
uniform vec3 uLight;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tColour, vUv);
  float shafts = 0.25 * (texture2D(tShafts, vUv + vec2(uTexel.x, 0.0)).r + texture2D(tShafts, vUv - vec2(uTexel.x, 0.0)).r
    + texture2D(tShafts, vUv + vec2(0.0, uTexel.y)).r + texture2D(tShafts, vUv - vec2(0.0, uTexel.y)).r);
  vec3 glow = uLight * shafts;
  gl_FragColor = vec4(1.0 - (1.0 - c.rgb) * (1.0 - min(glow, vec3(1.0))), c.a);
}
`;

const light = new Color();

export const GOD_RAYS_ART: FeatureArt = {
  feature: "godRays",
  passes: [
    {
      id: "god-rays",
      stage: "post",
      // With the other light in the air, before the glow.
      order: 55,
      depth: true,
      create: () => {
        const cascades = featureDefine("shadowCascades");
        const march = new FullScreen(
          new ShaderMaterial({
            uniforms: {
              ...SHADOW_UNIFORMS,
              tDepth: { value: null },
              uProjectionInverse: { value: new Matrix4() },
              uViewToWorld: { value: new Matrix4() },
              uEye: { value: new Vector3() },
              uFogDensity: { value: new Vector3() },
              uFogLayers: { value: new Vector4(1, 0, 1, 1) },
              uHwSunDir: { value: new Vector3(0, 1, 0) },
            },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: MARCH,
          }),
        );
        const compose = new FullScreen(
          new ShaderMaterial({
            uniforms: { tColour: { value: null }, tShafts: { value: null }, uTexel: { value: new Vector2() }, uLight: { value: light } },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: COMPOSE,
          }),
        );
        const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
        return {
          setSize: (width, height) => {
            target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
            (compose.material.uniforms.uTexel.value as Vector2).set(1 / target.width, 1 / target.height);
          },
          render: ({ gl, camera, colour, depth, output, atmosphere, day, weather }) => {
            if (!colour || !depth) throw new Error("God rays read the finished frame and its depth");
            // The shadow maps are drawn in four slices with the cascades on and one without: the march reads as many.
            const m = march.material;
            const wantCascades = liveFeatures().isOn("shadowCascades");
            if (wantCascades !== cascades in m.defines) {
              if (wantCascades) m.defines[cascades] = "";
              else delete m.defines[cascades];
              m.needsUpdate = true;
            }
            const u = m.uniforms;
            u.tDepth.value = depth;
            (u.uProjectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
            (u.uViewToWorld.value as Matrix4).copy(camera.matrixWorld);
            (u.uEye.value as Vector3).setFromMatrixPosition(camera.matrixWorld);
            (u.uHwSunDir.value as Vector3).copy(atmosphere.uHwSunDir.value);
            fogLayers(day, weather, u.uFogDensity.value as Vector3, u.uFogLayers.value as Vector4);
            // Without the shadow maps nothing tells light from shade: the march is skipped and the frame passes through.
            const casting = SHADOW_UNIFORMS.uHwShadowMap.value !== null;
            if (casting) march.render(gl, target);
            // The key light's colour and strength, as strong as its shadows are.
            const strength = casting ? SHADOW_UNIFORMS.uHwShadowStrength.value : 0;
            light.copy(atmosphere.uHwKeyLight.value).multiplyScalar(0.35 * strength * (1 - 0.6 * weather.weather.precipitation));
            const c = compose.material.uniforms;
            c.tColour.value = colour;
            c.tShafts.value = target.texture;
            compose.render(gl, output);
          },
          dispose: () => {
            march.dispose();
            compose.dispose();
            target.dispose();
          },
        };
      },
    },
  ],
};
