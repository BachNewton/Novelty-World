import { float, floor, int, uint } from "three/tsl";
import type { Node } from "three/webgpu";

/*
 * Random numbers for shaders that come out the same on every GPU and on the CPU. The usual shader trick, the fraction of
 * sin(x) * 43758, doesn't: it magnifies the last bit of x tens of thousands of times, GPUs work out the sine of
 * a large number each their own way, and a value every pixel of a face should share can reach those pixels a bit
 * apart, so one face rolls a different number at each pixel and sparkles as the camera moves. This is an integer hash
 * (PCG, Jarzynski and Olano's "Hash Functions for GPU Rendering"), whose arithmetic is exact everywhere, fed whole
 * numbers.
 *
 * So a seed is made of whole numbers: a pattern's cell, or a place rounded to the centimetre. A place read in the
 * fragment stage has been interpolated, and on some GPUs isn't quite what was stored, so a model's seed is made in the
 * vertex stage (`varying`), where its attributes are exact: an integer varying reaches every pixel unchanged.
 */

const pcg = (value: Node<"uint">): Node<"uint"> => {
  const state = value.mul(uint(747796405)).add(uint(2891336453));
  const word = state.shiftRight(state.shiftRight(uint(28)).add(uint(4))).bitXor(state).mul(uint(277803737));
  return word.shiftRight(uint(22)).bitXor(word);
};

const pcgOf = (value: number): number => {
  const state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
};

const toBits = (whole: Node<"float">): Node<"uint"> => uint(int(floor(whole)));

/** A seed from whole numbers (a cell of a pattern or a lattice, an index), each floored first. */
export function seedOf(...whole: Node<"float">[]): Node<"uint"> {
  return whole.slice(1).reduce((seed, next) => pcg(seed.bitXor(toBits(next))), pcg(toBits(whole[0])));
}

/** A seed from a place in metres, rounded down to the centimetre. */
export function placeSeed(at: Node<"vec2">): Node<"uint"> {
  return seedOf(at.x.mul(100), at.y.mul(100));
}

/** A number from 0 to 1 from a seed, a different one for each salt. */
export function unitOf(seed: Node<"uint">, salt: number): Node<"float"> {
  return float(pcg(seed.bitXor(uint(pcgOf(salt)))).shiftRight(uint(8))).mul(1 / 2 ** 24);
}

const f = Math.fround;

/** `seedOf` on the CPU: the same bits. */
export function seedOfWhole(...whole: number[]): number {
  return whole.slice(1).reduce((seed, next) => pcgOf((seed ^ Math.floor(next)) >>> 0), pcgOf(Math.floor(whole[0])));
}

/** `placeSeed` on the CPU, from a place as the GPU reads it: 32-bit floats. */
export function placeSeedOf(x: number, z: number): number {
  return seedOfWhole(f(f(x) * 100), f(f(z) * 100));
}

/** `unitOf` on the CPU. */
export function unitOfSeed(seed: number, salt: number): number {
  return (pcgOf((seed ^ pcgOf(salt)) >>> 0) >>> 8) / 2 ** 24;
}
