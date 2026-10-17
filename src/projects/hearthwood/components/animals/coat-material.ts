import * as THREE from "three";
import type { EarShape } from "../../animals/sculpt";
import type { Vec3 } from "../../animals/rig";

/*
 * An animal's coat as a shader on a soft, rough standard material. Every
 * marking is a pattern function of where a point lies on the animal in its
 * bind pose, so the coat moves with the body however it bends. A species
 * gives the patterns: `coatColour(p)` for the fur and `faceColour(p, coat,
 * glint)` for what is painted over it (eyes, nose, the inside of the ears).
 * This gives them the noise they are built from, a painted eye and an ear's
 * cup, and lays the rest over every species alike: the sculpture's own
 * hollows darken the coat, and a soft sheen at the silhouette reads as fur.
 */

export interface CoatUniforms {
  [uniform: string]: THREE.IUniform;
  uBlink: THREE.IUniform<number>;
}

export const glslVec = (v: Vec3 | readonly number[]) => `vec3(${v.map((n) => n.toFixed(4)).join(", ")})`;
export const glslFloat = (n: number) => n.toFixed(4);

/** The left ear's shape as GLSL constants, `<NAME>_WIDTH` and so on, for `earCup`. */
export function glslEar(name: string, at: Vec3, shape: EarShape): string {
  return `
const vec3 ${name} = ${glslVec(at)};
const float ${name}_WIDTH = ${glslFloat(shape.width)};
const float ${name}_HEIGHT = ${glslFloat(shape.height)};
const float ${name}_DEPTH = ${glslFloat(shape.depth)};
const float ${name}_SPLAY = ${glslFloat(shape.splay)};
const float ${name}_TURN = ${glslFloat(shape.turn)};
const float ${name}_INSET = ${glslFloat(shape.cupInset)};
const float ${name}_LIFT = ${glslFloat(shape.cupLift)};
const float ${name}_TIP = ${glslFloat(shape.tip)};`;
}

const PRELUDE = /* glsl */ `
uniform vec3 uPupil;
uniform vec3 uGlint;
uniform float uBlink;
uniform float uSheen;
varying vec3 vRest;
varying vec3 vRestNormal;
varying float vPart;
varying float vOcclusion;

const float TAU = 6.2831853;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  return 0.55 * noise3(p) + 0.3 * noise3(p * 2.03 + 7.1) + 0.15 * noise3(p * 4.1 + 3.3);
}

bool isHead() { return vPart > 0.5; }

// An eye painted on the face, centred at centre and looking along forward, radius across: the iris, the
// pupil (its radii a share of the eye's), a glint and a dark rim, its lids an almond open to open at most
// and closing as the animal blinks.
vec4 paintedEye(vec3 p, vec3 centre, vec3 forward, float radius, vec2 pupilShape, float open, float side, vec3 iris, inout float glint) {
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 q = p - centre;
  if (dot(q, forward) < -radius * 0.55) return vec4(0.0);
  vec2 uv = vec2(dot(q, right), dot(q, up)) / radius;
  float opening = 1.0 - uBlink;
  float lid = sqrt(max(0.0, 1.0 - uv.x * uv.x)) * mix(0.04, open, opening) - abs(uv.y) * 1.0;
  float shape = step(0.0, lid) * step(abs(uv.x), 1.0);
  float rim = smoothstep(-0.14, -0.02, lid) * step(abs(uv.x), 1.12) * (1.0 - shape);
  if (shape <= 0.0 && rim <= 0.0) return vec4(0.0);
  vec3 colour = mix(iris * 0.78, iris * 1.08, smoothstep(-0.6, 0.6, -uv.y));
  float pupil = smoothstep(0.08, 0.0, length(uv / pupilShape) - 0.6);
  colour = mix(colour, uPupil, pupil);
  float spark = smoothstep(0.24, 0.16, length(uv - vec2(0.32 * side, 0.34))) * shape * opening;
  glint = max(glint, spark);
  colour = mix(colour, uGlint, spark);
  colour = mix(colour, uPupil * 1.4, rim);
  return vec4(colour, max(shape, rim));
}

// How much a point lies inside an erect ear's cup, 0 to 1: found in the left ear's own frame.
float earCup(vec3 p, vec3 ear, float width, float height, float depth, float splay, float turn, float inset, float lift, float tip) {
  vec3 e = vec3(abs(p.x), p.y, p.z) - ear;
  float cy = cos(turn), sy = sin(turn), cz = cos(splay), sz = sin(splay);
  e = vec3(cy * e.x - sy * e.z, e.y, sy * e.x + cy * e.z);
  e = vec3(cz * e.x + sz * e.y, -sz * e.x + cz * e.y, e.z);
  if (e.y <= lift || e.z <= 0.0) return 0.0;
  float t = clamp((e.y - lift) / height, 0.0, 1.0);
  float r = max(0.002, width * 0.5 * (1.0 - t) + tip * t - inset);
  float cup = length(vec2(e.x / r, (e.z - width * depth * 0.42) / (r * depth)));
  return smoothstep(1.25, 0.95, cup) * smoothstep(lift, lift + 0.01, e.y);
}
`;

const VERTEX_HEAD = /* glsl */ `
attribute float aOcclusion;
attribute float aPart;
varying vec3 vRest;
varying vec3 vRestNormal;
varying float vPart;
varying float vOcclusion;
`;

/** A species' coat shader: a name its compiled program is shared under, and its GLSL. */
export interface CoatShader {
  key: string;
  glsl: string;
}

/** An animal's coat material, from its species' shader and its own uniforms. Every animal of a species shares one compiled program. */
export function coatMaterial(shader: CoatShader, own: Record<string, THREE.IUniform>, sheen: number): { material: THREE.MeshStandardMaterial; uniforms: CoatUniforms } {
  const uniforms: CoatUniforms = { ...own, uBlink: { value: 0 }, uSheen: { value: sheen } };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  material.customProgramCacheKey = () => shader.key;
  material.onBeforeCompile = (compiled) => {
    Object.assign(compiled.uniforms, uniforms);
    compiled.vertexShader = VERTEX_HEAD + compiled.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRest = position;
      vRestNormal = normal;
      vPart = aPart;
      vOcclusion = aOcclusion;`,
    );
    compiled.fragmentShader = PRELUDE + shader.glsl + compiled.fragmentShader
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float glint = 0.0;
        vec3 coat = faceColour(vRest, coatColour(vRest), glint);
        vec4 diffuseColor = vec4(coat * mix(0.62, 1.0, vOcclusion), opacity);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        // A soft sheen at the silhouette reads as fur; a dark coat still catches a little.
        vec3 sheen = max(diffuseColor.rgb, vec3(0.16));
        totalEmissiveRadiance += sheen * pow(1.0 - facing, 2.5) * uSheen + uGlint * glint * 0.35;`,
      );
  };
  return { material, uniforms };
}
