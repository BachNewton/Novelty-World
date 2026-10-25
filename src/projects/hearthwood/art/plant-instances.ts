import type { Matrix4, Object3D } from "three";
import type { Plant } from "../engine/life";

/*
 * How one plant's numbers become a copy of its design: where it stands and
 * how it is turned, leaned and scaled, and the small shift of colour that
 * keeps a wood of one design from looking stamped.
 *
 * The world's plants live on the GPU as one placing each (`packPlant`): the
 * plant's matrix, column by column, with what else the GPU needs about it in
 * the columns' spare fourth places (a placing's matrix only ever has 0 there,
 * and the shaders read the three columns as directions): which design it is,
 * how far the bands sit where it grows, and its colour shift packed into one
 * number.
 */

/** Sets `dummy` to the plant's placing and returns its matrix. */
export function plantMatrix(p: Plant, dummy: Object3D): Matrix4 {
  const sink = p.kind === "rock" ? p.size * 0.12 : p.kind === "flowers" || p.kind === "fern" ? 0 : 0.12;
  dummy.position.set(p.x, p.y - sink, p.z);
  dummy.rotation.set(Math.cos(p.leanToward) * p.lean, p.turn, Math.sin(p.leanToward) * p.lean);
  if (p.kind === "rock") dummy.scale.set(p.size, p.size * (0.6 + 0.5 * (p.stretch - 0.85)) * 1.4, p.size * p.stretch);
  else dummy.scale.set(p.size / Math.sqrt(p.stretch), p.size * p.stretch, p.size / Math.sqrt(p.stretch));
  dummy.updateMatrix();
  return dummy.matrix;
}

/** The plant's colour shift, as an rgb multiplier written at `at`. */
export function plantColour(p: Plant, out: Float32Array, at: number): void {
  const t = p.tint * (p.kind === "rock" ? 0.4 : 1);
  const bright = 0.92 + 0.08 * Math.sin(p.x * 0.37 + p.z * 0.23);
  out[at] = (1 + 0.12 * t) * bright;
  out[at + 1] = (1 + 0.03 * t) * bright;
  out[at + 2] = (1 - 0.12 * t) * bright;
}

/** The largest colour multiplier a packed colour holds; each channel is kept in 255 steps up to it. */
export const TINT_RANGE = 1.5;

/** Three colour multipliers in one number, each in 255 steps of `TINT_RANGE`: exact in a 32-bit float, which holds whole numbers to 2^24. */
export function packTint(r: number, g: number, b: number): number {
  const step = (v: number) => Math.round((Math.min(Math.max(v, 0), TINT_RANGE) / TINT_RANGE) * 255);
  return step(r) * 65536 + step(g) * 256 + step(b);
}

/** The colour multipliers a packed number holds (the shaders unpack it the same way). */
export function unpackTint(packed: number): [number, number, number] {
  const r = Math.floor(packed / 65536);
  const g = Math.floor(packed / 256) % 256;
  const b = packed % 256;
  return [(r / 255) * TINT_RANGE, (g / 255) * TINT_RANGE, (b / 255) * TINT_RANGE];
}

/** Floats in one plant's placing on the GPU: four columns of four. */
export const PLACING_FLOATS = 16;

const tint = new Float32Array(3);

/** Writes the plant's placing at `at` (see the note at the top): its matrix's columns, with its design, its bands' shift and its colour in their fourth places. */
export function packPlant(p: Plant, design: number, dummy: Object3D, out: Float32Array, at: number): void {
  const m = plantMatrix(p, dummy).elements;
  plantColour(p, tint, 0);
  out.set(m, at);
  out[at + 3] = design;
  out[at + 7] = p.bands;
  out[at + 11] = packTint(tint[0], tint[1], tint[2]);
  out[at + 15] = 1;
}

/** Where each design and detail's drawn copies lie in the one list of them: its first place and how many it has room for. */
export interface Regions {
  start: Uint32Array;
  capacity: Uint32Array;
}

/**
 * Room for each design and detail's drawn copies, given at most how many
 * each can draw: the regions as they are while they hold enough, else laid
 * out again with a quarter more room each, or exactly what is needed where
 * the list would overflow. Null when nothing has to move.
 */
export function layoutRegions(needed: ArrayLike<number>, current: Regions | null, total: number): Regions | null {
  const count = needed.length;
  if (current && Array.from(needed).every((n, i) => n <= current.capacity[i])) return null;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += needed[i];
  if (sum > total) throw new Error(`The plants need room for ${String(sum)} drawn copies, more than the list's ${String(total)}`);
  const roomy = Array.from(needed, (n) => (n === 0 ? 0 : Math.ceil(n * 1.25) + 16));
  const generous = roomy.reduce((a, b) => a + b, 0) <= total;
  const capacity = Uint32Array.from(generous ? roomy : Array.from(needed));
  const start = new Uint32Array(count);
  for (let i = 1; i < count; i++) start[i] = start[i - 1] + capacity[i - 1];
  return { start, capacity };
}
