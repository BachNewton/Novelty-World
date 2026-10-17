import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DogCoatLook } from "../../dogs/coat-look";
import { EAR, HIP, MOUTH_Y, NOSE, NOSE_RADII, PRICK_EAR, SHOULDER, SKULL, TAIL_ROOT } from "../../dogs/rig";
import { coatMaterial, glslEar, glslFloat, glslVec, type CoatShader } from "../animals/coat-material";

/*
 * A dog's coat patterns, on the shared coat shader (`../animals/coat-material.ts`).
 * In order: where the eumelanin lies over the phaeomelanin for the coat's
 * pattern (solid, clear, a sable's shading, a wolf grey's bands, tan points
 * or a saddle), brindle stripes and a mask over that, merle's torn patchwork
 * in the eumelanin, the white spotting, the grain of the fur, and then the
 * face: eyes, the nose leather, the mouth, the tongue and the inside of the ears.
 */

const DOG_COAT: CoatShader = {
  key: "hearthwood-dog-coat",
  glsl: /* glsl */ `
uniform vec3 uEu;
uniform vec3 uMerleGround;
uniform vec3 uPh;
uniform vec3 uWhiteColour;
uniform vec3 uEyeL;
uniform vec3 uEyeR;
uniform vec3 uNose;
uniform vec3 uInnerEar;
uniform vec3 uTongue;
uniform vec3 uMouth;
uniform float uPattern;
uniform float uBrindle;
uniform float uMask;
uniform float uMerle;
uniform float uWhite;
uniform float uShading;
uniform float uLength;
uniform float uEars;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 NOSE_RADII = ${glslVec(NOSE_RADII)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
const float HIP_Z = ${glslFloat(HIP[2])};
const float SHOULDER_Z = ${glslFloat(SHOULDER[2])};
const float MOUTH_Y = ${glslFloat(MOUTH_Y)};
${glslEar("EAR", EAR, PRICK_EAR)}

// A soft band: 1 inside a stripe, 0 between.
float band(float s, float width) {
  float edge = 0.14 + 0.1 * uLength;
  return smoothstep(width + edge, width - edge, abs(fract(s) - 0.5) * 2.0);
}

bool isTongue() { return vPart > 1.5; }
bool isTail(vec3 p) { return !isHead() && p.z < TAIL_ROOT.z - 0.018 && p.y > 0.205; }
float tailAlong(vec3 p) { return clamp((TAIL_ROOT.z - p.z) / 0.25, 0.0, 1.0); }
// How far down a leg a point lies: 0 at the body, 1 at the paw.
float legAmount(vec3 p) { return isHead() || isTail(p) ? 0.0 : smoothstep(0.165, 0.05, p.y); }
// How near the top line a point on the body lies: 0 underneath, 1 along the back.
float topAmount(vec3 p) { return smoothstep(0.215, 0.3, p.y - abs(p.x) * 0.35); }
// Fine streaks along the hair, for shading that reads as fur rather than paint.
float streaks(vec3 p) { return noise3(p * vec3(150.0, 38.0, 70.0) + uMarks); }

// A sable: red with the hair tips dark along the back, over the head and ears and down the tail.
float sable(vec3 p) {
  float tips = streaks(p) * 0.5 + 0.5;
  if (isHead()) {
    vec3 q = p - SKULL;
    float cap = smoothstep(0.0, 0.04, q.y + 0.01) * smoothstep(0.05, 0.0, q.z);
    float ears = smoothstep(EAR.y - 0.005, EAR.y + 0.04, p.y);
    float bridge = smoothstep(0.004, 0.014, q.y + 0.004) * smoothstep(0.03, 0.06, q.z) * 0.6;
    return max(max(cap * 0.7, ears), bridge) * uShading * tips;
  }
  if (isTail(p)) return (smoothstep(TAIL_ROOT.y - 0.01, TAIL_ROOT.y + 0.02, p.y) * 0.7 + smoothstep(0.8, 0.95, tailAlong(p))) * uShading;
  return topAmount(p) * uShading * tips * (1.0 - legAmount(p));
}

// A wolf grey: banded hair, darkest in a saddle and cape over the back and shoulders and on the tail,
// pale on the legs, belly and cheeks, with a dark muzzle and ear tips.
float wolfGrey(vec3 p) {
  float tips = streaks(p) * 0.4 + 0.6;
  if (isHead()) {
    vec3 q = p - SKULL;
    float muzzle = smoothstep(0.035, 0.07, q.z) * smoothstep(-0.03, 0.0, q.y) * 0.75;
    float cap = smoothstep(0.0, 0.035, q.y) * 0.45;
    float ears = smoothstep(EAR.y + 0.01, EAR.y + 0.05, p.y);
    return max(max(muzzle, cap), ears) * tips;
  }
  if (isTail(p)) return smoothstep(TAIL_ROOT.y - 0.01, TAIL_ROOT.y + 0.02, p.y) * 0.75 + smoothstep(0.85, 0.95, tailAlong(p));
  float cape = smoothstep(0.24, 0.31, p.y + 0.02 * sin(p.z * 40.0)) * 0.85;
  return cape * tips * (1.0 - legAmount(p));
}

// Black and tan: dark all over but the pips above the eyes, the cheeks and muzzle beneath, the throat
// and the forechest, the lower legs and under the tail.
float tanPoints(vec3 p) {
  if (isHead()) {
    vec3 q = p - SKULL;
    float pips = smoothstep(0.0095, 0.006, length(vec3(abs(q.x) - 0.021, q.y - 0.021, (q.z - 0.042) * 0.5)));
    float lower = smoothstep(-0.006, -0.016, q.y + max(0.0, 0.03 - q.z) * 0.25) * smoothstep(-0.01, 0.02, q.z);
    float cheeks = smoothstep(0.022, 0.04, abs(q.x)) * smoothstep(-0.004, -0.02, q.y) * smoothstep(-0.01, 0.01, q.z);
    return 1.0 - max(pips, max(lower, cheeks));
  }
  if (isTail(p)) return 1.0 - smoothstep(TAIL_ROOT.y - 0.01, TAIL_ROOT.y - 0.025, p.y) * smoothstep(0.4, 0.1, tailAlong(p));
  float chest = smoothstep(SHOULDER_Z + 0.015, SHOULDER_Z + 0.04, p.z) * smoothstep(0.255, 0.215, p.y);
  float throat = smoothstep(0.17, 0.2, p.z) * smoothstep(0.3, 0.27, p.y) * step(0.25, p.y);
  float legs = smoothstep(0.35, 0.6, legAmount(p));
  float vent = smoothstep(HIP_Z - 0.03, HIP_Z - 0.07, p.z) * smoothstep(0.24, 0.2, p.y);
  return 1.0 - max(max(chest, throat), max(legs, vent));
}

// A saddle: the dark only over the back, the top of the neck and tail; tan everywhere else.
float saddle(vec3 p) {
  float amount = 0.0;
  if (isHead()) {
    vec3 q = p - SKULL;
    amount = smoothstep(0.01, 0.04, q.y - q.z * 0.4) * 0.6 * tanPoints(p);
  } else if (isTail(p)) {
    amount = smoothstep(TAIL_ROOT.y - 0.005, TAIL_ROOT.y + 0.02, p.y);
  } else {
    float edge = (fbm(p * 20.0 + uMarks) - 0.5) * 0.03;
    amount = smoothstep(0.235, 0.255, p.y + edge) * smoothstep(SHOULDER_Z + 0.08, SHOULDER_Z + 0.02, p.z) * (1.0 - legAmount(p));
  }
  return amount;
}

float eumelaninAmount(vec3 p) {
  if (uPattern < 0.5) return 1.0;
  if (uPattern < 1.5) return 0.0;
  if (uPattern < 2.5) return sable(p);
  if (uPattern < 3.5) return wolfGrey(p);
  if (uPattern < 4.5) return tanPoints(p);
  return saddle(p);
}

float brindle(vec3 p) {
  float warp = (fbm(p * 14.0 + uMarks) - 0.5) * 2.4;
  // Thin, broken streaks, not a tiger's stripes: many, uneven, fading in and out along their length.
  float along = isTail(p) ? tailAlong(p) * 12.0 : legAmount(p) > 0.3 ? p.y * 50.0 : p.z * 48.0 + p.y * 6.0;
  float streak = band(along + warp, 0.36);
  return streak * smoothstep(0.3, 0.6, noise3(p * vec3(18.0, 50.0, 18.0) + uMarks.yzx)) * (isHead() ? 0.4 : 0.6);
}

float maskAmount(vec3 p) {
  if (!isHead()) return 0.0;
  vec3 q = p - SKULL;
  float muzzle = smoothstep(0.022, 0.045, q.z);
  float eyes = smoothstep(0.016, 0.006, length(vec2(abs(q.x) - 0.021, q.y - 0.006))) * step(0.02, q.z);
  float ears = smoothstep(EAR.y + 0.015, EAR.y + 0.045, p.y);
  return max(max(muzzle, eyes), ears);
}

// How readily a point turns white as white spotting grows: a star on the chest and the toes first,
// then the belly, the muzzle and the tail's tip, the legs, a blaze and a collar round the neck, the
// sides, and last of all the head's cap, the ears and the root of the tail.
float whitePotential(vec3 p) {
  if (isHead()) {
    vec3 q = p - SKULL;
    float muzzle = 0.78 - length((q - vec3(0.0, -0.03, 0.09)) * vec3(1.0, 1.3, 0.6)) * 12.0;
    float blaze = 0.6 - abs(q.x) * 40.0 - max(0.0, q.y - 0.01) * 4.0;
    float chin = 0.72 - max(0.0, q.y + 0.03) * 25.0;
    float ear = p.y > EAR.y - 0.004 ? -0.45 : 0.0;
    return max(max(muzzle, blaze * step(0.025, q.z)), chin) + ear;
  }
  if (isTail(p)) {
    float along = tailAlong(p);
    return along > 0.84 ? 0.8 : -0.2 - (1.0 - along) * 0.1;
  }
  float leg = legAmount(p);
  float star = 1.0 - length(vec2(p.x * 1.6, p.y - 0.2)) * 9.0;
  float star3 = star * smoothstep(SHOULDER_Z + 0.01, SHOULDER_Z + 0.05, p.z);
  float height = clamp((p.y - 0.15) / 0.17, 0.0, 1.0);
  float collar = smoothstep(0.17, 0.19, p.z) * 0.62 * step(0.23, p.y);
  float body = max(max(0.9 - height * 1.1 - abs(p.x) * 4.0, collar), star3);
  float limbs = 0.98 - smoothstep(0.0, 0.03, p.y) * 0.12 - p.y * 2.0;
  return mix(body, limbs, leg);
}

float whiteAmount(vec3 p) {
  if (uWhite <= 0.0) return 0.0;
  float threshold = 1.0 - uWhite * 1.1;
  // Ragged edges, more so as the white spreads.
  float edge = ((fbm(p * 7.0 + uMarks.zyx) - 0.5) * 0.55 + (noise3(p * 34.0 + uMarks) - 0.5) * 0.1) * mix(0.25, 1.0, smoothstep(0.05, 0.4, uWhite));
  return smoothstep(threshold - 0.012, threshold + 0.012, whitePotential(p) + edge);
}

vec3 coatColour(vec3 p) {
  float underside = isHead() ? smoothstep(-0.015, -0.035, p.y - SKULL.y) : smoothstep(0.21, 0.16, p.y) * (1.0 - legAmount(p) * 0.5);
  // A wolf grey's light hair is pale, banded; a red coat pales underneath.
  vec3 ph = uPattern > 2.5 && uPattern < 3.5 ? mix(uPh, uWhiteColour, 0.45) : uPh;
  ph = mix(ph, mix(ph, uWhiteColour, 0.5), underside * 0.5);
  float eu = eumelaninAmount(p);
  if (uBrindle > 0.5) eu = max(eu, brindle(p) * 0.85);
  if (uMask > 0.5) eu = max(eu, maskAmount(p));
  vec3 dark = uEu;
  if (uMerle > 0.5) {
    float torn = fbm(p * 13.0 + uMarks * 1.3) + (noise3(p * 70.0 + uMarks) - 0.5) * 0.18;
    dark = mix(uMerleGround, uEu, smoothstep(0.56, 0.6, torn));
  }
  vec3 colour = mix(ph, dark, clamp(eu, 0.0, 1.0));
  colour *= 1.0 + (streaks(p) - 0.5) * (0.07 + 0.05 * uLength);
  return mix(colour, uWhiteColour, whiteAmount(p));
}

// The eye of one side: smaller than a cat's, with a round pupil and a dark iris.
vec4 eye(vec3 p, float side, vec3 iris, inout float glint) {
  vec3 centre = SKULL + vec3(0.0205 * side, 0.0065, 0.0465);
  return paintedEye(p, centre, normalize(vec3(0.36 * side, 0.08, 0.93)), 0.0098, vec2(0.8, 0.8), 0.88, side, iris, glint);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (isTongue()) {
    float groove = smoothstep(0.0025, 0.0, abs(p.x)) * 0.25;
    return uTongue * (1.0 - groove);
  }
  if (!isHead()) return coat;
  vec3 q = p - SKULL;
  vec3 colour = coat;
  if (uEars < 1.5) {
    float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
    colour = mix(colour, mix(uInnerEar, coat, 0.25 + 0.15 * uLength), inner);
  }
  // The mouth: where the lips meet, curving up at its corner; opened, the jaw stretches it into the mouth's dark.
  float corner = smoothstep(0.075, 0.04, q.z);
  float mouth = smoothstep(0.0032, 0.0012, abs(p.y - MOUTH_Y - corner * 0.006)) * step(0.035, q.z) * step(abs(q.x), 0.03);
  colour = mix(colour, uMouth, mouth);
  // The nose leather, with its nostrils, and the line from it down to the mouth.
  float n = length((p - NOSE) / NOSE_RADII);
  float nose = smoothstep(1.22, 1.08, n);
  float nostrils = smoothstep(0.0032, 0.0018, length(vec2(abs(p.x - NOSE.x) - 0.0055, (p.y - NOSE.y + 0.0015) * 1.4))) * step(NOSE.z + 0.004, p.z);
  float philtrum = smoothstep(0.0012, 0.0005, abs(q.x)) * step(MOUTH_Y, p.y) * step(p.y, NOSE.y - NOSE_RADII.y * 0.8) * step(NOSE.z - 0.01, p.z);
  colour = mix(colour, uNose, max(nose, philtrum * 0.8));
  colour = mix(colour, uPupil, nostrils);
  // A wet nose catches the light.
  float shine = smoothstep(0.004, 0.0015, length(p - (NOSE + vec3(0.0, NOSE_RADII.y * 0.7, NOSE_RADII.z * 0.5)))) * nose;
  glint = max(glint, shine * 0.5);
  vec4 left = eye(p, 1.0, uEyeL, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, uEyeR, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

/** A dog's coat material. Each dog has its own, sharing one compiled program. */
export function dogCoatMaterial(look: DogCoatLook, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uEu: colour(c.eumelanin),
    uMerleGround: colour(c.merle),
    uPh: colour(c.phaeomelanin),
    uWhiteColour: colour(c.white),
    uEyeL: colour(c.eyeLeft),
    uEyeR: colour(c.eyeRight),
    uNose: colour(c.nose),
    uInnerEar: colour(c.innerEar),
    uTongue: colour(c.tongue),
    uMouth: colour(c.mouth),
    uPupil: colour(c.pupil),
    uGlint: colour(c.glint),
    uPattern: { value: look.pattern },
    uBrindle: { value: look.brindle },
    uMask: { value: look.mask },
    uMerle: { value: look.merle },
    uWhite: { value: look.white },
    uShading: { value: look.shading },
    uLength: { value: look.length },
    uEars: { value: look.ears },
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(DOG_COAT, uniforms, 0.26 + 0.08 * look.length, atmosphere);
}
