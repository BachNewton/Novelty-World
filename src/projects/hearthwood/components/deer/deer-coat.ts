import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DeerCoatLook } from "../../deer/coat-look";
import { EAR, EAR_SHAPE, HIP, NOSE, SKULL, TAIL_ROOT } from "../../deer/rig";
import { ANTLER_PART } from "../../deer/sculpt";
import { coatMaterial, glslEar, glslFloat, glslVec, type CoatShader } from "../animals/coat-material";
import type { CoatSeasonUniforms } from "../animals/coat-season";

/*
 * A roe deer's coat, on the shared coat shader: its summer fox-red, going
 * grey-brown in its winter coat, paler beneath; the rump patch (a small
 * buff one in summer, a big white one in winter); the black nose with the
 * white band round the muzzle under it and the white chin; in winter a
 * white patch on the throat; dark-rimmed big ears; large dark eyes; and on
 * a buck, antlers ridged dark at their bases and pale at the tips.
 */

const DEER_COAT: CoatShader = {
  key: "hearthwood-deer-coat",
  glsl: /* glsl */ `
uniform vec3 uRedColour;
uniform vec3 uSandy;
uniform vec3 uWinterColour;
uniform vec3 uWhiteColour;
uniform vec3 uDark;
uniform vec3 uAntler;
uniform vec3 uEye;
uniform vec3 uInnerEar;
uniform float uRed;
uniform float uWinter;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 TAIL_ROOT = ${glslVec(TAIL_ROOT)};
const float HIP_Z = ${glslFloat(HIP[2])};
const float ANTLER = ${glslFloat(ANTLER_PART - 0.5)};
${glslEar("EAR", EAR, EAR_SHAPE)}

bool isAntler() { return vPart > ANTLER; }
float streaks(vec3 p) { return noise3(p * vec3(140.0, 40.0, 70.0) + uMarks); }
float legAmount(vec3 p) { return isHead() ? 0.0 : smoothstep(0.22, 0.12, p.y); }

vec3 coatColour(vec3 p) {
  if (isAntler()) {
    // Ridged and dark at the base, pale at the tines' tips.
    float up = clamp((p.y - SKULL.y - 0.02) / 0.1, 0.0, 1.0);
    vec3 colour = mix(uAntler * 0.65, uAntler * 1.35, smoothstep(0.55, 1.0, up));
    return colour * (0.85 + 0.3 * noise3(p * vec3(60.0, 600.0, 60.0)));
  }
  vec3 summer = mix(uSandy, uRedColour, uRed);
  vec3 colour = mix(summer, uWinterColour, uWinter);
  float under = isHead() ? 0.0 : smoothstep(0.27, 0.23, p.y) * (1.0 - legAmount(p));
  colour = mix(colour, mix(colour, uWhiteColour, 0.5), under * 0.6);
  // The legs are a darker, greyer brown than the body, down to the hooves.
  colour = mix(colour, mix(uWinterColour, uDark, 0.25), legAmount(p) * 0.7);
  colour *= 0.92 + 0.16 * streaks(p);
  // The rump patch round the tail: small and buff in summer, big and white in winter.
  if (!isHead()) {
    vec2 r = vec2(p.x * 1.4, p.y - 0.3);
    float rump = smoothstep(0.045 + 0.03 * uWinter, 0.035 + 0.03 * uWinter, length(r)) * smoothstep(HIP_Z - 0.02, HIP_Z - 0.06, p.z);
    colour = mix(colour, mix(mix(uSandy, uWhiteColour, 0.6), uWhiteColour, uWinter), rump);
    // In winter, a white patch on the throat.
    float throat = smoothstep(0.016, 0.008, length(vec2(p.x * 1.6, p.y - 0.38))) * smoothstep(0.19, 0.205, p.z) * uWinter;
    colour = mix(colour, uWhiteColour, throat * 0.9);
  }
  return colour;
}

vec4 eye(vec3 p, float side, inout float glint) {
  vec3 centre = SKULL + vec3(0.024 * side, 0.008, 0.024);
  return paintedEye(p, centre, normalize(vec3(0.8 * side, 0.1, 0.55)), 0.0095, vec2(0.8, 0.7), 0.8, side, uEye, glint);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (!isHead() || isAntler()) return coat;
  vec3 colour = coat;
  vec3 q = p - SKULL;
  float inner = earCup(p, EAR, EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, EAR_SPLAY, EAR_TURN, EAR_INSET, EAR_LIFT, EAR_TIP);
  colour = mix(colour, mix(uInnerEar, uWhiteColour, 0.4), inner);
  // The black nose, the white band behind it, and the white chin.
  float nose = smoothstep(0.016, 0.011, length((p - NOSE) * vec3(1.0, 1.0, 0.8)));
  float band = smoothstep(0.024, 0.018, length((p - NOSE) * vec3(1.0, 1.1, 0.8))) * (1.0 - nose);
  float chin = smoothstep(-0.022, -0.03, q.y) * smoothstep(0.04, 0.06, q.z);
  colour = mix(colour, uWhiteColour, max(band, chin));
  colour = mix(colour, uDark, nose);
  vec4 left = eye(p, 1.0, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

export function deerCoatMaterial(look: DeerCoatLook, season: CoatSeasonUniforms, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uRedColour: colour(c.red),
    uSandy: colour(c.sandy),
    uWinterColour: colour(c.winter),
    uWhiteColour: colour(c.white),
    uDark: colour(c.dark),
    uAntler: colour(c.antler),
    uEye: colour(c.eye),
    uPupil: colour(c.dark),
    uGlint: colour(c.glint),
    uInnerEar: colour(c.innerEar),
    uRed: { value: look.red },
    uWinter: season.uWinter,
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(DEER_COAT, uniforms, 0.22, atmosphere);
}
