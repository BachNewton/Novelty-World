/*
 * `art/hash.ts`'s rolls on the CPU, the same bits as the GPU's, with no three.js in them: the simulation and the tile
 * worker read them too.
 */

export const pcgOf = (value: number): number => {
  const state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
};

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
