import { Matrix4, Vector2, type PerspectiveCamera, type Texture } from "three";
import type { FeatureArt } from "../feature-art";
import { DISPLAY_TO_LINEAR_GLSL, SceneCopy } from "./scene-copy";

/*
 * Screen-space reflections: the reflected ray from each pixel of water is
 * marched across a half-size copy of the scene drawn before the water,
 * against the copy's distances, until it passes behind something drawn
 * there, and that is what the water mirrors. Steps grow with the distance,
 * so a ray reaches the mountains across a lake in a few dozen, and a hit is
 * refined by halving. A ray that hits nothing looks along its direction to
 * the far distance, and where that is on screen and far off (the sky, the
 * far ranges), mirrors what is there, so the water shows the live sky with
 * everything in it. Where the ray leaves the screen, it eases back to the
 * sky's reflection.
 */

const STEPS = 28;
const REFINE = 5;
/** How far a reflected ray is marched before it is taken to be looking into the far distance, in metres. */
const REACH = 4000;

const uniforms = {
  uHwSsr: { value: null as Texture | null },
  uHwSsrSize: { value: new Vector2(1, 1) },
  uHwSsrProjection: { value: new Matrix4() },
  uHwSsrNear: { value: 0.1 },
  uHwSsrExposure: { value: 1 },
};

const HEAD = /* glsl */ `
uniform sampler2D uHwSsr;
uniform vec2 uHwSsrSize;
uniform mat4 uHwSsrProjection;
uniform float uHwSsrNear;
uniform float uHwSsrExposure;
${DISPLAY_TO_LINEAR_GLSL}

vec2 hwSsrScreen(vec3 view) {
  vec4 clip = uHwSsrProjection * vec4(view, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}

// How far a screen position is from leaving the screen, easing to 0 at the edge.
float hwSsrEdge(vec2 uv) {
  vec2 inside = min(uv, 1.0 - uv);
  return smoothstep(0.0, 0.06, min(inside.x, inside.y));
}
`;

const LIGHT = /* glsl */ `
  vec3 from = (viewMatrix * vec4(vHwWorld, 1.0)).xyz;
  vec3 rayWorld = reflect(-hwView, hwNormal);
  // A ripple can tip the reflected ray into the water; it is meant to skim the surface.
  rayWorld.y = max(rayWorld.y, 0.002);
  vec3 ray = normalize((viewMatrix * vec4(rayWorld, 0.0)).xyz);
  // A ray coming back towards the eye stops short of the near plane.
  float reach = ray.z > 0.0 ? min(${REACH.toFixed(1)}, (-from.z - uHwSsrNear * 2.0) / ray.z) : ${REACH.toFixed(1)};
  vec3 to = from + ray * reach;
  vec2 start = gl_FragCoord.xy / uHwSsrSize;
  vec2 end = hwSsrScreen(to);
  float nearFrom = 1.0 / -from.z;
  float nearTo = 1.0 / -to.z;

  float hit = -1.0;
  float was = 0.0;
  float wasDistance = -from.z;
  for (int i = 1; i <= ${STEPS}; i++) {
    float s = pow(float(i) / ${STEPS}.0, 1.8);
    vec2 uv = mix(start, end, s);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    // Distance along the view is linear across the screen only in its reciprocal.
    float along = 1.0 / mix(nearFrom, nearTo, s);
    float scene = texture2D(uHwSsr, uv).a;
    float thick = max(1.0, (along - wasDistance) * 2.0 + along * 0.03);
    if (along > scene && along - scene < thick) {
      hit = s;
      break;
    }
    was = s;
    wasDistance = along;
  }

  vec3 mirrored = hwReflect;
  if (hit > 0.0) {
    float lo = was;
    float hi = hit;
    for (int i = 0; i < ${REFINE}; i++) {
      float mid = 0.5 * (lo + hi);
      float along = 1.0 / mix(nearFrom, nearTo, mid);
      if (along > texture2D(uHwSsr, mix(start, end, mid)).a) hi = mid;
      else lo = mid;
    }
    vec2 uv = mix(start, end, hi);
    vec3 seen = hwDisplayToLinear(texture2D(uHwSsr, uv).rgb, uHwSsrExposure);
    mirrored = mix(hwReflect, seen, hwSsrEdge(uv));
  } else if (ray.z < 0.0) {
    // Nothing near on the way: along the ray into the far distance, whatever is far off is what is mirrored.
    vec4 clip = uHwSsrProjection * vec4(ray, 0.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    vec4 far = texture2D(uHwSsr, clamp(uv, 0.0, 1.0));
    float farOff = smoothstep(${(REACH * 0.5).toFixed(1)}, ${REACH.toFixed(1)}, far.a);
    mirrored = mix(hwReflect, hwDisplayToLinear(far.rgb, uHwSsrExposure), hwSsrEdge(uv) * farOff);
  }
  hwReflect = mirrored;
`;

export const REFLECTIONS_ART: FeatureArt = {
  feature: "screenSpaceReflections",
  uniforms,
  chunks: [{ kinds: ["water"], fragmentHead: HEAD, light: LIGHT }],
  passes: [
    {
      id: "water-reflections",
      stage: "opaque",
      order: 1,
      depth: true,
      create: () => {
        // Reflections are rippled and soft: half the size is plenty.
        const copy = new SceneCopy(0.5);
        uniforms.uHwSsr.value = copy.texture;
        return {
          setSize: (width, height) => {
            copy.setSize(width, height);
            uniforms.uHwSsrSize.value.set(width, height);
          },
          render: (frame) => {
            copy.copy(frame);
            uniforms.uHwSsrProjection.value.copy(frame.camera.projectionMatrix);
            uniforms.uHwSsrNear.value = (frame.camera as PerspectiveCamera).near;
            uniforms.uHwSsrExposure.value = frame.gl.toneMappingExposure;
          },
          dispose: () => {
            copy.dispose();
            uniforms.uHwSsr.value = null;
          },
        };
      },
    },
  ],
};
