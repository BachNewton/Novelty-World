import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { HedgehogCoatLook } from "../../hedgehogs/coat-look";
import { NOSE, NOSE_RADII, SKULL } from "../../hedgehogs/rig";
import { coatMaterial, glslVec, type CoatShader } from "../animals/coat-material";

/*
 * A hedgehog's coat, on the shared coat shader: the mantle's spines, each
 * banded dark and pale and tipped cream, drawn as fine streaks raked back
 * along the body over the sculpture's own bristling cones (their tips read
 * paler, their roots darker); the soft brown fur of the face, belly and
 * legs, a darker mask round the eyes, beady black eyes and a shining nose.
 */

const HEDGEHOG_COAT: CoatShader = {
  key: "hearthwood-hedgehog-coat",
  glsl: /* glsl */ `
uniform vec3 uBand;
uniform vec3 uTip;
uniform vec3 uFur;
uniform vec3 uFurPale;
uniform vec3 uMask;
uniform vec3 uNose;
uniform vec3 uEye;
uniform float uDarkness;
uniform float uTips;
uniform float uFace;
uniform vec3 uMarks;

const vec3 SKULL = ${glslVec(SKULL)};
const vec3 NOSE = ${glslVec(NOSE)};
const vec3 NOSE_RADII = ${glslVec(NOSE_RADII)};

// How much a point lies on the mantle of spines rather than the fur.
float spineAmount(vec3 p) {
  if (isHead()) return smoothstep(0.016, 0.026, p.y - SKULL.y) * smoothstep(0.075, 0.065, p.z) * 0.9;
  return smoothstep(0.047, 0.054, p.y) * smoothstep(0.078, 0.06, p.z);
}

vec3 spines(vec3 p) {
  // Fine streaks raked back along the body, each a spine banded dark, pale and dark again, tipped cream.
  float along = noise3(p * vec3(700.0, 700.0, 110.0) + uMarks);
  float band = noise3(p * vec3(450.0, 450.0, 70.0) + uMarks.yzx);
  vec3 dark = uBand * mix(1.45, 0.7, uDarkness);
  // Mostly the spines' dark bands, with their pale middles showing through in streaks.
  vec3 colour = mix(dark, mix(dark, uTip, 0.55), smoothstep(0.45, 0.75, band) * mix(0.5, 1.0, uTips));
  // A scatter of cream tips over it all, thicker where the spines stand out.
  float tip = smoothstep(0.62, 0.8, along);
  colour = mix(colour, uTip, tip * mix(0.45, 0.9, uTips));
  return colour * mix(0.7, 1.1, vOcclusion);
}

vec3 coatColour(vec3 p) {
  vec3 fur = mix(uFur, uFurPale, uFace * 0.8);
  fur *= 1.0 + (noise3(p * vec3(200.0, 80.0, 120.0) + uMarks) - 0.5) * 0.18;
  // The legs and feet darker, the belly palest.
  if (!isHead()) fur = mix(fur, uFur * 0.6, smoothstep(0.03, 0.01, p.y));
  return mix(fur, spines(p), spineAmount(p));
}

vec4 eye(vec3 p, float side, inout float glint) {
  vec3 centre = SKULL + vec3(0.0165 * side, 0.006, 0.022);
  return paintedEye(p, centre, normalize(vec3(0.62 * side, 0.15, 0.78)), 0.0046, vec2(0.95, 0.95), 0.95, side, uEye, glint);
}

vec3 faceColour(vec3 p, vec3 coat, inout float glint) {
  if (!isHead()) return coat;
  vec3 q = p - SKULL;
  vec3 colour = coat;
  // The dark mask over the eyes and down the snout's sides.
  float mask = smoothstep(0.014, 0.006, length(vec2(abs(q.x) - 0.014, q.y - 0.004))) * step(0.012, q.z);
  float snout = smoothstep(0.03, 0.06, q.z) * smoothstep(0.004, 0.012, abs(q.x) + 0.004) * 0.5;
  colour = mix(colour, uMask, max(mask, snout) * 0.85);
  float n = length((p - NOSE) / NOSE_RADII);
  float nose = smoothstep(1.25, 1.05, n);
  colour = mix(colour, uNose, nose);
  float shine = smoothstep(0.0025, 0.0008, length(p - (NOSE + vec3(0.0, NOSE_RADII.y * 0.6, NOSE_RADII.z * 0.6)))) * nose;
  glint = max(glint, shine * 0.6);
  vec4 left = eye(p, 1.0, glint);
  colour = mix(colour, left.rgb, left.a);
  vec4 right = eye(p, -1.0, glint);
  colour = mix(colour, right.rgb, right.a);
  return colour;
}
`,
};

/** A hedgehog's coat material. Each hedgehog has its own, sharing one compiled program. */
export function hedgehogCoatMaterial(look: HedgehogCoatLook) {
  const c = look.colours;
  const colour = (token: string) => ({ value: themeColor(token) });
  const uniforms = {
    uBand: colour(c.band),
    uTip: colour(c.tip),
    uFur: colour(c.fur),
    uFurPale: colour(c.furPale),
    uMask: colour(c.mask),
    uNose: colour(c.nose),
    uEye: colour(c.eye),
    uPupil: colour(c.nose),
    uGlint: colour(c.glint),
    uDarkness: { value: look.darkness },
    uTips: { value: look.tips },
    uFace: { value: look.face },
    uMarks: { value: new THREE.Vector3(...look.marks) },
  };
  return coatMaterial(HEDGEHOG_COAT, uniforms, 0.18);
}
