import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { FoxCoatLook } from "../../foxes/coat-look";
import { EAR, EAR_SHAPE, HIP, MOUTH_Y, NOSE, NOSE_RADII, SHOULDER, SKULL, TAIL_ROOT } from "../../foxes/rig";
import { coatMaterial, glslEar, glslFloat, glslVec, type CoatShader } from "../animals/coat-material";

/*
 * A fox's coat, on the shared coat shader (`../animals/coat-material.ts`):
 * the red (paler on the flanks, deepest along the back, grizzled on the
 * brush), the white of the throat, chest and lips spreading down the belly,
 * the dark socks, the black backs of the ears and the white tip of the tail;
 * a cross fox's dark cross over the shoulders, legs and belly; a silver
 * fox's black frosted with silver. Then the face: amber eyes with a slit
 * pupil, the dark mark from eye to muzzle, the black nose, the mouth, the
 * tongue and the cream inside of the ears.
 */

const FOX_COAT: CoatShader = {
  key: "hearthwood-fox-coat",
  glsl: /* glsl */ `
uniform vec3 uRed;
uniform vec3 uGinger;
uniform vec3 uWhiteColour;
uniform vec3 uDark;
uniform vec3 uFrost;
uniform vec3 uEye;
uniform vec3 uNose;
uniform vec3 uInnerEar;
uniform vec3 uTongue;
uniform vec3 uMouth;
uniform float uPhase;
uniform float uDepth;
uniform float uBib;
uniform float uSocks;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 NOSE_RADII = ${glslVec(NOSE_RADII)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
const float HIP_Z = ${glslFloat(HIP[2])};
const float SHOULDER_Z = ${glslFloat(SHOULDER[2])};
const float MOUTH_Y = ${glslFloat(MOUTH_Y)};
${glslEar("EAR", EAR, EAR_SHAPE)}

bool isTongue() { return vPart > 1.5; }
bool isTail(vec3 p) { return !isHead() && p.z < TAIL_ROOT.z - 0.015 && p.y > 0.19; }
float tailAlong(vec3 p) { return clamp((TAIL_ROOT.z - p.z) / 0.3, 0.0, 1.0); }
// How far down a leg a point lies: 0 at the body, 1 at the paw.
float legAmount(vec3 p) { return isHead() || isTail(p) ? 0.0 : smoothstep(0.17, 0.05, p.y); }
// Fine streaks along the hair.
float streaks(vec3 p) { return noise3(p * vec3(150.0, 40.0, 70.0) + uMarks); }

// How white a point is: the throat and chest, down the belly as far as the bib reaches, the lips, chin and cheeks, the tail's tip.
float whiteAmount(vec3 p) {
  float edge = (fbm(p * 18.0 + uMarks) - 0.5) * 0.02;
  if (isHead()) {
    vec3 q = p - SKULL;
    float chin = smoothstep(MOUTH_Y + 0.002, MOUTH_Y - 0.004, p.y + edge * 0.3);
    float lip = smoothstep(MOUTH_Y + 0.008, MOUTH_Y + 0.003, p.y - max(0.0, 0.06 - q.z) * 0.12) * smoothstep(0.004, 0.01, abs(q.x)) * step(0.02, q.z);
    float cheek = smoothstep(-0.008, -0.022, q.y + edge) * smoothstep(0.018, 0.03, abs(q.x)) * smoothstep(-0.03, 0.0, q.z);
    return max(max(chin, lip), cheek);
  }
  if (isTail(p)) return smoothstep(0.86, 0.9, tailAlong(p) + edge);
  float leg = legAmount(p);
  float throat = smoothstep(SHOULDER_Z - 0.01, SHOULDER_Z + 0.03, p.z + edge) * smoothstep(0.27, 0.22, p.y + abs(p.x) * 0.5);
  // The bib's white runs back under the belly between the legs.
  float under = smoothstep(0.19, 0.16, p.y + abs(p.x) * 0.4 + edge) * smoothstep(HIP_Z + 0.02, HIP_Z + 0.1 + (1.0 - uBib) * 0.14, p.z);
  return max(throat, under * uBib) * (1.0 - leg);
}

// How dark a point is: the socks up the legs, the backs of the ears, and a cross fox's cross over the shoulders and down the back.
float darkAmount(vec3 p) {
  float edge = (fbm(p * 14.0 + uMarks.zyx) - 0.5) * 0.04;
  if (isHead()) {
    vec3 q = p - SKULL;
    float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
    float ears = smoothstep(EAR.y + 0.008, EAR.y + 0.03, p.y) * (1.0 - inner);
    // The dark tear line from the eye's front corner down the side of the muzzle.
    float tear = smoothstep(0.006, 0.002, abs(q.y + 0.004 + (q.z - 0.045) * 0.35)) * smoothstep(0.004, 0.012, abs(q.x)) * smoothstep(0.04, 0.05, q.z) * smoothstep(0.08, 0.06, q.z);
    float crossFace = uPhase > 0.5 ? smoothstep(0.03, 0.07, q.z) * 0.6 * smoothstep(-0.01, 0.01, q.y) : 0.0;
    return max(max(ears, tear * 0.75), crossFace);
  }
  if (isTail(p)) {
    // A few dark guard hairs along the top of the brush, and a darker band before its white tip.
    float top = smoothstep(TAIL_ROOT.y, TAIL_ROOT.y + 0.03, p.y) * 0.25 * streaks(p);
    float band = smoothstep(0.7, 0.82, tailAlong(p)) * smoothstep(0.9, 0.84, tailAlong(p)) * 0.35;
    return max(top, band) + (uPhase > 0.5 ? 0.35 : 0.0);
  }
  float leg = legAmount(p);
  float socks = smoothstep(1.0 - uSocks * 0.85, 1.05 - uSocks * 0.85, leg + edge);
  // Darker down the front of the forelegs, as a fox's legs are.
  float front = smoothstep(0.3, 0.6, leg) * step(SHOULDER_Z - 0.05, p.z) * step(0.0, p.z - SHOULDER_Z + 0.025) * 0.6;
  float dark = max(socks, front);
  if (uPhase > 0.5) {
    float spine = smoothstep(0.03, 0.01, abs(p.x) + edge * 0.5) * smoothstep(0.25, 0.29, p.y);
    float shoulders = smoothstep(0.035, 0.015, abs(p.z - SHOULDER_Z + 0.01) + edge) * smoothstep(0.2, 0.26, p.y);
    float belly = smoothstep(0.2, 0.15, p.y) * 0.8;
    dark = max(dark, max(max(spine, shoulders), max(belly, smoothstep(0.1, 0.5, leg))));
  }
  return dark;
}

vec3 coatColour(vec3 p) {
  float underside = isHead() ? 0.0 : smoothstep(0.24, 0.18, p.y) * (1.0 - legAmount(p) * 0.5);
  float top = isHead() ? smoothstep(0.0, 0.03, p.y - SKULL.y) : smoothstep(0.25, 0.3, p.y - abs(p.x) * 0.3);
  vec3 red = mix(uGinger, uRed, uDepth);
  red = mix(red, mix(uGinger, uWhiteColour, 0.25), underside * 0.6);
  red = mix(red, red * 0.82, top * 0.7);
  // The brush is grizzled: its hairs tipped dark and pale.
  if (isTail(p)) red = mix(red, mix(red * 0.75, uGinger, streaks(p)), 0.4);
  vec3 colour = red;
  if (uPhase > 1.5) {
    // A silver fox: black all over, frosted with silver along the back and sides.
    // Each guard hair tipped silver: a fine, even frosting, thickest over the back and haunches.
    float hairs = noise3(p * vec3(420.0, 160.0, 260.0) + uMarks) * 0.6 + noise3(p * 900.0 + uMarks.yzx) * 0.4;
    float frost = smoothstep(0.35, 0.9, hairs) * (isHead() ? 0.2 : 0.45) * (1.0 - legAmount(p)) * (isTail(p) ? 0.6 : 1.0);
    colour = mix(uDark, uFrost, frost * (0.4 + 0.6 * top));
  } else {
    colour = mix(colour, uDark, clamp(darkAmount(p), 0.0, 1.0));
  }
  colour *= 1.0 + (streaks(p) - 0.5) * 0.08;
  return mix(colour, uWhiteColour, whiteAmount(p) * (uPhase > 1.5 ? (isTail(p) ? 1.0 : 0.35) : 1.0));
}

// The eye of one side: almond, amber, with a fox's upright slit of a pupil.
vec4 eye(vec3 p, float side, inout float glint) {
  vec3 centre = SKULL + vec3(0.0195 * side, 0.005, 0.041);
  return paintedEye(p, centre, normalize(vec3(0.42 * side, 0.08, 0.9)), 0.0088, vec2(0.28, 0.85), 0.72, side, uEye, glint);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (isTongue()) return uTongue * (1.0 - smoothstep(0.002, 0.0, abs(p.x)) * 0.25);
  if (!isHead()) return coat;
  vec3 colour = coat;
  float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
  colour = mix(colour, mix(uInnerEar, coat, 0.15), inner);
  vec3 q = p - SKULL;
  float corner = smoothstep(0.07, 0.035, q.z);
  float mouth = smoothstep(0.0028, 0.001, abs(p.y - MOUTH_Y - corner * 0.005)) * step(0.03, q.z) * step(abs(q.x), 0.026);
  colour = mix(colour, uMouth, mouth);
  float n = length((p - NOSE) / NOSE_RADII);
  float nose = smoothstep(1.25, 1.08, n);
  colour = mix(colour, uNose, nose);
  float shine = smoothstep(0.003, 0.001, length(p - (NOSE + vec3(0.0, NOSE_RADII.y * 0.7, NOSE_RADII.z * 0.5)))) * nose;
  glint = max(glint, shine * 0.5);
  vec4 left = eye(p, 1.0, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

/** A fox's coat material. Each fox has its own, sharing one compiled program. */
export function foxCoatMaterial(look: FoxCoatLook) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uRed: colour(c.red),
    uGinger: colour(c.ginger),
    uWhiteColour: colour(c.white),
    uDark: colour(c.dark),
    uFrost: colour(c.frost),
    uEye: colour(c.eye),
    uPupil: colour(c.pupil),
    uGlint: colour(c.glint),
    uNose: colour(c.nose),
    uInnerEar: colour(c.innerEar),
    uTongue: colour(c.tongue),
    uMouth: colour(c.mouth),
    uPhase: { value: look.phase },
    uDepth: { value: look.depth },
    uBib: { value: look.bib },
    uSocks: { value: look.socks },
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(FOX_COAT, uniforms, 0.3);
}
