import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { CoatLook } from "../../cats/coat-look";
import { EAR, EAR_SHAPE, HIP, SHOULDER, SKULL, TAIL_ROOT } from "../../cats/rig";

/*
 * A cat's coat as a shader on a soft, rough standard material: every marking is a
 * pattern function of where a point lies on the cat in its bind pose, so the
 * coat moves with the body however it bends. In order: the pigment (black or
 * orange, with a tortie's patches between them), the tabby pattern the agouti
 * shows, the colourpoint's pale body, the white spotting, and then the face:
 * eyes, nose and the inside of the ears. The sculpture's own hollows darken
 * it, and a soft sheen at the silhouette reads as fur.
 */

export interface CoatUniforms {
  [uniform: string]: THREE.IUniform;
  uBlink: THREE.IUniform<number>;
}

const glslVec = (v: readonly number[]) => `vec3(${v.map((n) => n.toFixed(4)).join(", ")})`;

const COAT_GLSL = /* glsl */ `
uniform vec3 uEu;
uniform vec3 uEuGround;
uniform vec3 uPh;
uniform vec3 uPhGround;
uniform vec3 uWhiteColour;
uniform vec3 uPointBody;
uniform vec3 uEyeL;
uniform vec3 uEyeR;
uniform vec3 uNose;
uniform vec3 uInnerEar;
uniform vec3 uPupil;
uniform vec3 uGlint;
uniform float uOrange;
uniform float uOrangeShare;
uniform float uPatchSize;
uniform float uAgouti;
uniform float uPattern;
uniform float uWhite;
uniform float uPointed;
uniform float uLongHair;
uniform vec3 uMarks;
uniform float uBlink;
varying vec3 vRest;
varying vec3 vRestNormal;
varying float vPart;
varying float vOcclusion;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 EAR = ${glslVec(EAR)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
const float HIP_Z = ${HIP[2].toFixed(4)};
const float SHOULDER_Z = ${SHOULDER[2].toFixed(4)};
const float EAR_WIDTH = ${EAR_SHAPE.width.toFixed(4)};
const float EAR_HEIGHT = ${EAR_SHAPE.height.toFixed(4)};
const float EAR_DEPTH = ${EAR_SHAPE.depth.toFixed(4)};
const float EAR_SPLAY = ${EAR_SHAPE.splay.toFixed(4)};
const float EAR_TURN = ${EAR_SHAPE.turn.toFixed(4)};
const float EAR_INSET = ${EAR_SHAPE.cupInset.toFixed(4)};
const float EAR_LIFT = ${EAR_SHAPE.cupLift.toFixed(4)};
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

// One soft line: 1 within width of zero.
float line(float s, float width) {
  float edge = width * (0.5 + 0.5 * uLongHair);
  return smoothstep(width + edge, width - edge * 0.5, abs(s));
}

// A soft band: 1 inside a stripe, 0 between, its edge a little blurred (more for long hair).
float band(float s, float width) {
  float edge = 0.12 + 0.18 * uLongHair;
  return smoothstep(width + edge, width - edge, abs(fract(s) - 0.5) * 2.0);
}

bool isHead() { return vPart > 0.5; }
bool isTail(vec3 p) { return !isHead() && p.z < TAIL_ROOT.z + 0.01 && p.y > 0.16; }
// How far down a leg a point lies: 0 at the body, 1 at the paw.
float legAmount(vec3 p) { return isHead() || isTail(p) ? 0.0 : smoothstep(0.155, 0.02, p.y); }
float tailAlong(vec3 p) { return clamp((TAIL_ROOT.z - p.z) / 0.3, 0.0, 1.0); }

// 1 on a tabby's dark markings, 0 on its ground.
float tabby(vec3 p) {
  float warp = (fbm(p * 18.0 + uMarks) - 0.5) * 0.9;
  if (isHead()) {
    vec3 q = p - SKULL;
    // The M on the forehead: short stripes up from the brow.
    float forehead = smoothstep(0.0, 0.02, q.y) * smoothstep(0.02, 0.045, q.z) * step(abs(q.x), 0.034);
    float m = band(q.x / 0.017 + 0.5, 0.42) * forehead;
    // The lines running back from the outer corner of each eye over the cheek.
    float cheekLine = line(q.y + 0.004 + (0.04 - q.z) * 0.22, 0.0035) * smoothstep(0.028, 0.045, abs(q.x)) * smoothstep(0.05, 0.0, q.z);
    float lowerLine = line(q.y + 0.024 + (0.03 - q.z) * 0.3, 0.003) * smoothstep(0.035, 0.05, abs(q.x)) * smoothstep(0.04, 0.0, q.z);
    // Stripes over the crown and down the back of the head.
    float crown = band(q.x / 0.019 + 0.5, 0.36) * step(abs(q.x), 0.04) * smoothstep(0.03, 0.05, q.y + q.z * 0.3) * smoothstep(0.03, -0.01, q.z);
    return max(max(m, max(cheekLine, lowerLine) * 0.9), crown);
  }
  if (isTail(p)) {
    float along = tailAlong(p);
    float rings = band(along * 7.0 + warp * 0.2, uPattern == 3.0 ? 0.25 : 0.45);
    return max(rings * (uPattern == 3.0 ? 0.5 : 1.0), smoothstep(0.8, 0.86, along));
  }
  float leg = legAmount(p);
  if (leg > 0.0) {
    float bars = band(p.y / 0.03 + warp * 0.3, uPattern == 3.0 ? 0.3 : 0.45);
    // A dark sole line up the back of the hind foot.
    float sole = smoothstep(0.06, 0.0, p.y) * smoothstep(HIP_Z - 0.008, HIP_Z - 0.016, p.z) * step(p.z, HIP_Z);
    return max(bars * leg * (uPattern == 3.0 ? 0.45 : 0.9), sole);
  }
  // The spine: a dark line down the back.
  float top = smoothstep(0.26, 0.29, p.y + abs(p.x) * -0.4);
  float spine = top * band(p.x / 0.05 + 0.5, uPattern == 1.0 ? 0.85 : 0.6);
  float side = smoothstep(0.13, 0.2, p.y);
  if (uPattern == 0.0) {
    // Mackerel: thin stripes down the sides, like a fish's bones.
    float stripes = band(p.z / 0.034 + warp + abs(p.x) * 2.0, 0.3) * side;
    stripes *= smoothstep(0.25, 0.45, fbm(p * 30.0 + uMarks.yzx));
    return max(spine, stripes);
  }
  if (uPattern == 2.0) {
    // Spotted: the mackerel's stripes broken into spots.
    // Round spots in rows down the sides, each row offset by half a spot.
    vec2 cell = vec2(p.z / 0.036 + warp * 0.6 + abs(p.x) * 2.0, p.y / 0.032 + warp * 0.3);
    cell.y += floor(cell.x) * 0.5;
    float spots = smoothstep(0.34, 0.24, length(fract(cell) - 0.5));
    return max(spine * 0.8, spots * smoothstep(0.12, 0.17, p.y));
  }
  if (uPattern == 1.0) {
    // Classic: a bullseye on each flank, a butterfly over the shoulders.
    vec2 flank = vec2(p.y - 0.205, p.z - (HIP_Z + SHOULDER_Z) * 0.5 + 0.02);
    float bull = band(length(flank * vec2(1.25, 1.0)) / 0.05 + warp * 0.35, 0.5) * smoothstep(0.03, 0.06, abs(p.x));
    vec2 wing = vec2(p.y - 0.255, p.z - SHOULDER_Z);
    float butterfly = band(length(wing * vec2(1.6, 1.0)) / 0.04 + warp * 0.3, 0.5) * top;
    return max(max(spine, bull * side), butterfly);
  }
  // Ticked: no stripes on the body, only the spine's shading.
  return spine * 0.5;
}

// Where a tortoiseshell's coat is orange, 0 to 1.
float orangeAmount(vec3 p) {
  if (uOrange < 0.25) return 0.0;
  if (uOrange > 0.75) return 1.0;
  float scale = 9.0 / uPatchSize;
  float field = fbm(p * scale + uMarks * 1.7);
  // A tortie's patches are brindled, a calico's clean.
  float brindle = (noise3(p * 140.0 + uMarks) - 0.5) * 0.22 / uPatchSize;
  float threshold = mix(0.62, 0.38, uOrangeShare);
  return smoothstep(threshold - 0.015, threshold + 0.015, field + brindle);
}

// How strongly a point is a colourpoint's point: the mask, ears, legs and tail.
float pointAmount(vec3 p) {
  if (isHead()) {
    vec3 q = p - SKULL;
    float mask = smoothstep(0.06, 0.025, length((q - vec3(0.0, -0.018, 0.06)) * vec3(0.9, 1.1, 1.0)));
    float ears = smoothstep(EAR.y - 0.003, EAR.y + 0.02, p.y);
    return max(mask, ears);
  }
  if (isTail(p)) return smoothstep(0.0, 0.35, tailAlong(p));
  return max(legAmount(p) * 1.2, 0.18 * smoothstep(0.24, 0.3, p.y));
}

// How readily a point turns white as white spotting grows: the chest and belly
// first, then the chin, paws and legs, the sides, the face's blaze, the back,
// and last of all the top of the head, the ears and the tail.
float whitePotential(vec3 p) {
  if (isHead()) {
    vec3 q = p - SKULL;
    float muzzle = 0.95 - length((q - vec3(0.0, -0.03, 0.05)) * vec3(1.0, 1.4, 1.0)) * 14.0;
    float blaze = 0.55 - abs(q.x) * 30.0 - max(0.0, q.y) * 6.0;
    float cap = -0.1 + smoothstep(0.04, -0.04, q.y) * 0.3;
    float ear = p.y > EAR.y ? -0.4 : 0.0;
    return max(max(muzzle, blaze * step(0.02, q.z)), cap) + ear;
  }
  if (isTail(p)) return -0.15 - tailAlong(p) * 0.2;
  float leg = legAmount(p);
  float height = clamp((p.y - 0.13) / 0.17, 0.0, 1.0);
  float body = 1.0 - height * 0.95 + smoothstep(SHOULDER_Z - 0.02, SHOULDER_Z + 0.04, p.z) * (1.0 - height) * 0.12;
  float limbs = 0.9 - p.y * 1.4;
  return mix(body, limbs, leg);
}

float whiteAmount(vec3 p) {
  if (uWhite <= 0.0) return 0.0;
  if (uWhite >= 1.0) return 1.0;
  float threshold = 1.0 - uWhite * 1.08;
  float edge = (fbm(p * 6.5 + uMarks.zyx) - 0.5) * 0.6 + (noise3(p * 30.0 + uMarks) - 0.5) * 0.12;
  return smoothstep(threshold - 0.01, threshold + 0.01, whitePotential(p) + edge);
}

vec3 coatColour(vec3 p) {
  float stripe = tabby(p);
  float ticking = (noise3(p * 260.0) - 0.5) * (uPattern == 3.0 ? 0.5 : 0.25);
  float belly = smoothstep(0.2, 0.13, p.y) * (isHead() ? 0.0 : 1.0);
  // A tabby's muzzle, chin and eye rims are pale.
  float pale = 0.0;
  if (isHead()) {
    vec3 q = p - SKULL;
    pale = smoothstep(0.034, 0.018, length((q - vec3(0.0, -0.03, 0.058)) * vec3(1.0, 1.3, 1.0)));
  }
  vec3 ground = mix(uEuGround, uEuGround * 1.22, max(belly, pale));
  vec3 eu = uAgouti > 0.5 ? mix(ground, uEu, clamp(stripe + ticking * (1.0 - stripe), 0.0, 1.0)) : uEu;
  vec3 ph = mix(mix(uPhGround, uPhGround * 1.12, max(belly, pale)), uPh, clamp(stripe * (uAgouti > 0.5 ? 1.0 : 0.85) + ticking * 0.4, 0.0, 1.0));
  vec3 colour = mix(eu, ph, orangeAmount(p));
  if (uPointed > 0.5) {
    vec3 pale = mix(uPointBody, colour, 0.1);
    colour = mix(pale, colour, pointAmount(p));
  }
  return mix(colour, uWhiteColour, whiteAmount(p));
}

// The eye of one side, drawn on the face: the iris, the pupil, a glint and a dark rim, closed by the lids.
vec4 eye(vec3 p, float side, vec3 iris, inout float glint) {
  vec3 centre = SKULL + vec3(0.0272 * side, 0.0035, 0.0525);
  vec3 forward = normalize(vec3(0.38 * side, 0.06, 0.92));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 q = p - centre;
  if (dot(q, forward) < -0.008) return vec4(0.0);
  vec2 uv = vec2(dot(q, right), dot(q, up)) / 0.0145;
  // The opening: an almond, its lids meeting as the eye shuts.
  float open = 1.0 - uBlink;
  float lid = sqrt(max(0.0, 1.0 - uv.x * uv.x)) * mix(0.04, 0.92, open) - abs(uv.y) * 1.0;
  float shape = step(0.0, lid) * step(abs(uv.x), 1.0);
  float rim = smoothstep(-0.14, -0.02, lid) * step(abs(uv.x), 1.12) * (1.0 - shape);
  if (shape <= 0.0 && rim <= 0.0) return vec4(0.0);
  vec3 colour = mix(iris * 0.78, iris * 1.08, smoothstep(-0.6, 0.6, -uv.y));
  float pupil = smoothstep(0.08, 0.0, length(uv * vec2(1.0 / 0.32, 1.0 / 0.82)) - 0.6);
  colour = mix(colour, uPupil, pupil);
  float spark = smoothstep(0.24, 0.16, length(uv - vec2(0.32 * side, 0.34))) * shape * open;
  glint = max(glint, spark);
  colour = mix(colour, uGlint, spark);
  colour = mix(colour, uPupil * 1.4, rim);
  return vec4(colour, max(shape, rim));
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (!isHead()) return coat;
  vec3 q = p - SKULL;
  vec3 colour = coat;
  // The inside of the ear: the cup, found in the left ear's own frame.
  vec3 e = vec3(abs(p.x), p.y, p.z) - EAR;
  float cy = cos(EAR_TURN), sy = sin(EAR_TURN), cz = cos(EAR_SPLAY), sz = sin(EAR_SPLAY);
  e = vec3(cy * e.x - sy * e.z, e.y, sy * e.x + cy * e.z);
  e = vec3(cz * e.x + sz * e.y, -sz * e.x + cz * e.y, e.z);
  if (e.y > EAR_LIFT && e.z > 0.0) {
    float t = clamp((e.y - EAR_LIFT) / EAR_HEIGHT, 0.0, 1.0);
    float r = max(0.002, EAR_WIDTH * 0.5 * (1.0 - t) + 0.005 * t - EAR_INSET);
    float cup = length(vec2(e.x / r, (e.z - EAR_WIDTH * EAR_DEPTH * 0.42) / (r * EAR_DEPTH)));
    float inner = smoothstep(1.25, 0.95, cup) * smoothstep(EAR_LIFT, EAR_LIFT + 0.01, e.y);
    colour = mix(colour, mix(uInnerEar, coat, 0.2 + 0.25 * uLongHair), inner);
  }
  // The nose leather: a small rounded triangle, point down.
  vec2 n = vec2(q.x, q.y + 0.011);
  float nose = step(0.0, q.z - 0.066) * smoothstep(0.0012, 0.0, abs(n.x) - (0.0035 + (n.y + 0.004) * 0.75)) * step(-0.004, n.y) * step(n.y, 0.0055);
  colour = mix(colour, uNose, nose);
  // The line from the nose down to the mouth.
  float philtrum = step(0.0, q.z - 0.06) * smoothstep(0.0011, 0.0004, abs(q.x)) * step(q.y, -0.015) * step(-0.026, q.y);
  colour = mix(colour, uPupil * 1.8, philtrum * 0.6);
  vec4 left = eye(p, 1.0, uEyeL, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, uEyeR, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
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

/** A coat's material. Each cat has its own, sharing one compiled program. */
export function coatMaterial(look: CoatLook): { material: THREE.MeshStandardMaterial; uniforms: CoatUniforms } {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms: CoatUniforms = {
    uEu: colour(c.eumelanin),
    uEuGround: colour(c.eumelaninGround),
    uPh: colour(c.phaeomelanin),
    uPhGround: colour(c.phaeomelaninGround),
    uWhiteColour: colour(c.white),
    uPointBody: colour(c.pointBody),
    uEyeL: colour(c.eyeLeft),
    uEyeR: colour(c.eyeRight),
    uNose: colour(c.nose),
    uInnerEar: colour(c.innerEar),
    uPupil: colour(c.pupil),
    uGlint: colour(c.glint),
    uOrange: { value: look.orange },
    uOrangeShare: { value: look.orangeShare },
    uPatchSize: { value: look.patchSize },
    uAgouti: { value: look.agouti },
    uPattern: { value: look.pattern },
    uWhite: { value: look.white },
    uPointed: { value: look.pointed },
    uLongHair: { value: look.longHair },
    uMarks: { value: new THREE.Vector3(...look.marks) },
    uBlink: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  material.customProgramCacheKey = () => "hearthwood-cat-coat";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRest = position;
      vRestNormal = normal;
      vPart = aPart;
      vOcclusion = aOcclusion;`,
    );
    shader.fragmentShader = COAT_GLSL + shader.fragmentShader
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
        totalEmissiveRadiance += sheen * pow(1.0 - facing, 2.5) * (0.28 + 0.15 * uLongHair) + uGlint * glint * 0.35;`,
      );
  };
  return { material, uniforms };
}
