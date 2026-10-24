import { Vector3 } from "three";
import { dot, exp, float, fract, max, min, mix, pow, smoothstep, step, uniform, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { Season } from "../../engine/calendar";
import { seasonWeights, type SeasonWeights } from "../../engine/seasons";
import type { FeatureArt } from "../feature-art";
import { skyColours } from "../sky/tokens";
import { colourUniform } from "../tsl";
import { smooth } from "./sun";

/*
 * The colour grade (`colourGrade`), over the finished frame: its
 * brightness, contrast, saturation and white balance, the oranges, teals
 * and greens each adjusted on their own, and the shadows leaning towards
 * the moment's own colour (`uHwShadowTint`). Each season has its grade, and
 * the grade hands over from one to the next as the engine's season weights
 * do, so a summer is warm and full, an autumn golden with its greens gone
 * to olive, and a winter cool and quiet, its snow drawn back to white from
 * a low sun's golden haze, with the fire's orange the warmest thing in it.
 * The night cools in it too: what is dim drains towards the blue the eye
 * sees by in the dark, while firelight keeps its warmth.
 *
 * A step of the frame's post pipeline after the tone curve, on the frame as
 * it shows (still linear), fused into the pass that writes the screen.
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
  let grade: Grade | null = null;
  let total = 0;
  for (const season of ["spring", "summer", "autumn", "winter"] as const) {
    const w = weights[season];
    if (w <= 0) continue;
    total += w;
    grade = grade === null ? SEASON_GRADES[season] : mixGrades(grade, SEASON_GRADES[season], w / total);
  }
  if (grade === null) throw new Error("A season's weights must not all be nothing");
  return grade;
}

/** The white balance's gains for a temperature and tint, keeping brightness. */
export function whiteBalance(temperature: number, tint: number): [number, number, number] {
  const gains: [number, number, number] = [1 + 0.12 * temperature + 0.04 * tint, 1 - 0.06 * tint, 1 - 0.14 * temperature + 0.04 * tint];
  const luma = 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2];
  return [gains[0] / luma, gains[1] / luma, gains[2] / luma];
}

/** The night's cooling: how far into the night the eye is, from the sun's elevation in degrees, 0 by day. */
export function nightCooling(sunElevation: number): number {
  return 1 - smooth(-10, -3, sunElevation);
}

const balance = uniform(new Vector3(1, 1, 1));
const exposure = uniform(1);
const contrast = uniform(1);
const saturation = uniform(1);
const oranges = uniform(new Vector3(0, 1, 1));
const teals = uniform(new Vector3(0, 1, 1));
const greens = uniform(new Vector3(0, 1, 1));
const shadowTint = colourUniform();
const whites = uniform(0);
const night = uniform(0);
const nightTint = colourUniform();

const LUMA = vec3(0.2126, 0.7152, 0.0722);

function toHsv(c: Node<"vec3">): Node<"vec3"> {
  const k = vec4(0, -1 / 3, 2 / 3, -1);
  const p = mix(vec4(c.b, c.g, k.w, k.z), vec4(c.g, c.b, k.x, k.y), step(c.b, c.g));
  const q = mix(vec4(p.x, p.y, p.w, c.r), vec4(c.r, p.y, p.z, p.x), step(p.x, c.r));
  const d = q.x.sub(min(q.w, q.y));
  return vec3(q.z.add(q.w.sub(q.y).div(d.mul(6).add(1e-10))).abs(), d.div(q.x.add(1e-10)), q.x);
}

function fromHsv(c: Node<"vec3">): Node<"vec3"> {
  const p = fract(vec3(c.x).add(vec3(1, 2 / 3, 1 / 3))).mul(6).sub(3).abs();
  return mix(vec3(1), p.sub(1).clamp(0, 1), c.y).mul(c.z);
}

/** How much a hue (0 to 1 round the wheel) belongs to a range centred on another, by how far round the wheel they are. */
function hueWeight(hue: Node<"float">, centre: number, width: number): Node<"float"> {
  const apart = fract(hue.sub(centre).add(0.5)).sub(0.5).abs().div(width);
  return exp(apart.mul(apart).negate());
}

/** The grade on the frame as it shows, still linear. */
function graded(shown: Node<"vec3">): Node<"vec3"> {
  let c: Node<"vec3"> = shown.mul(balance).mul(exposure);
  // Contrast round a middle grey, in the eye's own steps of brightness.
  c = c.mul(pow(max(dot(c, LUMA), 1e-4).div(0.18), contrast.sub(1)));
  const luma = dot(c, LUMA);
  c = max(vec3(0), mix(vec3(luma), c, saturation));
  const h = toHsv(c);
  const wo = hueWeight(h.x, 0.075, 0.07).mul(h.y);
  const wt = hueWeight(h.x, 0.5, 0.07).mul(h.y);
  const wg = hueWeight(h.x, 0.29, 0.08).mul(h.y);
  const turn = (by: (r: Node<"vec3">) => Node<"float">) => wo.mul(by(oranges)).add(wt.mul(by(teals))).add(wg.mul(by(greens)));
  const hue = fract(h.x.add(turn((r) => r.x).div(360)));
  const sat = h.y.mul(turn((r) => r.y.sub(1)).add(1)).clamp(0, 1);
  // Bright, nearly colourless things back to white, from the warm light and haze on them.
  const white = sat.mul(float(1).sub(whites.mul(smoothstep(0.45, 0.8, h.z)).mul(float(1).sub(smoothstep(0.12, 0.4, sat)))));
  const value = h.z.mul(turn((r) => r.z.sub(1)).add(1));
  c = fromHsv(vec3(hue, white, value));
  // The shadows lean to the moment's own colour.
  const dim = float(1).sub(smoothstep(0, 0.3, dot(c, LUMA)));
  c = c.add(shadowTint.mul(dim));
  // At night what is dim drains of colour towards the moonlit blue the eye sees by, and reds go dark; what is well lit, and warm light most of all, keeps its colour.
  const lum = dot(c, LUMA);
  const fading = night.mul(float(1).sub(smoothstep(0.04, 0.35, lum))).mul(float(1).sub(smoothstep(0.02, 0.18, c.r.sub(c.b)).mul(0.7)));
  const rods = nightTint.mul(lum.mul(0.9).add(c.g.sub(c.r).max(0).mul(0.15)));
  return mix(c, rods, fading.mul(0.75));
}

function setRange(target: Vector3, grade: RangeGrade): void {
  target.set(grade.hue, grade.saturation, grade.lightness);
}

export const COLOUR_GRADE_ART: FeatureArt = {
  feature: "colourGrade",
  post: [{ id: "colour-grade", order: 20, build: ({ colour }) => vec4(graded(colour.rgb), colour.a) }],
  frame: ({ day, atmosphere }) => {
    const grade = gradeFor(seasonWeights(day.date.realDayOfYear));
    balance.value.fromArray(whiteBalance(grade.temperature, grade.tint));
    exposure.value = grade.exposure;
    contrast.value = grade.contrast;
    saturation.value = grade.saturation;
    whites.value = grade.whites;
    setRange(oranges.value, grade.oranges);
    setRange(teals.value, grade.teals);
    setRange(greens.value, grade.greens);
    shadowTint.value.copy(atmosphere.uHwShadowTint.value).multiplyScalar(grade.shadowTint * 0.5);
    night.value = nightCooling(day.sky.sun.elevation);
    nightTint.value.copy(skyColours()["night-vision"]);
  },
};
