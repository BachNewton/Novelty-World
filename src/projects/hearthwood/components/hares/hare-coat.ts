import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { HareCoatLook } from "../../hares/coat-look";
import { EAR, EAR_SHAPE, NOSE, SKULL, TAIL_ROOT } from "../../hares/rig";
import { coatMaterial, glslEar, glslVec, type CoatShader } from "../animals/coat-material";
import type { CoatSeasonUniforms } from "../animals/coat-season";

/*
 * A mountain hare's coat, on the shared coat shader: its summer grey-brown,
 * grizzled, paler down the flanks and white beneath; turning white with the
 * season, patchily, from the feet and belly up to the back and head last,
 * as a real hare moults; and all year the black tips of its ears and its
 * white scut. Big amber eyes, set at the sides of the head.
 */

const HARE_COAT: CoatShader = {
  key: "hearthwood-hare-coat",
  glsl: /* glsl */ `
uniform vec3 uBrown;
uniform vec3 uGrey;
uniform vec3 uWhiteColour;
uniform vec3 uTips;
uniform vec3 uEye;
uniform vec3 uNose;
uniform vec3 uInnerEar;
uniform float uWarmth;
uniform float uWhite;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
${glslEar("EAR", EAR, EAR_SHAPE)}

bool isTail(vec3 p) { return !isHead() && p.z < TAIL_ROOT.z + 0.01 && p.y > 0.1; }
float streaks(vec3 p) { return noise3(p * vec3(300.0, 110.0, 180.0) + uMarks); }

// How readily a point turns white: the feet and belly first, then the flanks, the back and the head last.
float whitening(vec3 p) {
  if (isHead()) return 0.25 + smoothstep(0.0, -0.03, p.y - SKULL.y) * 0.3;
  return 1.0 - clamp((p.y - 0.03) / 0.15, 0.0, 1.0) * 0.8;
}

vec3 coatColour(vec3 p) {
  vec3 summer = mix(uGrey, uBrown, uWarmth);
  float pale = isHead() ? 0.0 : smoothstep(0.12, 0.08, p.y + abs(p.x) * 0.3);
  summer = mix(summer, mix(summer, uWhiteColour, 0.55), pale);
  summer *= 0.85 + 0.3 * streaks(p);
  float belly = isHead() ? smoothstep(-0.012, -0.024, p.y - SKULL.y) * step(SKULL.z, p.z) : smoothstep(0.08, 0.055, p.y + abs(p.x) * 0.5) * smoothstep(-0.14, -0.08, p.z);
  summer = mix(summer, uWhiteColour, max(belly, isTail(p) ? 1.0 : 0.0));
  float moult = (fbm(p * 45.0 + uMarks) - 0.5) * 0.5;
  float white = smoothstep(0.0, 0.08, uWhite * 1.3 - (1.0 - whitening(p)) + moult);
  return mix(summer, uWhiteColour * (0.96 + 0.06 * streaks(p)), clamp(white, 0.0, 1.0) * step(0.001, uWhite));
}

vec4 eye(vec3 p, float side, inout float glint) {
  vec3 centre = SKULL + vec3(0.026 * side, 0.008, 0.018);
  return paintedEye(p, centre, normalize(vec3(0.9 * side, 0.1, 0.42)), 0.0085, vec2(0.62, 0.62), 0.85, side, uEye, glint);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (!isHead()) return coat;
  vec3 colour = coat;
  float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
  colour = mix(colour, mix(uInnerEar, coat, 0.45), inner * 0.8);
  // The black tips of the ears, summer and winter.
  colour = mix(colour, uTips, smoothstep(EAR.y + EAR_HEIGHT * 0.66, EAR.y + EAR_HEIGHT * 0.74, p.y));
  float nose = smoothstep(0.0075, 0.005, length((p - NOSE) * vec3(1.0, 1.3, 1.0)));
  colour = mix(colour, uNose, nose * 0.8);
  vec4 left = eye(p, 1.0, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

export function hareCoatMaterial(look: HareCoatLook, season: CoatSeasonUniforms) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uBrown: colour(c.brown),
    uGrey: colour(c.grey),
    uWhiteColour: colour(c.white),
    uTips: colour(c.tips),
    uEye: colour(c.eye),
    uPupil: colour(c.tips),
    uGlint: colour(c.glint),
    uNose: colour(c.nose),
    uInnerEar: colour(c.innerEar),
    uWarmth: { value: look.warmth },
    uWhite: season.uWhite,
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(HARE_COAT, uniforms, 0.3);
}
