import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { SquirrelCoatLook } from "../../squirrels/coat-look";
import { EAR, EAR_SHAPE, NOSE, SKULL, TAIL_ROOT } from "../../squirrels/rig";
import { coatMaterial, glslEar, glslVec, type CoatShader } from "../animals/coat-material";
import type { CoatSeasonUniforms } from "../animals/coat-season";

/*
 * A red squirrel's coat, on the shared coat shader: its red (brighter or
 * darker by the squirrel, greying over the back and sides in its winter
 * coat), the cream of its belly, chest and chin, a pale ring round its big
 * dark eyes, darker tufted ears, and a tail of grizzled fur.
 */

const SQUIRREL_COAT: CoatShader = {
  key: "hearthwood-squirrel-coat",
  glsl: /* glsl */ `
uniform vec3 uRed;
uniform vec3 uDarkRed;
uniform vec3 uWinterColour;
uniform vec3 uBelly;
uniform vec3 uEye;
uniform vec3 uNose;
uniform vec3 uInnerEar;
uniform float uDarkness;
uniform float uWinter;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
${glslEar("EAR", EAR, EAR_SHAPE)}

bool isTail(vec3 p) { return !isHead() && p.z < TAIL_ROOT.z + 0.004; }
float streaks(vec3 p) { return noise3(p * vec3(500.0, 160.0, 260.0) + uMarks); }

vec3 coatColour(vec3 p) {
  vec3 red = mix(uRed, uDarkRed, uDarkness);
  float top = isHead() ? smoothstep(-0.005, 0.015, p.y - SKULL.y) : smoothstep(0.065, 0.09, p.y);
  // The winter coat greys over the back and sides; the legs, face and tail keep more red.
  float winter = uWinter * (isTail(p) ? 0.35 : isHead() ? 0.45 : 0.75) * (0.6 + 0.4 * top);
  vec3 colour = mix(red, uWinterColour, winter);
  colour *= 1.0 + (streaks(p) - 0.5) * (isTail(p) ? 0.35 : 0.12);
  float belly = 0.0;
  if (isHead()) {
    vec3 q = p - SKULL;
    belly = smoothstep(-0.006, -0.014, q.y + max(0.0, 0.02 - q.z) * 0.2) * step(0.0, q.z);
  } else if (!isTail(p)) {
    belly = smoothstep(0.058, 0.048, p.y + abs(p.x) * 0.5) * smoothstep(-0.07, -0.03, p.z);
  }
  return mix(colour, uBelly, belly);
}

vec4 eye(vec3 p, float side, inout float glint) {
  vec3 centre = SKULL + vec3(0.0142 * side, 0.004, 0.016);
  vec4 ring = paintedEye(p, centre, normalize(vec3(0.75 * side, 0.1, 0.65)), 0.0068, vec2(0.95, 0.95), 0.9, side, uBelly, glint);
  vec4 iris = paintedEye(p, centre, normalize(vec3(0.75 * side, 0.1, 0.65)), 0.0052, vec2(0.92, 0.92), 0.9, side, uEye, glint);
  return iris.a > 0.0 ? iris : vec4(ring.rgb, ring.a * 0.8);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (!isHead()) return coat;
  vec3 colour = coat;
  float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
  colour = mix(colour, mix(uInnerEar, coat, 0.4), inner);
  // The tufts are darker than the rest.
  colour = mix(colour, uDarkRed * 0.6, smoothstep(EAR.y + EAR_HEIGHT * 0.6, EAR.y + EAR_HEIGHT + 0.006, p.y));
  float nose = smoothstep(0.0055, 0.0035, length(p - NOSE));
  colour = mix(colour, uNose, nose);
  vec4 left = eye(p, 1.0, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

export function squirrelCoatMaterial(look: SquirrelCoatLook, season: CoatSeasonUniforms) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uRed: colour(c.red),
    uDarkRed: colour(c.dark),
    uWinterColour: colour(c.winter),
    uBelly: colour(c.belly),
    uEye: colour(c.eye),
    uPupil: colour(c.eye),
    uGlint: colour(c.glint),
    uNose: colour(c.nose),
    uInnerEar: colour(c.innerEar),
    uDarkness: { value: look.darkness },
    uWinter: season.uWinter,
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(SQUIRREL_COAT, uniforms, 0.3);
}
