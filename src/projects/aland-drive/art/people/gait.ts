import { buildNear } from "./body";
import type { FigureSpec } from "./figure";
import { DRIVES } from "./soup";

/*
 * The walk's leg as numbers: how far the thigh swings and the knee folds at each
 * moment of a stride, which the shader draws (`material.ts`) and the CPU measures,
 * so a figure moved along the ground can step at the rate its feet would grip.
 * A beat of 2π is one whole stride, both feet.
 */

/** The thigh swings this far either way, about this far forward of hanging; the knee folds by the square of a lift that leads the swing. */
export const THIGH_SWING = 0.36;
export const THIGH_LEAN = 0.03;
export const KNEE_FOLD = 0.78;
export const KNEE_REST = 0.1;
export const LIFT_LEAD = 0.5;

/** The thigh's and the knee's angles at a beat, for a stride of `stride` (1 an adult's full one), forward positive. */
export function legAngles(beat: number, stride: number): { thigh: number; knee: number } {
  const lifted = Math.max(Math.cos(beat + LIFT_LEAD), 0);
  return { thigh: (Math.sin(beat) * THIGH_SWING + THIGH_LEAN) * stride, knee: -(lifted * lifted * KNEE_FOLD + KNEE_REST) * stride };
}

/** A point turned about a pivot on x, as the shader's `swing`: a limb hanging down goes forward (+z) for a positive angle. */
function swing([x, y, z]: readonly number[], [, py, pz]: readonly number[], angle: number): [number, number, number] {
  const [fy, fz] = [y - py, z - pz];
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [x, fy * c + fz * s + py, fz * c - fy * s + pz];
}

/** A walking figure's left sole: its lowest point, and the hip and knee it turns about. */
export interface Sole {
  sole: number[];
  hip: number[];
  knee: number[];
}

/** Finds a figure's left sole on its walking body. */
export function soleOf(spec: FigureSpec): Sole {
  const soup = buildNear(spec, "walk");
  const leftLeg = DRIVES.indexOf("leg-left");
  let found = -1;
  for (let vertex = 0; vertex < soup.vertexCount; vertex++) {
    if (soup.rigs[vertex * 4] !== leftLeg || soup.rigs[vertex * 4 + 1] < 128) continue;
    if (found < 0 || soup.positions[vertex * 3 + 1] < soup.positions[found * 3 + 1]) found = vertex;
  }
  if (found < 0) throw new Error("a walking figure with no left foot");
  const at = (list: readonly number[]) => list.slice(found * 3, found * 3 + 3);
  return { sole: at(soup.positions), hip: at(soup.inners), knee: at(soup.outers) };
}

/** Where the left sole is at a beat, in the figure's own frame (+z ahead). */
export function solePlace(sole: Sole, beat: number, stride: number): [number, number, number] {
  const { thigh, knee } = legAngles(beat, stride);
  return swing(swing(sole.sole, sole.knee, knee), sole.hip, thigh);
}

/** A stride is measured in this many steps of its beat. */
const SAMPLES = 256;

/**
 * How far a figure goes over the ground in one whole stride, so its feet hold still on it: twice how far a foot sweeps,
 * from its furthest forward to its furthest back, since each foot carries the body for half the stride. A shorter
 * stride for someone slowing is near enough a share of a full one.
 */
export function strideM(spec: FigureSpec, stride: number): number {
  const sole = soleOf(spec);
  let [front, back] = [-Infinity, Infinity];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const z = solePlace(sole, (2 * Math.PI * sample) / SAMPLES, stride)[2];
    [front, back] = [Math.max(front, z), Math.min(back, z)];
  }
  return 2 * (front - back);
}
