import {
  Color,
  DepthTexture,
  FloatType,
  GreaterEqualCompare,
  LinearFilter,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  RedFormat,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
} from "three";
import { liveFeatures } from "../../features";
import { QUALITY } from "../../quality";
import type { FeaturePass, PassFrame } from "../feature-art";
import { CASTER_EYE } from "./caster-depth";
import { castersOnly } from "./casters";
import { lightFrame, sliceSphere, snapToTexels, splitDistances, squareMatrix, steadyRadius } from "./cascades";

/*
 * The key light's shadow maps: the camera's view cut into slices by
 * distance (four with the far shadows on, one without), each drawn from the
 * light into its own square of one atlas, sharpest by the camera and coarser
 * with distance, the last fading out before it ends. They are drawn once a
 * frame, before the scene, and are there for any feature to read through
 * `SHADOW_UNIFORMS` and `SHADOW_GLSL` (god rays march through them): a depth
 * compared in hardware for the shadows themselves, and the light's depth as a
 * plain number for knowing how far the light has come.
 */

/** The most maps there are, and so the length of the per-map uniforms. */
export const MAX_SHADOW_MAPS = 4;

/** How far from the camera the first slice ends is set by the rest: they grow by one ratio from this many metres. */
const FIRST_SLICE = 2.5;

/** How far beyond a slice's sphere, towards the light, casters are still drawn: the mountains' long evening shadows. */
const CASTER_REACH = 2500;

/**
 * The shadows' uniforms, shared by every material that takes shadows and by
 * any feature that reads the maps. Each map's matrix takes a world point to
 * its square: x and y across it from 0 to 1, z the light's depth, reversed as
 * the world's is (1 nearest the light, 0 at the far end of its reach).
 */
export const SHADOW_UNIFORMS = {
  /** The light's depth, compared in hardware: `texture(uHwShadowMap, vec3(uv, depth))` is 1 where the point is lit. */
  uHwShadowMap: { value: null as DepthTexture | null },
  /** The light's depth as a plain number (0 where nothing is), for how far the light has come through things. */
  uHwShadowDepth: { value: null as Texture | null },
  uHwShadowMatrix: { value: Array.from({ length: MAX_SHADOW_MAPS }, () => new Matrix4()) },
  /** Each map's texel, in metres. */
  uHwShadowTexel: { value: new Vector4(1, 1, 1, 1) },
  /** Each map's depth from 0 to 1, in metres. */
  uHwShadowDepthRange: { value: new Vector4(1, 1, 1, 1) },
  /** How far from the camera the shadows begin to fade, and where they are gone. */
  uHwShadowFade: { value: new Vector2(1, 2) },
  /** How dark the shadows are, from none to full: they fade as the light sinks to the horizon, under cloud, and at night without the moon's. */
  uHwShadowStrength: { value: 0 },
  /** The tangent of the light's apparent radius: a penumbra's half-width for each metre between a caster and its shadow. */
  uHwShadowAngle: { value: 0.01 },
  /** The least a shadow's edge is softened, in metres. */
  uHwShadowBlur: { value: 0.02 },
  /** Maps across the atlas (1 or 2), and texels across one map. */
  uHwShadowTiles: { value: 1 },
  uHwShadowSize: { value: QUALITY.shadowMap },
};

/** The light the shadows are cast by this frame, set by the shadow features' frames and read by the pass. */
export const shadowLight = {
  /** Whether the key light casts at all: the sun always, the moon only with its shadows on. */
  casting: true,
  angle: 0.01,
  blur: 0.02,
  strength: 1,
};

/** Reading the maps, for any shader stage that has `uHwSunDir` and `cameraPosition`. */
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2DShadow uHwShadowMap;
uniform sampler2D uHwShadowDepth;
uniform mat4 uHwShadowMatrix[${MAX_SHADOW_MAPS}];
uniform vec4 uHwShadowTexel;
uniform vec4 uHwShadowDepthRange;
uniform vec2 uHwShadowFade;
uniform float uHwShadowStrength;
uniform float uHwShadowAngle;
uniform float uHwShadowBlur;
uniform float uHwShadowTiles;
uniform float uHwShadowSize;

#ifdef HW_SHADOW_CASCADES
  #define HW_SHADOW_MAPS ${MAX_SHADOW_MAPS}
#else
  #define HW_SHADOW_MAPS 1
#endif

// Map k's value of a per-map uniform, picked without indexing a vector by a variable, which some drivers handle poorly.
float hwOfMap(vec4 values, int k) {
  return k == 0 ? values.x : k == 1 ? values.y : k == 2 ? values.z : values.w;
}

// A world point in map k: across it from 0 to 1, and the light's reversed depth.
vec3 hwShadowCoord(vec3 world, int k) {
  return (uHwShadowMatrix[k] * vec4(world, 1.0)).xyz;
}

bool hwInShadowMap(vec3 c) {
  return c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0 && c.z > 0.0;
}

// Where in the atlas a point of map k lies, kept half a texel inside its square.
vec2 hwShadowUv(vec2 uv, int k) {
  float edge = 0.5 / uHwShadowSize;
  vec2 tile = vec2(float(k - (k / 2) * 2), float(k / 2));
  return (clamp(uv, edge, 1.0 - edge) + tile) / uHwShadowTiles;
}

// The light's depth at a point of map k: 0 where nothing stands in the light.
float hwLightDepth(vec2 uv, int k) {
  return texture(uHwShadowDepth, hwShadowUv(uv, k)).r;
}

// A turn that changes from pixel to pixel, so a few taps cover a disc smoothly between them.
float hwShadowTurn() {
  return 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}

// Tap i of n spread evenly over a disc of radius 1.
vec2 hwShadowDisc(int i, int n, float turn) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float a = float(i) * 2.3999632 + turn;
  return r * vec2(cos(a), sin(a));
}

// How much of a disc of radius (in texels) round a point of map k is lit, from n taps compared in hardware.
float hwShadowFilter(vec3 c, int k, float radius, int n, float turn) {
  float lit = 0.0;
  vec2 across = vec2(radius / uHwShadowSize);
  for (int i = 0; i < n; i++) {
    lit += texture(uHwShadowMap, vec3(hwShadowUv(c.xy + hwShadowDisc(i, n, turn) * across, k), c.z));
  }
  return lit / float(n);
}

#ifdef HW_SOFT_SHADOWS
float hwShadowSoft(vec3 c, int k, float turn);
#endif

float hwShadowInMap(vec3 c, int k, float turn) {
  #ifdef HW_SOFT_SHADOWS
    return hwShadowSoft(c, k, turn);
  #else
    return hwShadowFilter(c, k, max(1.0, uHwShadowBlur / hwOfMap(uHwShadowTexel, k)), 8, turn);
  #endif
}

// A surface's point in map k, lifted off the surface by about a texel (more where the light grazes it) and nudged towards the light, so a surface never shadows itself.
vec3 hwShadowReceiver(vec3 world, vec3 normal, int k) {
  float texel = hwOfMap(uHwShadowTexel, k);
  float grazing = 1.0 - abs(dot(normal, uHwSunDir));
  vec3 c = hwShadowCoord(world + normal * texel * (0.7 + 1.8 * grazing), k);
  c.z += texel * 0.5 / hwOfMap(uHwShadowDepthRange, k);
  return c;
}

// How lit a surface is by the key light, from 0 in full shadow to 1.
float hwShadowAt(vec3 world, vec3 normal) {
  float away = length(world - cameraPosition);
  if (away >= uHwShadowFade.y || uHwShadowStrength <= 0.0) return 1.0;
  float turn = hwShadowTurn();
  float lit = 1.0;
  for (int k = 0; k < HW_SHADOW_MAPS; k++) {
    vec3 c = hwShadowReceiver(world, normal, k);
    if (!hwInShadowMap(c)) continue;
    lit = hwShadowInMap(c, k, turn);
    // Towards the edge of its map, a point eases into the next, so no seam shows where one map hands over.
    float edge = max(abs(c.x - 0.5), abs(c.y - 0.5)) * 2.0;
    float blend = smoothstep(0.8, 0.95, edge);
    if (blend > 0.0 && k + 1 < HW_SHADOW_MAPS) {
      lit = mix(lit, hwShadowInMap(hwShadowReceiver(world, normal, k + 1), k + 1, turn), blend);
    }
    break;
  }
  lit = mix(lit, 1.0, smoothstep(uHwShadowFade.x, uHwShadowFade.y, away));
  return mix(1.0, lit, uHwShadowStrength);
}

// How far the key light has come through things before it reaches a point, in metres, from a few taps round it: 0 in the open.
float hwLightThrough(vec3 world) {
  for (int k = 0; k < HW_SHADOW_MAPS; k++) {
    vec3 c = hwShadowCoord(world, k);
    if (!hwInShadowMap(c)) continue;
    float through = 0.0;
    vec2 across = vec2(1.5 / uHwShadowSize);
    for (int i = 0; i < 4; i++) {
      through += max(hwLightDepth(c.xy + hwShadowDisc(i, 4, 0.7) * across, k) - c.z, 0.0);
    }
    return through * 0.25 * hwOfMap(uHwShadowDepthRange, k);
  }
  return 0.0;
}
`;

function shadowTarget(size: number): WebGLRenderTarget {
  const depth = new DepthTexture(size, size, FloatType);
  // Compared in hardware as the world's depth runs, reversed: lit where the point is at least as near the light as what the map holds.
  depth.compareFunction = GreaterEqualCompare;
  depth.minFilter = LinearFilter;
  depth.magFilter = LinearFilter;
  return new WebGLRenderTarget(size, size, {
    type: FloatType,
    format: RedFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthTexture: depth,
  });
}

/** The pass that draws the maps, made while the shadows are on: its atlas is allocated on its first frame that casts, and sized for one map or four. */
export function shadowMapPass(): FeaturePass {
  const size = QUALITY.shadowMap;
  const cameras = Array.from({ length: MAX_SHADOW_MAPS }, () => new OrthographicCamera());
  const frame = lightFrame(new Vector3(0, 1, 0));
  const toLight = new Vector3();
  const centre = new Vector3();
  const forward = new Vector3();
  const saved = new Color();
  const nothing = new Color(0, 0, 0);
  let target: WebGLRenderTarget | null = null;
  /** Frames drawn since the atlas was made: the two far maps are drawn on alternate frames, all of them on the first. */
  let drawn = 0;

  const free = (): void => {
    target?.depthTexture?.dispose();
    target?.dispose();
    target = null;
  };

  /** The atlas for `across` maps a side, made anew when that changes. */
  const atlas = (across: number): WebGLRenderTarget => {
    if (target?.width !== size * across) {
      free();
      target = shadowTarget(size * across);
      drawn = 0;
    }
    return target;
  };

  const render = ({ gl, scene, camera, day }: PassFrame): void => {
    const u = SHADOW_UNIFORMS;
    u.uHwShadowStrength.value = shadowLight.casting ? shadowLight.strength : 0;
    if (u.uHwShadowStrength.value <= 0) return;
    if (!(camera instanceof PerspectiveCamera)) throw new Error("The shadows follow a perspective camera");

    const count = liveFeatures().isOn("shadowCascades") ? MAX_SHADOW_MAPS : 1;
    const across = count === 1 ? 1 : 2;
    const reach = count === 1 ? QUALITY.shadowReachNear : QUALITY.shadowReach;
    const maps = atlas(across);
    u.uHwShadowMap.value = maps.depthTexture;
    u.uHwShadowDepth.value = maps.texture;
    u.uHwShadowTiles.value = across;
    u.uHwShadowSize.value = size;
    u.uHwShadowAngle.value = shadowLight.angle;
    u.uHwShadowBlur.value = shadowLight.blur;
    u.uHwShadowFade.value.set(reach * 0.75, reach);

    const dir = day.sky.key.direction;
    toLight.set(dir.x, dir.y, dir.z).normalize();
    lightFrame(toLight, frame);
    camera.updateMatrixWorld();
    camera.getWorldDirection(forward);
    camera.getWorldPosition(CASTER_EYE.value);
    const splits = splitDistances(FIRST_SLICE, reach, count);
    splits[0] = camera.near;
    const fov = camera.getEffectiveFOV();

    const before = { target: gl.getRenderTarget(), autoClear: gl.autoClear, alpha: gl.getClearAlpha() };
    gl.getClearColor(saved);
    const restore = castersOnly(scene);
    // Nothing in the light: the far end of the reversed depth, and no depth to read.
    gl.setClearColor(nothing, 0);
    gl.autoClear = false;
    maps.scissorTest = true;

    for (let k = 0; k < count; k++) {
      // The far maps change little from frame to frame (a shadow a few hundred metres off moves by less than their texel), so each is drawn every other frame, keeping the matrix it was drawn with.
      if (drawn > 0 && k >= 2 && k % 2 !== drawn % 2) continue;
      const sphere = sliceSphere({ fov, aspect: camera.aspect }, splits[k], splits[k + 1]);
      const radius = steadyRadius(sphere.radius);
      const texel = (2 * radius) / size;
      centre.copy(CASTER_EYE.value).addScaledVector(forward, sphere.along);
      snapToTexels(centre, frame, texel, centre);
      const cam = cameras[k];
      const back = radius + CASTER_REACH;
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.near = 0;
      cam.far = radius + back;
      cam.position.copy(centre).addScaledVector(toLight, back);
      cam.up.copy(frame.up);
      cam.lookAt(centre);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const x = (k % 2) * size;
      const y = Math.floor(k / 2) * size;
      maps.viewport.set(x, y, size, size);
      maps.scissor.set(x, y, size, size);
      gl.setRenderTarget(maps);
      gl.clear(true, true, false);
      gl.render(scene, cam);
      // Read after drawing: the renderer turns the light's projection to the reversed depth as it draws.
      squareMatrix(cam.projectionMatrix, cam.matrixWorldInverse, u.uHwShadowMatrix.value[k]);
      u.uHwShadowTexel.value.setComponent(k, texel);
      u.uHwShadowDepthRange.value.setComponent(k, cam.far - cam.near);
    }

    drawn++;
    maps.scissorTest = false;
    restore();
    gl.autoClear = before.autoClear;
    gl.setClearColor(saved, before.alpha);
    gl.setRenderTarget(before.target);
  };

  return { render, dispose: free };
}
