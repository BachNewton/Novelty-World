import { ShaderMaterial, Vector3 } from "three";
import type { Season } from "../../engine/calendar";
import { seasonWeights, type SeasonWeights } from "../../engine/seasons";
import type { FeatureArt, PassFrame } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { SRGB_GLSL } from "./srgb";

/*
 * The colour grade (`colourGrade`), a pass over the finished frame: its
 * brightness, contrast, saturation and white balance, the oranges, teals
 * and greens each adjusted on their own, and the shadows leaning towards
 * the moment's own colour (`uHwShadowTint`). Each season has its grade, and
 * the grade hands over from one to the next as the engine's season weights
 * do, so a summer is warm and full, an autumn golden with its greens gone
 * to olive, and a winter cool and quiet, its snow drawn back to white from
 * a low sun's golden haze, with the fire's orange the warmest thing in it.
 *
 * It works on the frame as the screen shows it, decoded to linear light and
 * encoded again, after the tone curve.
 */

/** One colour range's adjustment: a turn of its hue (degrees), and its saturation and lightness against as they are. */
export interface RangeGrade {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface Grade {
  /** Against as it is. */
  exposure: number;
  contrast: number;
  saturation: number;
  /** -1 cool to 1 warm. */
  temperature: number;
  /** -1 green to 1 magenta. */
  tint: number;
  oranges: RangeGrade;
  teals: RangeGrade;
  greens: RangeGrade;
  /** How strongly the shadows lean to the moment's colour. */
  shadowTint: number;
  /** How far bright, nearly colourless things (snow, a white cloud, a far snowfield) are drawn back to white from the warm light and haze on them. */
  whites: number;
}

const range = (hue: number, saturation: number, lightness: number): RangeGrade => ({ hue, saturation, lightness });

export const SEASON_GRADES: Record<Season, Grade> = {
  spring: { exposure: 1.03, contrast: 1.0, saturation: 1.07, temperature: -0.04, tint: -0.03, oranges: range(0, 1.02, 1.0), teals: range(0, 1.06, 1.02), greens: range(5, 1.14, 1.05), shadowTint: 0.16, whites: 0.2 },
  summer: { exposure: 1.03, contrast: 1.05, saturation: 1.12, temperature: 0.06, tint: 0, oranges: range(0, 1.1, 1.02), teals: range(-3, 1.12, 1.0), greens: range(2, 1.1, 1.02), shadowTint: 0.18, whites: 0.15 },
  autumn: { exposure: 1.0, contrast: 1.06, saturation: 1.1, temperature: 0.1, tint: 0.02, oranges: range(-3, 1.24, 1.05), teals: range(0, 0.95, 1.0), greens: range(-12, 0.88, 0.98), shadowTint: 0.22, whites: 0.25 },
  winter: { exposure: 1.02, contrast: 0.97, saturation: 0.9, temperature: -0.2, tint: 0.02, oranges: range(0, 1.12, 1.04), teals: range(0, 1.1, 1.03), greens: range(-4, 0.8, 0.98), shadowTint: 0.2, whites: 0.75 },
};

function mixRange(a: RangeGrade, b: RangeGrade, t: number): RangeGrade {
  return range(a.hue + (b.hue - a.hue) * t, a.saturation + (b.saturation - a.saturation) * t, a.lightness + (b.lightness - a.lightness) * t);
}

export function mixGrades(a: Grade, b: Grade, t: number): Grade {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    exposure: m(a.exposure, b.exposure),
    contrast: m(a.contrast, b.contrast),
    saturation: m(a.saturation, b.saturation),
    temperature: m(a.temperature, b.temperature),
    tint: m(a.tint, b.tint),
    oranges: mixRange(a.oranges, b.oranges, t),
    teals: mixRange(a.teals, b.teals, t),
    greens: mixRange(a.greens, b.greens, t),
    shadowTint: m(a.shadowTint, b.shadowTint),
    whites: m(a.whites, b.whites),
  };
}

/** The grade for a mix of seasons (the engine's `seasonWeights`, summing to 1): each season's grade in its share. */
export function gradeFor(weights: SeasonWeights): Grade {
  let grade = SEASON_GRADES.spring;
  let total = weights.spring;
  for (const season of ["summer", "autumn", "winter"] as const) {
    const w = weights[season];
    if (w <= 0) continue;
    total += w;
    grade = mixGrades(grade, SEASON_GRADES[season], w / total);
  }
  return grade;
}

/** The white balance's gains for a temperature and tint, keeping brightness. */
export function whiteBalance(temperature: number, tint: number): [number, number, number] {
  const gains: [number, number, number] = [1 + 0.12 * temperature + 0.04 * tint, 1 - 0.06 * tint, 1 - 0.14 * temperature + 0.04 * tint];
  const luma = 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2];
  return [gains[0] / luma, gains[1] / luma, gains[2] / luma];
}

const FRAGMENT = /* glsl */ `
uniform sampler2D tColour;
uniform vec3 uBalance;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uOranges;
uniform vec3 uTeals;
uniform vec3 uGreens;
uniform vec3 uShadowTint;
uniform float uWhites;
varying vec2 vUv;
${SRGB_GLSL}

vec3 hsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// How much a hue (0 to 1 round the wheel) belongs to a range centred on another, by how far round the wheel they are.
float hueWeight(float hue, float centre, float width) {
  float apart = abs(fract(hue - centre + 0.5) - 0.5);
  return exp(-pow(apart / width, 2.0));
}

void main() {
  vec4 shown = texture2D(tColour, vUv);
  vec3 c = hwToLinear(shown.rgb) * uBalance * uExposure;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Contrast round a middle grey, in the eye's own steps of brightness.
  c *= pow(max(luma, 1e-4) / 0.18, uContrast - 1.0);
  luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(vec3(0.0), luma + (c - luma) * uSaturation);
  vec3 h = hsv(c);
  float wo = hueWeight(h.x, 0.075, 0.07) * h.y;
  float wt = hueWeight(h.x, 0.5, 0.07) * h.y;
  float wg = hueWeight(h.x, 0.29, 0.08) * h.y;
  h.x = fract(h.x + (wo * uOranges.x + wt * uTeals.x + wg * uGreens.x) / 360.0);
  h.y = clamp(h.y * (1.0 + wo * (uOranges.y - 1.0) + wt * (uTeals.y - 1.0) + wg * (uGreens.y - 1.0)), 0.0, 1.0);
  h.z *= 1.0 + wo * (uOranges.z - 1.0) + wt * (uTeals.z - 1.0) + wg * (uGreens.z - 1.0);
  // Bright, nearly colourless things back to white, from the warm light and haze on them.
  h.y *= 1.0 - uWhites * smoothstep(0.45, 0.8, h.z) * (1.0 - smoothstep(0.12, 0.4, h.y));
  c = rgb(h);
  // The shadows lean to the moment's own colour.
  luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += uShadowTint * (1.0 - smoothstep(0.0, 0.3, luma));
  gl_FragColor = vec4(hwToSrgb(c), shown.a);
}
`;

function setRange(target: Vector3, grade: RangeGrade): void {
  target.set(grade.hue, grade.saturation, grade.lightness);
}

export const COLOUR_GRADE_ART: FeatureArt = {
  feature: "colourGrade",
  passes: [
    {
      id: "colour-grade",
      stage: "post",
      order: 500,
      create: () => {
        const quad = new FullScreen(
          new ShaderMaterial({
            uniforms: {
              tColour: { value: null },
              uBalance: { value: new Vector3(1, 1, 1) },
              uExposure: { value: 1 },
              uContrast: { value: 1 },
              uSaturation: { value: 1 },
              uOranges: { value: new Vector3(0, 1, 1) },
              uTeals: { value: new Vector3(0, 1, 1) },
              uGreens: { value: new Vector3(0, 1, 1) },
              uShadowTint: { value: new Vector3() },
              uWhites: { value: 0 },
            },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: FRAGMENT,
          }),
        );
        return {
          render: ({ gl, colour, output, day, atmosphere }: PassFrame) => {
            const u = quad.material.uniforms;
            const grade = gradeFor(seasonWeights(day.date.realDayOfYear));
            u.tColour.value = colour;
            (u.uBalance.value as Vector3).fromArray(whiteBalance(grade.temperature, grade.tint));
            u.uExposure.value = grade.exposure;
            u.uContrast.value = grade.contrast;
            u.uSaturation.value = grade.saturation;
            u.uWhites.value = grade.whites;
            setRange(u.uOranges.value as Vector3, grade.oranges);
            setRange(u.uTeals.value as Vector3, grade.teals);
            setRange(u.uGreens.value as Vector3, grade.greens);
            const tint = atmosphere.uHwShadowTint.value;
            (u.uShadowTint.value as Vector3).set(tint.r, tint.g, tint.b).multiplyScalar(grade.shadowTint * 0.5);
            quad.render(gl, output);
          },
          dispose: () => quad.dispose(),
        };
      },
    },
  ],
};
